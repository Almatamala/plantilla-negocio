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
    inventory: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allow_backorder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    category: Mapped[Optional[Category]] = relationship(back_populates="products")
    reviews: Mapped[list["Review"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class TimeSlot(Base):
    """Franja horaria **de un punto de retiro** (D18): a qué horas y qué días atiende ese punto.

    `weekdays` usa la convención de JavaScript (`Date.getDay()`): `0` domingo … `6` sábado. La
    franja solo se ofrece los días listados, así un punto de encuentro que funciona solo los
    sábados no permite agendar un miércoles.
    """
    __tablename__ = "time_slots"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    zone_id: Mapped[str] = mapped_column(ForeignKey("shipping_zones.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    weekdays: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    zone: Mapped["ShippingZone"] = relationship(back_populates="slots")


class ClosedDay(Base):
    """Días cerrados (fines de semana, feriados, producción intensa)."""
    __tablename__ = "closed_days"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(240))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShippingZone(Base):
    """Puntos donde el cliente retira su pedido (no hay despacho a domicilio, D16).

    `type` distingue **retiro presencial** (en el local) de **punto de encuentro** (Talca o San
    Javier). Cada punto se define por su **ubicación** y sus **franjas horarias** (tabla
    `time_slots`, que cuelga de este punto — D18); el cliente elige cuál y qué día/franja ir a
    buscarlo dentro de las dos semanas siguientes (ver `closed_days` y `closed_weekdays`).
    """
    __tablename__ = "shipping_zones"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="retiro")
    location: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Al eliminar un punto se eliminan sus franjas (misma semántica que la FK ON DELETE CASCADE).
    slots: Mapped[list["TimeSlot"]] = relationship(back_populates="zone", cascade="all, delete-orphan")


class ClosedWeekday(Base):
    """Día de la semana cerrado **todas las semanas** (p. ej. lunes de producción, D19).

    `weekday` sigue la convención de JavaScript: `0` domingo … `6` sábado. El domingo viene
    cargado por defecto en una instalación nueva.
    """
    __tablename__ = "closed_weekdays"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    weekday: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(240))
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
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payment_method: Mapped[Optional[str]] = mapped_column(String(80))
    scheduled_date: Mapped[Optional[date]] = mapped_column(Date)
    time_slot_id: Mapped[Optional[str]] = mapped_column(ForeignKey("time_slots.id", ondelete="SET NULL"))
    fulfillment: Mapped[Optional[str]] = mapped_column(String(20))
    shipping_zone_id: Mapped[Optional[str]] = mapped_column(ForeignKey("shipping_zones.id", ondelete="SET NULL"))
    location: Mapped[Optional[str]] = mapped_column(Text)
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
    bank_account_info: Mapped[Optional[str]] = mapped_column(Text)
    announcement: Mapped[Optional[str]] = mapped_column(String(240))
    hero_title: Mapped[Optional[str]] = mapped_column(String(200))
    hero_description: Mapped[Optional[str]] = mapped_column(Text)
    story_headline: Mapped[Optional[str]] = mapped_column(String(240))
    story_description: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())