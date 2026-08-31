from datetime import datetime, time
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

ProductStatus = Literal["draft", "active", "sold_out"]
OrderStatus = Literal["pending", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"]
DiscountType = Literal["percentage", "fixed", "free_shipping"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=140)


class CategoryOut(CategoryIn, ORMModel):
    id: str
    created_at: datetime


class VariantIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: int | None = Field(default=None, ge=0)
    inventory: int = Field(default=0, ge=0)
    sku: str | None = Field(default=None, max_length=80)


class VariantOut(VariantIn, ORMModel):
    id: str
    product_id: str


class ProductIn(BaseModel):
    category_id: str | None = None
    name: str = Field(min_length=1, max_length=180)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)
    description: str | None = None
    price: int = Field(ge=0)
    image_url: HttpUrl | None = None
    status: ProductStatus = "draft"
    inventory: int = Field(default=0, ge=0)
    sku: str | None = Field(default=None, max_length=80)
    seo_title: str | None = Field(default=None, max_length=160)
    seo_description: str | None = Field(default=None, max_length=320)
    variants: list[VariantIn] = Field(default_factory=list)


class ProductPatch(ProductIn):
    pass


class ProductOut(ProductIn, ORMModel):
    id: str
    created_at: datetime
    updated_at: datetime
    variants: list[VariantOut] = Field(default_factory=list)


class OrderItemIn(BaseModel):
    product_id: str | None = None
    variant_id: str | None = None
    name: str = Field(min_length=1, max_length=180)
    unit_price: int = Field(ge=0)
    quantity: int = Field(gt=0)


class OrderIn(BaseModel):
    customer_id: str | None = None
    status: OrderStatus = "pending"
    shipping_address: dict | None = None
    payment_method: str | None = Field(default=None, max_length=80)
    items: list[OrderItemIn] = Field(min_length=1)


class OrderStatusPatch(BaseModel):
    status: OrderStatus


class OrderOut(ORMModel):
    id: str
    customer_id: str | None
    status: OrderStatus
    total: int
    shipping_address: dict | None
    payment_method: str | None
    created_at: datetime


class DiscountIn(BaseModel):
    code: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    type: DiscountType
    value: int = Field(default=0, ge=0)
    minimum_amount: int | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    usage_limit: int | None = Field(default=None, gt=0)
    active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_discount(self):
        if self.type == "percentage" and not 1 <= self.value <= 100:
            raise ValueError("El descuento porcentual debe estar entre 1 y 100.")
        if self.type == "free_shipping" and self.value != 0:
            raise ValueError("El envío gratis debe tener valor 0.")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("La fecha final debe ser posterior a la inicial.")
        return self


class ShippingZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    regions: list[str] = Field(default_factory=list)
    rate: int = Field(default=0, ge=0)
    free_shipping_from: int | None = Field(default=None, ge=0)
    cutoff_time: time | None = None


class PageIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=160)
    title: str = Field(min_length=1, max_length=180)
    content: str = ""
    seo_title: str | None = Field(default=None, max_length=160)
    seo_description: str | None = Field(default=None, max_length=320)
    published: bool = False


class SettingsIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=50)
    hero_title: str | None = Field(default=None, max_length=200)
    hero_description: str | None = None
