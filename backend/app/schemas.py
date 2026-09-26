import re
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

ProductStatus = Literal["active", "inactive"]
# Estados del pedido (D37): un pedido en preparación ya está pagado (por la web o por un acuerdo
# hablado cargado en el panel), así que `paid` y `preparing` sobraban y quedan unificados en `pending`.
OrderStatus = Literal["pending", "shipped", "delivered", "cancelled", "refunded"]
ReviewStatus = Literal["pending", "approved", "rejected"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProfileOut(ORMModel):
    id: str
    name: str | None
    phone: str | None
    email: str
    role: str
    email_verified: bool = False
    created_at: datetime


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=180)
    phone: str | None = Field(default=None, max_length=60)


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


class VerifyEmailIn(BaseModel):
    """Código temporal de 6 dígitos que llega por correo al crear la cuenta."""
    email: str = Field(max_length=254)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResendCodeIn(BaseModel):
    email: str = Field(max_length=254)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=140)


class CategoryOut(CategoryIn, ORMModel):
    id: str
    created_at: datetime


class ProductIn(BaseModel):
    category_id: str | None = None
    name: str = Field(min_length=1, max_length=180)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)
    description: str | None = None
    price: int = Field(ge=0)
    image_url: str | None = None
    images: list[str] = Field(default_factory=list)
    ingredients: str | None = None
    allergens: list[str] = Field(default_factory=list)
    # Solo dos estados: `active` (visible en la tienda) e `inactive` (oculto en la tienda, visible en el panel).
    status: ProductStatus = "active"
    inventory: int = Field(default=0, ge=0)
    # Días de preparación antes de poder retirar el pedido (D35). En esta plantilla todo se hace
    # **bajo pedido**, así que la compra nunca se bloquea por stock.
    preparation_days: int = Field(default=0, ge=0)


class ProductOut(ProductIn, ORMModel):
    id: str
    created_at: datetime
    updated_at: datetime


class TimeSlotIn(BaseModel):
    # La franja pertenece a un punto de retiro (D18) y solo aplica los días de `weekdays`
    # (0 domingo … 6 sábado, convención de JavaScript). No tiene nombre: se nombra por su horario
    # (los días libres son, además, las fechas cerradas puntuales de `closed_days`).
    zone_id: str
    start_time: str = Field(min_length=4, max_length=10)
    end_time: str = Field(min_length=4, max_length=10)
    # Toda franja debe decir al menos un día: sin días no se puede agendar nada con ella.
    weekdays: list[int] = Field(min_length=1, max_length=7)
    enabled: bool = True

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Los días deben estar entre 0 (domingo) y 6 (sábado).")
        return sorted(set(value))


class TimeSlotPatch(BaseModel):
    """Edición parcial: solo se aplican los campos enviados."""
    zone_id: str | None = None
    start_time: str | None = Field(default=None, min_length=4, max_length=10)
    end_time: str | None = Field(default=None, min_length=4, max_length=10)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    enabled: bool | None = None

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Los días deben estar entre 0 (domingo) y 6 (sábado).")
        return sorted(set(value))


class TimeSlotOut(TimeSlotIn, ORMModel):
    id: str
    created_at: datetime
    zone_name: str | None = None


class ClosedDayIn(BaseModel):
    """Fecha cerrada puntual. Sin motivo: la fecha se explica sola y el formulario era más ruido que ayuda."""
    date: date


class ClosedDayOut(ClosedDayIn, ORMModel):
    id: str
    created_at: datetime


# Punto de retiro presencial (D33): retiro y punto de encuentro eran lo mismo en la práctica, así
# que el punto no tiene tipo. Se define por su nombre, su ubicación y sus franjas.
class ShippingZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    location: str | None = Field(default=None, max_length=300)
    active: bool = True


class ShippingZonePatch(BaseModel):
    """Edición parcial del punto: solo se aplican los campos enviados."""
    name: str | None = Field(default=None, min_length=1, max_length=160)
    location: str | None = Field(default=None, max_length=300)
    active: bool | None = None


class ShippingZoneOut(ShippingZoneIn, ORMModel):
    id: str
    created_at: datetime


class ReviewIn(BaseModel):
    product_id: str
    author: str = Field(min_length=1, max_length=120)
    rating: int = Field(default=5, ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)


class ReviewOut(ReviewIn, ORMModel):
    id: str
    status: ReviewStatus
    created_at: datetime
    product_name: str | None = None


class ReviewStatusPatch(BaseModel):
    status: ReviewStatus


class OrderItemIn(BaseModel):
    product_id: str | None = None
    name: str = Field(min_length=1, max_length=180)
    unit_price: int = Field(ge=0)
    quantity: int = Field(gt=0)


class OrderIn(BaseModel):
    customer_id: str | None = None
    customer_name: str | None = Field(default=None, max_length=180)
    customer_phone: str | None = Field(default=None, max_length=60)
    customer_email: str | None = Field(default=None, max_length=254)
    status: OrderStatus = "pending"
    payment_method: str | None = Field(default=None, max_length=80)
    scheduled_date: date | None = None
    time_slot_id: str | None = None
    shipping_zone_id: str | None = None
    location: str | None = None
    items: list[OrderItemIn] = Field(min_length=1)


class OrderStatusPatch(BaseModel):
    status: OrderStatus


class OrderItemOut(OrderItemIn, ORMModel):
    id: str
    order_id: str


class OrderOut(ORMModel):
    id: str
    customer_id: str | None
    customer_name: str | None
    customer_phone: str | None
    customer_email: str | None
    status: OrderStatus
    total: int
    payment_method: str | None
    scheduled_date: date | None
    time_slot_id: str | None
    shipping_zone_id: str | None
    location: str | None
    created_at: datetime
    items: list[OrderItemOut] = Field(default_factory=list)
    time_slot_label: str | None = None
    shipping_zone_name: str | None = None


# Paleta de marca editable desde el panel (D29): los cinco tonos de la identidad cálida, nombrados por
# el uso que tienen en la tienda. La API no impone la paleta, solo que sean colores válidos y de estos
# tonos: los que falten los completa el frontend con sus valores por defecto.
THEME_COLOR_KEYS = ("accent", "ink", "surface", "muted", "detail")
HEX_COLOR = re.compile(r"^#[0-9a-f]{6}$")


class SettingsIn(BaseModel):
    # `extra="forbid"`: el panel es el único cliente de este endpoint y un campo que la API no conoce se
    # descartaba **en silencio** —parecía guardarse y no se guardaba nada—, que es justo lo que pasó al
    # estrenar la paleta contra una imagen vieja de la API. Mejor un 422 que diga qué sobra.
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=50)
    whatsapp_phone: str | None = Field(default=None, max_length=50)
    instagram_url: str | None = Field(default=None, max_length=300)
    announcement: str | None = Field(default=None, max_length=240)
    hero_title: str | None = Field(default=None, max_length=200)
    hero_description: str | None = None
    story_headline: str | None = Field(default=None, max_length=240)
    story_description: str | None = None
    theme_colors: dict[str, str] | None = None

    @field_validator("theme_colors")
    @classmethod
    def valid_theme_colors(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        unknown = sorted(set(value) - set(THEME_COLOR_KEYS))
        if unknown:
            raise ValueError(f"Tono desconocido: {', '.join(unknown)}. Se editan {', '.join(THEME_COLOR_KEYS)}.")
        colors = {}
        for key, color in value.items():
            color = color.strip().lower()
            if not HEX_COLOR.match(color):
                raise ValueError(f"«{color}» no es un color hexadecimal de seis dígitos (por ejemplo #808c6d).")
            colors[key] = color
        return colors


class SettingsOut(SettingsIn, ORMModel):
    id: bool
    updated_at: datetime


# ── Feed de Instagram propio (D30) ──────────────────────────────────────────
# Los nombres van en snake_case como el resto de la API; el widget de la tienda (`lib/instagram.ts`)
# declara exactamente estos campos. El **token no aparece en ninguna de estas respuestas**.

class InstagramPostOut(BaseModel):
    id: str
    image: str
    permalink: str
    caption: str
    likes: int
    comments: int
    is_video: bool
    timestamp: str


class InstagramFeedOut(BaseModel):
    configured: bool
    posts: list[InstagramPostOut]


class InstagramTokenStatusOut(BaseModel):
    """Estado del token de larga duración, para diagnosticar la renovación automática (solo admin)."""
    configured: bool
    user_id: str | None = None
    # De dónde sale el token que se está usando: `base_de_datos` (ya renovado por la tarea) o `entorno`.
    source: str | None = None
    refreshed_at: datetime | None = None
    next_refresh_at: datetime | None = None
    last_error: str | None = None