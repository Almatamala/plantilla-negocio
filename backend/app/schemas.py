from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

ProductStatus = Literal["draft", "active", "sold_out", "preorder"]
OrderStatus = Literal["pending", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"]
FulfillmentType = Literal["retiro", "domicilio"]
ReviewStatus = Literal["pending", "approved", "rejected"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProfileOut(ORMModel):
    id: str
    name: str | None
    phone: str | None
    email: str
    role: str
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
    image_url: str | None = None
    images: list[str] = Field(default_factory=list)
    ingredients: str | None = None
    allergens: list[str] = Field(default_factory=list)
    status: ProductStatus = "draft"
    inventory: int = Field(default=0, ge=0)
    allow_backorder: bool = False
    sku: str | None = Field(default=None, max_length=80)
    seo_title: str | None = Field(default=None, max_length=160)
    seo_description: str | None = Field(default=None, max_length=320)
    variants: list[VariantIn] = Field(default_factory=list)


class ProductOut(ProductIn, ORMModel):
    id: str
    created_at: datetime
    updated_at: datetime
    variants: list[VariantOut] = Field(default_factory=list)


class TimeSlotIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    start_time: str = Field(min_length=4, max_length=10)
    end_time: str = Field(min_length=4, max_length=10)
    enabled: bool = True


class TimeSlotPatch(BaseModel):
    enabled: bool


class TimeSlotOut(TimeSlotIn, ORMModel):
    id: str
    created_at: datetime


class ClosedDayIn(BaseModel):
    date: date
    reason: str | None = Field(default=None, max_length=240)


class ClosedDayOut(ClosedDayIn, ORMModel):
    id: str
    created_at: datetime


class ShippingZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: FulfillmentType = "retiro"
    areas: list[str] = Field(default_factory=list)
    active: bool = True


class ShippingZonePatch(BaseModel):
    active: bool


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
    variant_id: str | None = None
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
    fulfillment: FulfillmentType | None = None
    shipping_zone_id: str | None = None
    location: str | None = None
    notes: str | None = None
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
    fulfillment: FulfillmentType | None
    shipping_zone_id: str | None
    location: str | None
    notes: str | None
    created_at: datetime
    items: list[OrderItemOut] = Field(default_factory=list)
    time_slot_label: str | None = None
    shipping_zone_name: str | None = None


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
    whatsapp_phone: str | None = Field(default=None, max_length=50)
    instagram_url: str | None = Field(default=None, max_length=300)
    bank_account_info: str | None = None
    announcement: str | None = Field(default=None, max_length=240)
    hero_title: str | None = Field(default=None, max_length=200)
    hero_description: str | None = None
    story_headline: str | None = Field(default=None, max_length=240)
    story_description: str | None = None


class SettingsOut(SettingsIn, ORMModel):
    id: bool
    updated_at: datetime