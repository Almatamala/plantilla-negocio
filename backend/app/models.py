import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

UUID = String(36)


def new_id() -> str:
    return str(uuid.uuid4())


class Profile(Base):
    """Sustituto local de auth.users + public.profiles de Supabase."""
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="customer")
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
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    inventory: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seo_title: Mapped[Optional[str]] = mapped_column(String(160))
    seo_description: Mapped[Optional[str]] = mapped_column(String(320))
    sku: Mapped[Optional[str]] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    category: Mapped[Optional[Category]] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[Optional[int]] = mapped_column(Integer)
    inventory: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sku: Mapped[Optional[str]] = mapped_column(String(80), unique=True)
    product: Mapped[Product] = relationship(back_populates="variants")


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    customer_id: Mapped[Optional[str]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payment_method: Mapped[Optional[str]] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[Optional[str]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    variant_id: Mapped[Optional[str]] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[Order] = relationship(back_populates="items")



class Page(Base):
    __tablename__ = "pages"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    seo_title: Mapped[Optional[str]] = mapped_column(String(160))
    seo_description: Mapped[Optional[str]] = mapped_column(String(320))
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class StoreSettings(Base):
    __tablename__ = "store_settings"
    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, default="Tienda Base")
    contact_email: Mapped[Optional[str]] = mapped_column(String(254))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50))
    hero_title: Mapped[Optional[str]] = mapped_column(String(200))
    hero_description: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
