from collections.abc import Callable
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from .config import get_settings
from .database import Base, engine, get_db
from .models import Category, Order, OrderItem, Page, Product, ProductVariant, StoreSettings
from .schemas import CategoryIn, CategoryOut, OrderIn, OrderOut, OrderStatusPatch, PageIn, ProductIn, ProductOut, SettingsIn

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Tienda Base API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


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


@app.get("/health")
def health() -> dict[str, str]: return {"status": "ok"}


@app.get("/api/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)): return db.scalars(select(Category).order_by(Category.name)).all()


@app.post("/api/categories", response_model=CategoryOut, status_code=201, dependencies=[Depends(require_admin)])
def create_category(payload: CategoryIn, db: Session = Depends(get_db)): return commit(db, Category(**payload.model_dump()))


@app.get("/api/products", response_model=list[ProductOut])
def list_products(include_drafts: bool = False, db: Session = Depends(get_db)):
    query = select(Product).options(selectinload(Product.variants)).order_by(Product.created_at.desc())
    if not include_drafts: query = query.where(Product.status == "active")
    return db.scalars(query).all()


@app.get("/api/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Product).options(selectinload(Product.variants)).where(Product.id == product_id))
    if not item: raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return item


@app.post("/api/products", response_model=ProductOut, status_code=201, dependencies=[Depends(require_admin)])
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"variants"}); data["image_url"] = str(data["image_url"]) if data["image_url"] else None
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    product = Product(**data, variants=[ProductVariant(**variant.model_dump()) for variant in payload.variants])
    return commit(db, product)


@app.put("/api/products/{product_id}", response_model=ProductOut, dependencies=[Depends(require_admin)])
def update_product(product_id: str, payload: ProductIn, db: Session = Depends(get_db)):
    product = find_or_404(db, Product, product_id); data = payload.model_dump(exclude={"variants"}); data["image_url"] = str(data["image_url"]) if data["image_url"] else None
    if data["category_id"]: find_or_404(db, Category, data["category_id"])
    for key, value in data.items(): setattr(product, key, value)
    product.variants = [ProductVariant(**variant.model_dump()) for variant in payload.variants]
    return commit(db, product)


@app.delete("/api/products/{product_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_product(product_id: str, db: Session = Depends(get_db)):
    db.delete(find_or_404(db, Product, product_id)); db.commit(); return Response(status_code=204)


@app.get("/api/orders", response_model=list[OrderOut], dependencies=[Depends(require_admin)])
def list_orders(db: Session = Depends(get_db)): return db.scalars(select(Order).order_by(Order.created_at.desc())).all()


@app.post("/api/orders", response_model=OrderOut, status_code=201, dependencies=[Depends(require_admin)])
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
    total = sum(item.unit_price * item.quantity for item in payload.items)
    order = Order(**payload.model_dump(exclude={"items"}), total=total, items=[OrderItem(**item.model_dump()) for item in payload.items])
    return commit(db, order)


@app.patch("/api/orders/{order_id}/status", response_model=OrderOut, dependencies=[Depends(require_admin)])
def update_order_status(order_id: str, payload: OrderStatusPatch, db: Session = Depends(get_db)):
    order = find_or_404(db, Order, order_id); order.status = payload.status; return commit(db, order)


def simple_create(model) -> Callable:
    def endpoint(payload, db: Session = Depends(get_db)): return commit(db, model(**payload.model_dump()))
    return endpoint



@app.post("/api/pages", status_code=201, dependencies=[Depends(require_admin)])
def create_page(payload: PageIn, db: Session = Depends(get_db)): return commit(db, Page(**payload.model_dump()))


@app.get("/api/settings")
def get_store_settings(db: Session = Depends(get_db)):
    return db.get(StoreSettings, True) or StoreSettings(id=True)


@app.put("/api/settings", dependencies=[Depends(require_admin)])
def update_store_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    record = db.get(StoreSettings, True) or StoreSettings(id=True)
    for key, value in payload.model_dump().items(): setattr(record, key, value)
    return commit(db, record)
