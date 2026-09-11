import os
import uuid
from datetime import datetime, timezone
from collections.abc import Callable
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jwt import decode as jwt_decode, encode as jwt_encode
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
import bcrypt
from authlib.integrations.httpx_client import OAuth2Client
from .config import get_settings
from .database import Base, engine, get_db
from .models import Category, ClosedDay, Order, OrderItem, Page, Product, ProductVariant, Profile, Review, ShippingZone, StoreSettings, TimeSlot
from .schemas import CategoryIn, CategoryOut, ClosedDayIn, ClosedDayOut, LoginIn, OrderIn, OrderOut, OrderStatusPatch, PageIn, ProductIn, ProductOut, ProfileOut, ProfilePatch, RegisterIn, ReviewIn, ReviewOut, ReviewStatusPatch, SettingsIn, SettingsOut, ShippingZoneIn, ShippingZoneOut, ShippingZonePatch, TimeSlotIn, TimeSlotOut, TimeSlotPatch

settings = get_settings()

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


# Columnas retiradas (sellos artesanal/sustentable y días de anticipación).
# `create_all` crea tablas pero no altera las existentes, así que en bases ya creadas
# quitamos estas columnas al arrancar para que los INSERT no fallen por NOT NULL.
LEGACY_PRODUCT_COLUMNS = ("artisan_seal", "sustainable", "lead_time_days")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            for column in LEGACY_PRODUCT_COLUMNS:
                connection.execute(text(f"ALTER TABLE products DROP COLUMN IF EXISTS {column}"))
    yield


app = FastAPI(title="BOSQUE API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

PUBLIC_STATUSES = ["active", "preorder", "sold_out"]


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
    data.time_slot_label = order.time_slot.label if order.time_slot else None
    data.shipping_zone_name = order.shipping_zone.name if order.shipping_zone else None
    return data


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
        profile = Profile(email=email, name=userinfo.get("name"), google_sub=userinfo.get("sub"), role=role)
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
    profile = Profile(email=email, name=payload.name.strip(), password_hash=hash_password(payload.password), role=role)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return {"token": session_token(profile), "user": ProfileOut.model_validate(profile)}


@app.post("/api/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    profile = db.scalar(select(Profile).where(Profile.email == email))
    if not profile or not profile.password_hash or not verify_password(payload.password, profile.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
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


@app.get("/api/products", response_model=list[ProductOut])
def list_products(include_drafts: bool = False, db: Session = Depends(get_db)):
    query = select(Product).options(selectinload(Product.variants)).order_by(Product.created_at.desc())
    if not include_drafts:
        query = query.where(Product.status.in_(PUBLIC_STATUSES))
    return db.scalars(query).all()


@app.get("/api/products/slug/{slug}", response_model=ProductOut)
def get_product_by_slug(slug: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Product).options(selectinload(Product.variants)).where(Product.slug == slug))
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return item


@app.get("/api/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Product).options(selectinload(Product.variants)).where(Product.id == product_id))
    if not item: raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return item


@app.post("/api/products", response_model=ProductOut, status_code=201, dependencies=[Depends(require_admin)])
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"variants"})
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    product = Product(**data, variants=[ProductVariant(**variant.model_dump()) for variant in payload.variants])
    return commit(db, product)


@app.put("/api/products/{product_id}", response_model=ProductOut, dependencies=[Depends(require_admin)])
def update_product(product_id: str, payload: ProductIn, db: Session = Depends(get_db)):
    product = find_or_404(db, Product, product_id)
    data = payload.model_dump(exclude={"variants"})
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    for key, value in data.items(): setattr(product, key, value)
    product.variants = [ProductVariant(**variant.model_dump()) for variant in payload.variants]
    return commit(db, product)


@app.delete("/api/products/{product_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_product(product_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, Product, product_id)); db.commit(); return Response(status_code=204)


# ── Agenda de pedidos ───────────────────────────────────────────────────────

@app.get("/api/time-slots", response_model=list[TimeSlotOut])
def list_time_slots(db: Session = Depends(get_db)): return db.scalars(select(TimeSlot).order_by(TimeSlot.start_time)).all()


@app.post("/api/time-slots", response_model=TimeSlotOut, status_code=201, dependencies=[Depends(require_admin)])
def create_time_slot(payload: TimeSlotIn, db: Session = Depends(get_db)): return commit(db, TimeSlot(**payload.model_dump()))


@app.patch("/api/time-slots/{slot_id}", response_model=TimeSlotOut, dependencies=[Depends(require_admin)])
def update_time_slot(slot_id: str, payload: TimeSlotPatch, db: Session = Depends(get_db)):
    slot = find_or_404(db, TimeSlot, slot_id); slot.enabled = payload.enabled; return commit(db, slot)


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
    zone = find_or_404(db, ShippingZone, zone_id); zone.active = payload.active; return commit(db, zone)


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


@app.post("/api/orders", response_model=OrderOut, status_code=201)
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
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
        if item.product_id:
            product = db.get(Product, item.product_id)
            if product is None:
                db.rollback()
                raise HTTPException(status_code=409, detail=f"Producto «{item.name}» no encontrado.")
            if not product.allow_backorder and product.inventory < item.quantity:
                db.rollback()
                raise HTTPException(status_code=409, detail=f"Stock insuficiente para «{item.name}».")
            if product.inventory > 0:
                product.inventory = max(0, product.inventory - item.quantity)
                if product.inventory == 0 and not product.allow_backorder:
                    product.status = "sold_out"
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo registrar el pedido.") from error
    order = db.scalar(select(Order).options(selectinload(Order.items), selectinload(Order.time_slot), selectinload(Order.shipping_zone)).where(Order.id == order.id))
    return order_out(order)


@app.patch("/api/orders/{order_id}/status", response_model=OrderOut, dependencies=[Depends(require_admin)])
def update_order_status(order_id: str, payload: OrderStatusPatch, db: Session = Depends(get_db)):
    order = find_or_404(db, Order, order_id); order.status = payload.status; return commit(db, order)


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


# ── Contenido y ajustes ─────────────────────────────────────────────────────

def simple_create(model) -> Callable:
    def endpoint(payload, db: Session = Depends(get_db)): return commit(db, model(**payload.model_dump()))
    return endpoint


@app.post("/api/pages", status_code=201, dependencies=[Depends(require_admin)])
def create_page(payload: PageIn, db: Session = Depends(get_db)): return commit(db, Page(**payload.model_dump()))


@app.get("/api/settings", response_model=SettingsOut)
def get_store_settings(db: Session = Depends(get_db)):
    return db.get(StoreSettings, True) or StoreSettings(id=True)


@app.put("/api/settings", response_model=SettingsOut, dependencies=[Depends(require_admin)])
def update_store_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    record = db.get(StoreSettings, True) or StoreSettings(id=True)
    for key, value in payload.model_dump().items(): setattr(record, key, value)
    return commit(db, record)