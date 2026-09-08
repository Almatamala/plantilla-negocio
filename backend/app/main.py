import os
import uuid
from collections.abc import Callable
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from .config import get_settings
from .database import Base, engine, get_db
from .models import Category, ClosedDay, Order, OrderItem, Page, Product, ProductVariant, Review, ShippingZone, StoreSettings, TimeSlot
from .schemas import CategoryIn, CategoryOut, ClosedDayIn, ClosedDayOut, OrderIn, OrderOut, OrderStatusPatch, PageIn, ProductIn, ProductOut, ReviewIn, ReviewOut, ReviewStatusPatch, SettingsIn, SettingsOut, ShippingZoneIn, ShippingZoneOut, ShippingZonePatch, TimeSlotIn, TimeSlotOut, TimeSlotPatch

settings = get_settings()

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="BOSQUE API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

PUBLIC_STATUSES = ["active", "preorder", "sold_out"]


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if x_admin_token != settings.api_admin_token:
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
    order = Order(**payload.model_dump(exclude={"items"}), total=total)
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