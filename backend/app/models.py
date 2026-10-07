import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

UUID = String(36)


def new_id() -> str:
    return str(uuid.uuid4())


class Profile(Base):
    """Usuarios de la tienda: clientes y administradores (login con Google)."""
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(180))
    phone: Mapped[Optional[str]] = mapped_column(String(60))
    # Dirección de envío predeterminada del cliente (D44): el checkout la precarga y el cliente la puede
    # corregir en cada pedido. `city` es la comuna (la cascada país > región > ciudad de Chile).
    address: Mapped[Optional[str]] = mapped_column(String(200))
    region: Mapped[Optional[str]] = mapped_column(String(120))
    city: Mapped[Optional[str]] = mapped_column(String(120))
    google_sub: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="customer")
    # Confirmación de cuenta por correo: código temporal de 6 dígitos, guardado hasheado.
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verification_code_hash: Mapped[Optional[str]] = mapped_column(String(255))
    verification_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verification_sends: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verification_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    category_id: Mapped[Optional[str]] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    images: Mapped[list] = mapped_column(JSON, default=list)
    ingredients: Mapped[Optional[str]] = mapped_column(Text)
    allergens: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Unidades a mano del admin: en una tienda **bajo pedido** el stock no bloquea la compra ni se
    # reserva, solo informa cuánto hay disponible hoy (D3/D35).
    inventory: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Días que tarda preparar el producto antes de poder retirarlo (D35). El checkout empuja el primer
    # día agendable para que el pedido alcance a prepararse.
    preparation_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    category: Mapped[Optional[Category]] = relationship(back_populates="products")
    reviews: Mapped[list["Review"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class TimeSlot(Base):
    """Franja horaria **de un punto de retiro** (D18): a qué horas y qué días atiende ese punto.

    `weekdays` usa la convención de JavaScript (`Date.getDay()`): `0` domingo … `6` sábado. La
    franja solo se ofrece los días listados, así un punto que atiende solo los sábados no permite
    agendar un miércoles. Los **días libres** salen de los días de la franja y de
    las **fechas cerradas** puntuales (`closed_days`); no hay nombre de franja (se nombra por su
    horario).
    """
    __tablename__ = "time_slots"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    zone_id: Mapped[str] = mapped_column(ForeignKey("shipping_zones.id", ondelete="CASCADE"), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    weekdays: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    zone: Mapped["ShippingZone"] = relationship(back_populates="slots")


class ClosedDay(Base):
    """Fecha cerrada puntual (feriados, vacaciones, producción especial)."""
    __tablename__ = "closed_days"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShippingZone(Base):
    """Puntos donde el cliente retira su pedido (no hay despacho a domicilio, D16).

    Todos los puntos son **retiro presencial** (D33): el antiguo «punto de encuentro» era lo mismo
    en la práctica, así que no hay tipo. Cada punto se define por su **ubicación** y sus **franjas
    horarias** (tabla `time_slots`, que cuelga de este punto — D18); el cliente elige cuál y qué
    día/franja ir a buscarlo dentro de las dos semanas siguientes. Los días libres salen de los
    **días de cada franja** más las **fechas cerradas** puntuales (`closed_days`).
    """
    __tablename__ = "shipping_zones"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Al eliminar un punto se eliminan sus franjas (misma semántica que la FK ON DELETE CASCADE).
    slots: Mapped[list["TimeSlot"]] = relationship(back_populates="zone", cascade="all, delete-orphan")


class DeliveryZone(Base):
    """Zona de **envío a domicilio** (D44), aparte de los puntos de retiro presencial.

    La cobertura se define de forma **local** por país > región > ciudad (comuna): el cliente escribe su
    dirección en el checkout y se le aplica la tarifa de la zona que cubra su comuna. La tienda puede
    tener **varias zonas**, cada una con su propia **tarifa** (`fee`) y su propio **límite de cobro**
    (`free_threshold`): desde ese monto el envío es gratis. Mientras no haya ninguna zona activa, el
    envío no se menciona en la tienda (D44).
    """
    __tablename__ = "delivery_zones"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    country: Mapped[str] = mapped_column(String(80), nullable=False, default="Chile")
    region: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    # Tarifa en pesos y monto desde el cual el envío pasa a ser gratis (0 = nunca gratis).
    fee: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    free_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Review(Base):
    """Comentarios de clientes por producto, moderados por el admin."""
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    product: Mapped[Product] = relationship(back_populates="reviews")


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    customer_id: Mapped[Optional[str]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    customer_name: Mapped[Optional[str]] = mapped_column(String(180))
    customer_phone: Mapped[Optional[str]] = mapped_column(String(60))
    customer_email: Mapped[Optional[str]] = mapped_column(String(254))
    # Estados unificados (D37): `paid` y `preparing` se retiraron y quedan en `pending`.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payment_method: Mapped[Optional[str]] = mapped_column(String(80))
    scheduled_date: Mapped[Optional[date]] = mapped_column(Date)
    time_slot_id: Mapped[Optional[str]] = mapped_column(ForeignKey("time_slots.id", ondelete="SET NULL"))
    shipping_zone_id: Mapped[Optional[str]] = mapped_column(ForeignKey("shipping_zones.id", ondelete="SET NULL"))
    location: Mapped[Optional[str]] = mapped_column(Text)
    # Método de entrega (D44): `pickup` (retiro presencial, con su punto y franja) o `delivery` (envío a
    # domicilio, con la dirección y la tarifa de la zona que cubre la comuna). La tarifa se recalcula en
    # la API y queda guardada en `shipping_fee`; el `total` ya la incluye.
    delivery_method: Mapped[str] = mapped_column(String(20), nullable=False, default="pickup")
    shipping_address: Mapped[Optional[str]] = mapped_column(String(200))
    shipping_region: Mapped[Optional[str]] = mapped_column(String(120))
    shipping_city: Mapped[Optional[str]] = mapped_column(String(120))
    shipping_fee: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    time_slot: Mapped[Optional[TimeSlot]] = relationship()
    shipping_zone: Mapped[Optional[ShippingZone]] = relationship()


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[Optional[str]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[Order] = relationship(back_populates="items")


class InstagramToken(Base):
    """Token de larga duración del feed de Instagram propio (D30), en una fila única.

    Vive **aparte** de `store_settings` porque es una credencial, no contenido editable: así no corre el
    riesgo de colarse en `GET /api/settings`, que es público. Lo guarda y lo renueva la tarea de fondo de
    la API (`app/instagram.py`); `INSTAGRAM_ACCESS_TOKEN` queda solo como valor de arranque. La tabla la
    crea `Base.metadata.create_all` al arrancar, así que no necesita ningún `ALTER TABLE`.
    """
    __tablename__ = "instagram_token"
    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    access_token: Mapped[Optional[str]] = mapped_column(String(500))
    refreshed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Motivo de la última renovación fallida, para poder diagnosticarla desde `/api/instagram/token`
    # (el aviso al dueño de que la sección va a dejar de dibujarse).
    last_error: Mapped[Optional[str]] = mapped_column(Text)


class StoreSettings(Base):
    __tablename__ = "store_settings"
    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, default="Tienda Base")
    contact_email: Mapped[Optional[str]] = mapped_column(String(254))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50))
    whatsapp_phone: Mapped[Optional[str]] = mapped_column(String(50))
    instagram_url: Mapped[Optional[str]] = mapped_column(String(300))
    # Paleta de marca editable desde Contenido (D29): cinco tonos hexadecimales nombrados por el uso que
    # tienen en la tienda (`accent`, `ink`, `surface`, `muted`, `detail`). Se guarda como JSON para
    # poder sumar tonos sin migrar la tabla; sin valores guardados, la vista usa la paleta por defecto
    # del frontend (`lib/theme.ts`).
    theme_colors: Mapped[Optional[dict]] = mapped_column(JSON)
    announcement: Mapped[Optional[str]] = mapped_column(String(240))
    hero_title: Mapped[Optional[str]] = mapped_column(String(200))
    hero_description: Mapped[Optional[str]] = mapped_column(Text)
    # Foto de fondo del hero, editable en el **editor visual** de la página (`/admin/editor`, D47/D48).
    # Guarda la URL que devuelve `/api/upload` (o una externa); **sin valor el hero queda sin foto**
    # (A74: el asset de la plantilla `public/hero-bosque.png` dejó de usarse como respaldo).
    hero_image: Mapped[Optional[str]] = mapped_column(String(500))
    # Logo de la tienda en el hero (**opcional**, D49): el círculo de la esquina inferior. Guarda la misma
    # clase de URL que la foto; **sin valor** no se dibuja, así que una tienda sin logo se ve igual que antes.
    hero_logo: Mapped[Optional[str]] = mapped_column(String(500))
    # Forma del marco del logo (D50): `circle` (por defecto), `soft` (bordes difuminados) o `flower`. Solo
    # cambia el recorte de la imagen; la URL sigue en `hero_logo`, así que sin logo la forma no se dibuja.
    hero_logo_shape: Mapped[Optional[str]] = mapped_column(String(20))
    # Encuadre de la foto del hero (D51): el `object-position` de CSS («100% 50%» = borde derecho, el
    # valor por defecto). El editor lo mueve arrastrando la foto, así que una foto apaisada ya no queda
    # fuera de encuadre; sin valor guardado manda el recorte original (`object-right`).
    hero_image_position: Mapped[Optional[str]] = mapped_column(String(20))
    story_headline: Mapped[Optional[str]] = mapped_column(String(240))
    story_description: Mapped[Optional[str]] = mapped_column(Text)
    # Foto de la sección de historia (A76/D53): la convierte en una sección de **about us** —foto de un lado
    # y texto del otro—. Guarda la misma clase de URL que las demás imágenes (`/api/upload` o una externa);
    # **sin valor la sección queda como texto centrado**, igual que antes. La foto va **siempre a la
    # izquierda**: no hay ajuste de lado.
    story_image: Mapped[Optional[str]] = mapped_column(String(500))
    # Textos que el **editor visual** de la página (`/admin/editor`, D38) pasó a editar además del hero y la
    # historia: el **antetítulo** de cada sección y la **bajada** y la **ubicación** del pie. Cada uno es una
    # columna propia, igual que los textos anteriores, para poder editarlos por separado; sin valor guardado
    # la vista usa el texto por defecto del frontend (`lib/store-config.ts`). Las **tarjetas de beneficios**
    # y sus columnas se retiraron con la sección (D54).
    hero_eyebrow: Mapped[Optional[str]] = mapped_column(String(160))
    story_eyebrow: Mapped[Optional[str]] = mapped_column(String(160))
    footer_location: Mapped[Optional[str]] = mapped_column(String(160))
    # Bajada del pie («Repostería artesanal de San Javier y Talca. Pedidos programados con retiro
    # presencial.»), editable en el editor visual (D38) junto con los demás textos de la página.
    footer_tagline: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())