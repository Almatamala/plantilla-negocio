import asyncio
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager, suppress
from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jwt import decode as jwt_decode, encode as jwt_encode
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
import bcrypt
from authlib.integrations.httpx_client import OAuth2Client
from . import instagram
from .config import get_settings
from .database import Base, engine, get_db
from .emails import send_order_confirmation, send_verification_code
from .models import Category, ClosedDay, Order, OrderItem, Product, Profile, Review, ShippingZone, StoreSettings, TimeSlot
from .schemas import CategoryIn, CategoryOut, ClosedDayIn, ClosedDayOut, InstagramFeedOut, InstagramTokenStatusOut, LoginIn, OrderIn, OrderOut, OrderStatusPatch, ProductIn, ProductOut, ProfileOut, ProfilePatch, RegisterIn, ResendCodeIn, ReviewIn, ReviewOut, ReviewStatusPatch, SettingsIn, SettingsOut, ShippingZoneIn, ShippingZoneOut, ShippingZonePatch, TimeSlotIn, TimeSlotOut, TimeSlotPatch, VerifyEmailIn

settings = get_settings()
logger = logging.getLogger("bosque.main")

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SESSION_MAX_AGE_DAYS = 30
GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def google_client() -> OAuth2Client:
    return OAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
        scope="openid email profile",
    )


# Columnas retiradas (sellos artesanal/sustentable, días de anticipación y el «acepta bajo pedido»,
# que ahora es implícito de toda la tienda —D35—). `create_all` crea tablas pero no altera las
# existentes, así que en bases ya creadas quitamos estas columnas al arrancar para que los INSERT no
# fallen por NOT NULL.
LEGACY_PRODUCT_COLUMNS = ("artisan_seal", "sustainable", "lead_time_days", "allow_backorder")

# Puntos de retiro (D16): se retiró el despacho a domicilio (no existe el servicio) y la cobertura
# por áreas; cada punto se define por **ubicación**. La **nota del pedido** también se retiró (D17)
# y el **tipo del punto** y el **tipo de entrega del pedido** se unificaron en retiro presencial
# (D33): `shipping_zones.type` y `orders.fulfillment` se eliminan al arrancar en PostgreSQL.
# Agenda por punto (D18): las franjas cuelgan del punto y guardan sus días; el horario en texto libre
# del punto se retira (se deriva de sus franjas) y las franjas globales viejas se eliminan, porque
# ahora toda franja pertenece a un punto. La franja **no tiene nombre** (se nombra por su horario) y
# los **cierres semanales** (`closed_weekdays`) se retiraron: la disponibilidad sale de los días de
# cada franja más las **fechas cerradas** puntuales (`closed_days`).
# Como `create_all` no altera tablas existentes, se aplica al arrancar en PostgreSQL.
AGENDA_COLUMNS = (
    "ALTER TABLE shipping_zones ADD COLUMN IF NOT EXISTS location TEXT",
    "ALTER TABLE shipping_zones DROP COLUMN IF EXISTS type",
    "ALTER TABLE shipping_zones DROP COLUMN IF EXISTS areas",
    "ALTER TABLE shipping_zones DROP COLUMN IF EXISTS schedule",
    "ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS zone_id VARCHAR(36) REFERENCES shipping_zones(id) ON DELETE CASCADE",
    "ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS weekdays JSON NOT NULL DEFAULT '[]'",
    "ALTER TABLE time_slots DROP COLUMN IF EXISTS label",
    "DROP TABLE IF EXISTS closed_weekdays",
    "ALTER TABLE closed_days DROP COLUMN IF EXISTS reason",
    "DELETE FROM time_slots WHERE zone_id IS NULL",
    "ALTER TABLE orders DROP COLUMN IF EXISTS notes",
    "ALTER TABLE orders DROP COLUMN IF EXISTS fulfillment",
)

# Contenido retirado del catálogo: los campos SEO y el SKU del producto, las **variantes** (tabla
# completa, más su columna en `order_items`) y las **páginas editables** (`pages` y `/api/pages`).
# Ninguno tenía pantalla en el panel ni consumidor en la tienda: el «contenido editable» del plan es
# `store_settings` y el producto no usa variantes (el panel siempre enviaba una lista vacía, D22).
# `create_all` no elimina lo que ya existe, así que se quitan al arrancar en PostgreSQL para que una
# base ya creada quede igual que una nueva. El orden importa: primero la columna que apunta a la tabla.
RETIRED_CATALOG_OBJECTS = (
    "ALTER TABLE order_items DROP COLUMN IF EXISTS variant_id",
    "DROP TABLE IF EXISTS product_variants",
    "ALTER TABLE products DROP COLUMN IF EXISTS sku",
    "ALTER TABLE products DROP COLUMN IF EXISTS seo_title",
    "ALTER TABLE products DROP COLUMN IF EXISTS seo_description",
    "DROP TABLE IF EXISTS pages",
)

# Columnas agregadas después de la primera versión del schema (`create_all` no altera tablas
# existentes). `email_verified` entra con DEFAULT TRUE para que las cuentas ya creadas queden
# confirmadas y solo las nuevas pidan el código de 6 dígitos.
PROFILE_VERIFICATION_COLUMNS = (
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE profiles ALTER COLUMN email_verified SET DEFAULT FALSE",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_code_hash VARCHAR(255)",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_sends INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0",
)

# Contenido de la tienda: la **paleta de marca editable** (D29) vive junto a los demás ajustes de
# `store_settings`; `create_all` no altera tablas existentes, así que se agrega al arrancar en PostgreSQL.
STORE_CONTENT_COLUMNS = (
    "ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS theme_colors JSON",
)

# Ajustes retirados de `store_settings`: los productos por página de «Productos destacados» quedaron
# **fijos en 8** (D26), la **URL del iframe del widget de Instagram** sale al reemplazar el widget de
# terceros por el feed propio con la API de Instagram (D30) y los **datos bancarios** salen porque la
# web dejó de ofrecer transferencia (el pago se coordina por WhatsApp, D34). Así que los tres
# salen del panel y de la API y las columnas se eliminan al arrancar para que una base ya creada quede
# igual que una nueva.
RETIRED_STORE_SETTINGS_COLUMNS = (
    "ALTER TABLE store_settings DROP COLUMN IF EXISTS products_per_page",
    "ALTER TABLE store_settings DROP COLUMN IF EXISTS instagram_embed_url",
    "ALTER TABLE store_settings DROP COLUMN IF EXISTS bank_account_info",
)

# Días de preparación del producto (D35). Como `create_all` no altera tablas existentes, la columna
# se agrega al arrancar en PostgreSQL. La **reserva de stock** de pedidos pendientes se retiró: la
# tienda es «bajo pedido», el pedido ya no descuenta stock ni vence, y `orders.expires_at` se elimina.
ORDER_PREPARATION_COLUMNS = (
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_days INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE orders DROP COLUMN IF EXISTS expires_at",
)

# El producto tiene **dos estados**: `active` (visible en la tienda) e `inactive` (oculto en la tienda
# pero visible en el panel de inventario). Los estados retirados (`draft`, `sold_out`, `preorder`) se
# convierten a `active` al arrancar para que ningún producto quede oculto por sorpresa.
PRODUCT_STATUS_STATEMENTS = (
    "UPDATE products SET status = 'active' WHERE status NOT IN ('active', 'inactive')",
)

# Estados del pedido (D37): `paid` y `preparing` se unifican en `pending` porque un pedido en
# preparación ya está pagado (por la web o por un acuerdo hablado cargado en el panel). Los pedidos
# guardados en esos estados se convierten a `pending` al arrancar, como con los estados del producto.
ORDER_STATUS_STATEMENTS = (
    "UPDATE orders SET status = 'pending' WHERE status IN ('paid', 'preparing')",
)

VERIFICATION_TTL_MINUTES = 15
VERIFICATION_RESEND_SECONDS = 60
VERIFICATION_MAX_SENDS = 4  # envío inicial + 3 reenvíos
VERIFICATION_MAX_ATTEMPTS = 5


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            for column in LEGACY_PRODUCT_COLUMNS:
                connection.execute(text(f"ALTER TABLE products DROP COLUMN IF EXISTS {column}"))
            for statement in PROFILE_VERIFICATION_COLUMNS:
                connection.execute(text(statement))
            for statement in STORE_CONTENT_COLUMNS:
                connection.execute(text(statement))
            for statement in AGENDA_COLUMNS:
                connection.execute(text(statement))
            for statement in RETIRED_CATALOG_OBJECTS:
                connection.execute(text(statement))
            for statement in RETIRED_STORE_SETTINGS_COLUMNS:
                connection.execute(text(statement))
            for statement in ORDER_PREPARATION_COLUMNS:
                connection.execute(text(statement))
            for statement in PRODUCT_STATUS_STATEMENTS:
                connection.execute(text(statement))
            for statement in ORDER_STATUS_STATEMENTS:
                connection.execute(text(statement))
    # Renovación automática del token de Instagram (D30): la tarea revisa cada pocas horas y renueva el
    # token de 60 días antes de que venza. Se cancela al apagar para no dejar nada colgado.
    refresh_task = asyncio.create_task(instagram.refresh_loop(lambda: Session(engine)))
    try:
        yield
    finally:
        refresh_task.cancel()
        with suppress(asyncio.CancelledError):
            await refresh_task


app = FastAPI(title="BOSQUE API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Solo los productos `active` son visibles en la tienda; los `inactive` quedan para el panel.
PUBLIC_STATUSES = ["active"]


def google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret and settings.google_redirect_uri)


def session_token(profile) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {"sub": profile.id, "role": profile.role, "iat": now, "exp": now + SESSION_MAX_AGE_DAYS * 86400}
    return jwt_encode(payload, settings.auth_jwt_secret, algorithm="HS256")


def verify_session_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt_decode(token, settings.auth_jwt_secret, algorithms=["HS256"])
    except Exception:
        return None


def bearer_token(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(moment: datetime | None) -> bool:
    """Compara fechas sin importar si la base las devuelve con o sin zona horaria."""
    if not moment:
        return True
    reference = now_utc().replace(tzinfo=None) if moment.tzinfo is None else now_utc()
    return moment < reference


def seconds_since(moment: datetime | None) -> float | None:
    if not moment:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return (now_utc() - moment).total_seconds()


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verification_required() -> bool:
    """Solo se exige confirmar el correo si hay proveedor de correo configurado (Resend)."""
    return settings.email_verification_enabled


def start_email_verification(profile: Profile, db: Session) -> bool:
    """Genera un código nuevo, lo guarda hasheado y envía el correo de confirmación."""
    code = generate_verification_code()
    profile.verification_code_hash = hash_code(code)
    profile.verification_expires_at = now_utc() + timedelta(minutes=VERIFICATION_TTL_MINUTES)
    profile.verification_sent_at = now_utc()
    profile.verification_sends = (profile.verification_sends or 0) + 1
    profile.verification_attempts = 0
    db.commit()
    return send_verification_code(
        to=profile.email,
        name=profile.name or "",
        code=code,
        store_name=settings.store_name,
        store_url=settings.store_url,
        api_key=settings.resend_api_key,
        sender=settings.resend_email_from,
        api_url=settings.resend_api_url,
    )


def require_admin(
    x_admin_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> None:
    if x_admin_token == settings.api_admin_token:
        return
    payload = verify_session_token(bearer_token(authorization))
    if payload and payload.get("role") == "admin":
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de administrador inválido.")


def commit(db: Session, entity):
    try:
        db.add(entity); db.commit(); db.refresh(entity)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un registro con ese identificador único.") from error
    return entity


def find_or_404(db: Session, model, entity_id: str):
    item = db.get(model, entity_id)
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")
    return item


def order_out(order: Order) -> OrderOut:
    data = OrderOut.model_validate(order)
    data.time_slot_label = f"{order.time_slot.start_time}–{order.time_slot.end_time}" if order.time_slot else None
    data.shipping_zone_name = order.shipping_zone.name if order.shipping_zone else None
    return data


def notify_order_created(db: Session, order: Order, out: OrderOut) -> None:
    """Avisa del pedido nuevo al **cliente** (correo del checkout) y a la **tienda** (Contenido › correo).

    Es de **mejor esfuerzo**: sin Resend configurado se omite (queda en el log) y cualquier fallo se
    registra, pero nunca tumba el registro del pedido. La tienda usa el correo de contacto de
    `store_settings`; el cliente, el que dejó en el checkout.
    """
    store = db.get(StoreSettings, True)
    try:
        send_order_confirmation(
            order_id=order.id[:8].upper(),
            customer_name=order.customer_name or "",
            customer_phone=order.customer_phone or "",
            customer_email=order.customer_email or "",
            items=[{"name": item.name, "quantity": item.quantity, "unit_price": item.unit_price} for item in order.items],
            total=order.total,
            scheduled_date=order.scheduled_date.isoformat() if order.scheduled_date else "",
            time_slot=out.time_slot_label or "",
            place=out.shipping_zone_name or order.location or "",
            payment_method=order.payment_method or "",
            store_name=settings.store_name,
            store_url=settings.store_url,
            store_email=(store.contact_email if store else None) or "",
            api_key=settings.resend_api_key,
            sender=settings.resend_email_from,
            api_url=settings.resend_api_url,
        )
    except Exception:  # noqa: BLE001 — un correo caído no puede tumbar la compra
        logger.exception("No se pudo enviar la confirmación del pedido %s", order.id)


@app.get("/health")
def health() -> dict[str, str]: return {"status": "ok"}


# ── Autenticación (Google OAuth + sesión JWT) ───────────────────────────────

@app.get("/api/auth/google/authorize")
def google_authorize():
    if not google_configured():
        raise HTTPException(status_code=503, detail="El login con Google no está configurado (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI).")
    state = jwt_encode(
        {"state": uuid.uuid4().hex, "exp": int(datetime.now(timezone.utc).timestamp()) + 600},
        settings.auth_jwt_secret,
        algorithm="HS256",
    )
    url, _ = google_client().create_authorization_url(GOOGLE_AUTHORIZE_URL, state=state)
    return {"url": url}


@app.get("/api/auth/google/callback")
def google_callback(code: str, state: str | None = None, db: Session = Depends(get_db)):
    if not google_configured():
        raise HTTPException(status_code=503, detail="El login con Google no está configurado (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI).")
    if not state or not verify_session_token(state):
        raise HTTPException(status_code=400, detail="Parámetro de seguridad inválido. Intenta iniciar sesión nuevamente.")
    try:
        client = google_client()
        client.fetch_token(
            GOOGLE_TOKEN_URL,
            authorization_response=f"{settings.google_redirect_uri}?code={code}&state={state}",
        )
        userinfo = client.get(GOOGLE_USERINFO_URL).json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="No se pudo validar el código de Google. Intenta nuevamente.") from error
    email = (userinfo.get("email") or "").strip().lower()
    if not email or not userinfo.get("email_verified"):
        raise HTTPException(status_code=403, detail="La cuenta de Google no tiene un correo verificado.")
    profile = db.scalar(select(Profile).where(Profile.email == email))
    if profile is None:
        role = "admin" if email in settings.admin_email_list else "customer"
        profile = Profile(email=email, name=userinfo.get("name"), google_sub=userinfo.get("sub"), role=role, email_verified=True)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    else:
        if email in settings.admin_email_list:
            profile.role = "admin"
        if userinfo.get("name"):
            profile.name = userinfo.get("name")
        if userinfo.get("sub"):
            profile.google_sub = userinfo.get("sub")
        db.commit()
        db.refresh(profile)
    return {"token": session_token(profile), "user": ProfileOut.model_validate(profile)}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.scalar(select(Profile).where(Profile.email == email)):
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")
    role = "admin" if email in settings.admin_email_list else "customer"
    needs_verification = verification_required()
    profile = Profile(
        email=email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role=role,
        email_verified=not needs_verification,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    if not needs_verification:
        # Sin proveedor de correo configurado no hay forma de verificar: la cuenta entra
        # activa para no dejar la tienda sin acceso (D14).
        return {
            "token": session_token(profile),
            "user": ProfileOut.model_validate(profile),
            "verification_required": False,
            "message": "Cuenta creada. La confirmación por correo está desactivada (falta configurar Resend).",
        }
    sent = start_email_verification(profile, db)
    return {
        "verification_required": True,
        "email": profile.email,
        "sent": sent,
        "message": (
            f"Te enviamos un código de 6 dígitos a {profile.email}."
            if sent
            else "Creamos tu cuenta, pero no pudimos enviar el correo de confirmación. Pide un código nuevo en unos minutos."
        ),
    }


@app.post("/api/auth/verify-email")
def verify_email(payload: VerifyEmailIn, db: Session = Depends(get_db)):
    """Confirma la cuenta con el código temporal de 6 dígitos y emite la sesión."""
    profile = db.scalar(select(Profile).where(Profile.email == payload.email.strip().lower()))
    invalid = HTTPException(status_code=400, detail="El código es incorrecto o ya venció. Pide uno nuevo.")
    if not profile or not profile.verification_code_hash:
        raise invalid
    if profile.email_verified:
        return {"token": session_token(profile), "user": ProfileOut.model_validate(profile)}
    if (profile.verification_attempts or 0) >= VERIFICATION_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Demasiados intentos con este código. Pide uno nuevo.")
    if is_expired(profile.verification_expires_at):
        raise invalid
    if not verify_password(payload.code, profile.verification_code_hash):
        profile.verification_attempts = (profile.verification_attempts or 0) + 1
        db.commit()
        raise invalid
    profile.email_verified = True
    profile.verification_code_hash = None
    profile.verification_expires_at = None
    profile.verification_attempts = 0
    db.commit()
    db.refresh(profile)
    return {"token": session_token(profile), "user": ProfileOut.model_validate(profile)}


@app.post("/api/auth/resend-code")
def resend_code(payload: ResendCodeIn, db: Session = Depends(get_db)):
    """Reenvía el código (máx. 3 reenvíos y con una espera mínima entre envíos)."""
    profile = db.scalar(select(Profile).where(Profile.email == payload.email.strip().lower()))
    generic = {"ok": True, "message": "Si el correo está registrado, te enviamos un código nuevo."}
    if not profile or profile.email_verified or not verification_required():
        return generic
    elapsed = seconds_since(profile.verification_sent_at)
    if elapsed is not None and elapsed < VERIFICATION_RESEND_SECONDS:
        wait = int(VERIFICATION_RESEND_SECONDS - elapsed) + 1
        raise HTTPException(status_code=429, detail=f"Espera {wait} segundos antes de pedir otro código.")
    if (profile.verification_sends or 0) >= VERIFICATION_MAX_SENDS:
        raise HTTPException(status_code=429, detail="Alcanzaste el máximo de códigos. Escríbenos por WhatsApp y te ayudamos.")
    sent = start_email_verification(profile, db)
    return {**generic, "sent": sent}


@app.post("/api/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    profile = db.scalar(select(Profile).where(Profile.email == email))
    if not profile or not profile.password_hash or not verify_password(payload.password, profile.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
    if not profile.email_verified and verification_required():
        raise HTTPException(status_code=403, detail="Tu correo aún no está confirmado. Revisa el código que te enviamos.")
    return {"token": session_token(profile), "user": ProfileOut.model_validate(profile)}


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    payload = verify_session_token(bearer_token(authorization))
    if not payload:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada.")
    profile = db.get(Profile, payload.get("sub"))
    if not profile:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada.")
    return ProfileOut.model_validate(profile)


@app.patch("/api/auth/me")
def update_me(payload: ProfilePatch, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    session = verify_session_token(bearer_token(authorization))
    if not session:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada.")
    profile = db.get(Profile, session.get("sub"))
    if not profile:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada.")
    if payload.name is not None:
        profile.name = payload.name.strip() or None
    if payload.phone is not None:
        profile.phone = payload.phone.strip() or None
    db.commit()
    db.refresh(profile)
    return ProfileOut.model_validate(profile)


# ── Catálogo ────────────────────────────────────────────────────────────────

@app.get("/api/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)): return db.scalars(select(Category).order_by(Category.name)).all()


@app.post("/api/categories", response_model=CategoryOut, status_code=201, dependencies=[Depends(require_admin)])
def create_category(payload: CategoryIn, db: Session = Depends(get_db)): return commit(db, Category(**payload.model_dump()))


@app.put("/api/categories/{category_id}", response_model=CategoryOut, dependencies=[Depends(require_admin)])
def update_category(category_id: str, payload: CategoryIn, db: Session = Depends(get_db)):
    category = find_or_404(db, Category, category_id)
    for field, value in payload.model_dump().items():
        setattr(category, field, value)
    return commit(db, category)


@app.delete("/api/categories/{category_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_category(category_id: str, db: Session = Depends(get_db)):
    """Elimina la categoría; sus productos quedan «Sin categoría» (category_id = NULL)."""
    category = find_or_404(db, Category, category_id)
    for product in db.scalars(select(Product).where(Product.category_id == category_id)).all():
        product.category_id = None
    db.delete(category)
    db.commit()
    return Response(status_code=204)


@app.get("/api/products", response_model=list[ProductOut])
def list_products(include_inactive: bool = False, db: Session = Depends(get_db)):
    """Catálogo. Por defecto solo lo visible en la tienda (`active`); el panel pide `include_inactive=true`."""
    query = select(Product).order_by(Product.created_at.desc())
    if not include_inactive:
        query = query.where(Product.status.in_(PUBLIC_STATUSES))
    return db.scalars(query).all()


@app.get("/api/products/slug/{slug}", response_model=ProductOut)
def get_product_by_slug(slug: str, db: Session = Depends(get_db)):
    """Ficha pública: un producto `inactive` no se muestra en la tienda, así que por URL tampoco."""
    item = db.scalar(select(Product).where(Product.slug == slug, Product.status.in_(PUBLIC_STATUSES)))
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return item


@app.get("/api/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Product).where(Product.id == product_id))
    if not item: raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return item


@app.post("/api/products", response_model=ProductOut, status_code=201, dependencies=[Depends(require_admin)])
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    return commit(db, Product(**data))


@app.put("/api/products/{product_id}", response_model=ProductOut, dependencies=[Depends(require_admin)])
def update_product(product_id: str, payload: ProductIn, db: Session = Depends(get_db)):
    product = find_or_404(db, Product, product_id)
    data = payload.model_dump()
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    for key, value in data.items(): setattr(product, key, value)
    return commit(db, product)


@app.delete("/api/products/{product_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_product(product_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, Product, product_id)); db.commit(); return Response(status_code=204)


# ── Agenda de pedidos ───────────────────────────────────────────────────────

def slot_out(slot: TimeSlot) -> TimeSlotOut:
    data = TimeSlotOut.model_validate(slot)
    data.zone_name = slot.zone.name if slot.zone else None
    return data


@app.get("/api/time-slots", response_model=list[TimeSlotOut])
def list_time_slots(zone_id: str | None = None, include_disabled: bool = False, db: Session = Depends(get_db)):
    """Franjas horarias por punto de retiro (D18). Sin `zone_id` devuelve las de todos los puntos."""
    query = select(TimeSlot).options(selectinload(TimeSlot.zone)).order_by(TimeSlot.start_time)
    if zone_id: query = query.where(TimeSlot.zone_id == zone_id)
    if not include_disabled: query = query.where(TimeSlot.enabled.is_(True))
    return [slot_out(slot) for slot in db.scalars(query).all()]


@app.post("/api/time-slots", response_model=TimeSlotOut, status_code=201, dependencies=[Depends(require_admin)])
def create_time_slot(payload: TimeSlotIn, db: Session = Depends(get_db)):
    find_or_404(db, ShippingZone, payload.zone_id)  # la franja siempre cuelga de un punto
    return slot_out(commit(db, TimeSlot(**payload.model_dump())))


@app.patch("/api/time-slots/{slot_id}", response_model=TimeSlotOut, dependencies=[Depends(require_admin)])
def update_time_slot(slot_id: str, payload: TimeSlotPatch, db: Session = Depends(get_db)):
    """Edición parcial: solo se aplican los campos enviados (los `null` se ignoran)."""
    slot = find_or_404(db, TimeSlot, slot_id)
    changes = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if changes.get("zone_id"): find_or_404(db, ShippingZone, changes["zone_id"])
    for key, value in changes.items():
        setattr(slot, key, value)
    return slot_out(commit(db, slot))


@app.delete("/api/time-slots/{slot_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_time_slot(slot_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, TimeSlot, slot_id)); db.commit(); return Response(status_code=204)


@app.get("/api/closed-days", response_model=list[ClosedDayOut])
def list_closed_days(db: Session = Depends(get_db)): return db.scalars(select(ClosedDay).order_by(ClosedDay.date)).all()


@app.post("/api/closed-days", response_model=ClosedDayOut, status_code=201, dependencies=[Depends(require_admin)])
def create_closed_day(payload: ClosedDayIn, db: Session = Depends(get_db)): return commit(db, ClosedDay(**payload.model_dump()))


@app.delete("/api/closed-days/{day_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_closed_day(day_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, ClosedDay, day_id)); db.commit(); return Response(status_code=204)


@app.get("/api/shipping-zones", response_model=list[ShippingZoneOut])
def list_shipping_zones(include_inactive: bool = False, db: Session = Depends(get_db)):
    query = select(ShippingZone).order_by(ShippingZone.name)
    if not include_inactive: query = query.where(ShippingZone.active.is_(True))
    return db.scalars(query).all()


@app.post("/api/shipping-zones", response_model=ShippingZoneOut, status_code=201, dependencies=[Depends(require_admin)])
def create_shipping_zone(payload: ShippingZoneIn, db: Session = Depends(get_db)): return commit(db, ShippingZone(**payload.model_dump()))


@app.patch("/api/shipping-zones/{zone_id}", response_model=ShippingZoneOut, dependencies=[Depends(require_admin)])
def update_shipping_zone(zone_id: str, payload: ShippingZonePatch, db: Session = Depends(get_db)):
    """Edición parcial: solo se aplican los campos enviados (los `null` se ignoran, salvo
    `location`, que se puede vaciar enviándola en `null`)."""
    zone = find_or_404(db, ShippingZone, zone_id)
    changes = payload.model_dump(exclude_unset=True)
    if "location" in changes and not changes["location"]:
        zone.location = None
    for key, value in changes.items():
        if value is not None: setattr(zone, key, value)
    return commit(db, zone)


@app.delete("/api/shipping-zones/{zone_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_shipping_zone(zone_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, ShippingZone, zone_id)); db.commit(); return Response(status_code=204)


# ── Reviews / comentarios ───────────────────────────────────────────────────

@app.get("/api/reviews", response_model=list[ReviewOut])
def list_public_reviews(product_id: str | None = None, db: Session = Depends(get_db)):
    query = select(Review).options(selectinload(Review.product)).where(Review.status == "approved").order_by(Review.created_at.desc())
    if product_id: query = query.where(Review.product_id == product_id)
    return [_review_out(r) for r in db.scalars(query).all()]


@app.get("/api/reviews/admin", response_model=list[ReviewOut], dependencies=[Depends(require_admin)])
def list_all_reviews(db: Session = Depends(get_db)):
    return [_review_out(r) for r in db.scalars(select(Review).options(selectinload(Review.product)).order_by(Review.created_at.desc())).all()]


@app.post("/api/reviews", response_model=ReviewOut, status_code=201)
def create_review(payload: ReviewIn, db: Session = Depends(get_db)):
    find_or_404(db, Product, payload.product_id)
    return commit(db, Review(**payload.model_dump(), status="pending"))


@app.patch("/api/reviews/{review_id}/status", response_model=ReviewOut, dependencies=[Depends(require_admin)])
def update_review_status(review_id: str, payload: ReviewStatusPatch, db: Session = Depends(get_db)):
    review = find_or_404(db, Review, review_id); review.status = payload.status; return commit(db, review)


@app.delete("/api/reviews/{review_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_review(review_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, Review, review_id)); db.commit(); return Response(status_code=204)


def _review_out(review: Review) -> ReviewOut:
    data = ReviewOut.model_validate(review)
    data.product_name = review.product.name if review.product else None
    return data


# ── Órdenes ─────────────────────────────────────────────────────────────────

@app.get("/api/orders", response_model=list[OrderOut], dependencies=[Depends(require_admin)])
def list_orders(db: Session = Depends(get_db)):
    rows = db.scalars(select(Order).options(selectinload(Order.items), selectinload(Order.time_slot), selectinload(Order.shipping_zone)).order_by(Order.created_at.desc())).all()
    return [order_out(o) for o in rows]


def validate_schedule(db: Session, payload: OrderIn) -> None:
    """Verifica que la franja exista, esté habilitada, sea del punto elegido y aplique a ese día.

    Las **fechas cerradas** puntuales son una regla de disponibilidad de la tienda: el checkout no
    ofrece esos días, pero el admin puede registrar un pedido fuera de agenda (p. ej. una excepción
    acordada).
    """
    if not payload.time_slot_id:
        return
    slot = db.get(TimeSlot, payload.time_slot_id)
    if not slot:
        raise HTTPException(status_code=409, detail="La franja horaria elegida no existe.")
    if not slot.enabled:
        raise HTTPException(status_code=409, detail="La franja horaria elegida no está disponible.")
    if payload.shipping_zone_id and slot.zone_id != payload.shipping_zone_id:
        raise HTTPException(status_code=409, detail="La franja horaria no pertenece al punto de retiro elegido.")
    if payload.scheduled_date:
        weekday = (payload.scheduled_date.weekday() + 1) % 7  # 0 domingo … 6 sábado
        if weekday not in (slot.weekdays or []):
            raise HTTPException(status_code=409, detail="La franja horaria no está disponible ese día de la semana.")


@app.post("/api/orders", response_model=OrderOut, status_code=201)
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
    validate_schedule(db, payload)
    total = sum(item.unit_price * item.quantity for item in payload.items)
    customer_profile = None
    if payload.customer_email:
        customer_profile = db.scalar(select(Profile).where(Profile.email == payload.customer_email.strip().lower()))
    order = Order(**payload.model_dump(exclude={"items", "customer_id"}), total=total)
    if customer_profile:
        order.customer_id = customer_profile.id
    elif payload.customer_id:
        if db.get(Profile, payload.customer_id) is None:
            db.rollback()
            raise HTTPException(status_code=409, detail="Cliente no encontrado.")
        order.customer_id = payload.customer_id
    db.add(order)
    db.flush()
    for item in payload.items:
        db.add(OrderItem(order_id=order.id, **item.model_dump()))
        if item.product_id and db.get(Product, item.product_id) is None:
            # La tienda es «bajo pedido»: el stock no bloquea la compra, solo se valida que el producto
            # exista (el catálogo pudo cambiar entre que el cliente armó el carrito y confirmó).
            db.rollback()
            raise HTTPException(status_code=409, detail=f"Producto «{item.name}» no encontrado.")
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo registrar el pedido.") from error
    order = db.scalar(select(Order).options(selectinload(Order.items), selectinload(Order.time_slot), selectinload(Order.shipping_zone)).where(Order.id == order.id))
    out = order_out(order)
    notify_order_created(db, order, out)
    return out


@app.patch("/api/orders/{order_id}/status", response_model=OrderOut, dependencies=[Depends(require_admin)])
def update_order_status(order_id: str, payload: OrderStatusPatch, db: Session = Depends(get_db)):
    """Cambia el estado del pedido. No toca el stock: la tienda trabaja **bajo pedido** (D35)."""
    order = find_or_404(db, Order, order_id)
    order.status = payload.status
    return commit(db, order)


@app.put("/api/orders/{order_id}", response_model=OrderOut, dependencies=[Depends(require_admin)])
def update_order(order_id: str, payload: OrderIn, db: Session = Depends(get_db)):
    """Corrige los datos de un pedido. No toca el stock ni el estado (el estado se cambia en su endpoint)."""
    order = find_or_404(db, Order, order_id)
    total = sum(item.unit_price * item.quantity for item in payload.items)
    for key, value in payload.model_dump(exclude={"items", "customer_id", "status"}).items():
        setattr(order, key, value)
    order.total = total
    order.items = [OrderItem(**item.model_dump()) for item in payload.items]
    db.commit()
    order = db.scalar(select(Order).options(selectinload(Order.items), selectinload(Order.time_slot), selectinload(Order.shipping_zone)).where(Order.id == order_id))
    return order_out(order)


@app.get("/api/orders/me")
def my_orders(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    session = verify_session_token(bearer_token(authorization))
    if not session:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada.")
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.time_slot), selectinload(Order.shipping_zone))
        .where(Order.customer_id == session.get("sub"))
        .order_by(Order.created_at.desc())
    ).all()
    return [order_out(o) for o in rows]


# ── Imágenes ────────────────────────────────────────────────────────────────

@app.post("/api/upload", dependencies=[Depends(require_admin)])
async def upload_image(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1][:10].lower()
    name = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as handle:
        handle.write(await file.read())
    return {"url": f"/uploads/{name}"}


# ── Feed de Instagram propio (D30) ──────────────────────────────────────────

INSTAGRAM_DEFAULT_LIMIT = 15
INSTAGRAM_MAX_LIMIT = 50


@app.get("/api/instagram/feed", response_model=InstagramFeedOut)
def instagram_feed(limit: int = INSTAGRAM_DEFAULT_LIMIT, db: Session = Depends(get_db)):
    """Últimas publicaciones ya normalizadas para el widget de la tienda (`lib/instagram.ts`).

    Es público (lo consume la tienda) y **nunca devuelve el token**: el token vive en este proceso y la
    respuesta solo trae imagen, enlace, descripción, likes y comentarios. Sin credenciales la sección no
    se dibuja y la respuesta es `configured: false`, que no es un error.
    """
    limit = max(1, min(limit, INSTAGRAM_MAX_LIMIT))
    if not instagram.feed_configured(db):
        return InstagramFeedOut(configured=False, posts=[])
    try:
        posts = instagram.fetch_posts(db, limit)
    except instagram.InstagramError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo leer el feed de Instagram: {error}") from error
    return InstagramFeedOut(configured=True, posts=posts)


def instagram_status(db: Session) -> InstagramTokenStatusOut:
    """Estado del token para diagnosticar la renovación automática (el token en sí no sale de acá)."""
    row = instagram.stored_token(db)
    token, source = instagram.current_token(db)
    refreshed = instagram.as_utc(row.refreshed_at)
    return InstagramTokenStatusOut(
        configured=bool(token) and bool(settings.instagram_user_id.strip()),
        user_id=settings.instagram_user_id.strip() or None,
        source=source if token else None,
        refreshed_at=refreshed,
        next_refresh_at=refreshed + timedelta(days=settings.instagram_refresh_days) if refreshed else None,
        last_error=row.last_error,
    )


@app.get("/api/instagram/token", response_model=InstagramTokenStatusOut, dependencies=[Depends(require_admin)])
def instagram_token_status(db: Session = Depends(get_db)):
    """Cuándo se renovó el token y cuándo tocará, más el motivo del último fallo (solo admin)."""
    return instagram_status(db)


@app.post("/api/instagram/refresh", response_model=InstagramTokenStatusOut, dependencies=[Depends(require_admin)])
def instagram_refresh(db: Session = Depends(get_db)):
    """Fuerza la renovación: el mismo trabajo que hace la tarea de fondo, para probarlo o adelantarlo."""
    try:
        instagram.refresh_token(db)
    except instagram.InstagramError as error:
        # Mismo comportamiento que la tarea de fondo: el motivo queda guardado para poder mostrarlo.
        row = instagram.stored_token(db)
        row.last_error = str(error)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo renovar el token de Instagram: {error}") from error
    return instagram_status(db)


# ── Contenido y ajustes ─────────────────────────────────────────────────────

@app.get("/api/settings", response_model=SettingsOut)
def get_store_settings(db: Session = Depends(get_db)):
    # La fila de ajustes es única y puede no existir todavía en una instalación nueva. Si falta se crea
    # con sus valores por defecto: antes se devolvía un objeto sin `name` ni `updated_at` y el GET
    # fallaba con 500 hasta que alguien guardara desde el panel.
    exists = db.get(StoreSettings, True)
    return exists if exists is not None else commit(db, StoreSettings(id=True))


@app.put("/api/settings", response_model=SettingsOut, dependencies=[Depends(require_admin)])
def update_store_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    record = db.get(StoreSettings, True) or StoreSettings(id=True)
    for key, value in payload.model_dump().items(): setattr(record, key, value)
    return commit(db, record)