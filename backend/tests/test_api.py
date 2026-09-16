from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.database import get_db


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_admin_token_is_required(client):
    response = client.post("/api/categories", json={"name": "Catálogo", "slug": "catalogo"})
    assert response.status_code == 401


def test_create_product_with_variants_and_public_catalog(client, admin_headers):
    category = client.post("/api/categories", headers=admin_headers, json={"name": "Accesorios", "slug": "accesorios"}).json()
    response = client.post("/api/products", headers=admin_headers, json={
        "name": "Producto demo", "slug": "producto-demo", "price": 19990, "status": "active", "inventory": 5,
        "category_id": category["id"], "variants": [{"name": "Pequeño", "price": 15990, "inventory": 2}],
    })
    assert response.status_code == 201
    product = response.json()
    assert product["variants"][0]["name"] == "Pequeño"
    public_catalog = client.get("/api/products")
    assert public_catalog.status_code == 200
    assert len(public_catalog.json()) == 1


def test_categories_can_be_renamed_and_removed(client, admin_headers):
    category = client.post("/api/categories", headers=admin_headers, json={"name": "Tortas", "slug": "tortas"}).json()
    product = client.post("/api/products", headers=admin_headers, json={"name": "Torta de chocolate", "slug": "torta-de-chocolate", "price": 1000, "category_id": category["id"]}).json()

    renamed = client.put(f"/api/categories/{category['id']}", headers=admin_headers, json={"name": "Tortas y kuchen", "slug": "tortas-y-kuchen"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Tortas y kuchen"
    assert client.put(f"/api/categories/{category['id']}", json={"name": "Otra", "slug": "otra"}).status_code == 401

    assert client.delete(f"/api/categories/{category['id']}").status_code == 401
    assert client.delete(f"/api/categories/{category['id']}", headers=admin_headers).status_code == 204
    assert client.get("/api/categories").json() == []
    # El producto no se elimina: queda sin categoría.
    assert client.get(f"/api/products/{product['id']}").json()["category_id"] is None
    assert client.delete(f"/api/categories/{category['id']}", headers=admin_headers).status_code == 404


def test_invalid_product_is_rejected(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Sin precio", "slug": "sin-precio", "price": -1})
    assert product.status_code == 422


def test_order_total_is_calculated_and_status_can_change(client, admin_headers):
    order = client.post("/api/orders", json={"items": [{"name": "Producto", "unit_price": 10000, "quantity": 2}, {"name": "Otro", "unit_price": 5000, "quantity": 1}]}).json()
    assert order["total"] == 25000
    updated = client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "preparing"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "preparing"


def test_order_can_be_edited_by_admin(client, admin_headers):
    order = client.post("/api/orders", json={"customer_name": "Luis", "items": [{"name": "Producto", "unit_price": 1000, "quantity": 1}]}).json()
    payload = {"customer_name": "Luis Pérez", "customer_phone": "+56900000000", "items": [{"name": "Producto", "unit_price": 1000, "quantity": 3}]}
    assert client.put(f"/api/orders/{order['id']}", json=payload).status_code == 401
    updated = client.put(f"/api/orders/{order['id']}", headers=admin_headers, json=payload)
    assert updated.status_code == 200
    body = updated.json()
    assert body["customer_name"] == "Luis Pérez"
    assert body["total"] == 3000
    assert len(body["items"]) == 1
    assert body["items"][0]["quantity"] == 3
    assert client.get("/api/orders", headers=admin_headers).json()[0]["id"] == order["id"]


def test_stock_decrements_and_auto_sold_out(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Pan", "slug": "pan", "price": 1000, "status": "active", "inventory": 2}).json()
    first = client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Pan", "unit_price": 1000, "quantity": 1}]})
    assert first.status_code == 201
    updated = client.get(f"/api/products/{product['id']}").json()
    assert updated["inventory"] == 1
    client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Pan", "unit_price": 1000, "quantity": 1}]})
    updated2 = client.get(f"/api/products/{product['id']}").json()
    assert updated2["inventory"] == 0
    assert updated2["status"] == "sold_out"
    third = client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Pan", "unit_price": 1000, "quantity": 1}]})
    assert third.status_code == 409


def test_backorder_keeps_preorder_status(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Kuchen", "slug": "kuchen", "price": 5000, "status": "preorder", "inventory": 0, "allow_backorder": True}).json()
    assert client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Kuchen", "unit_price": 5000, "quantity": 1}]}).status_code == 201
    updated = client.get(f"/api/products/{product['id']}").json()
    assert updated["inventory"] == 0
    assert updated["status"] == "preorder"


def test_pickup_point_with_slot_in_order(client, admin_headers):
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Punto de encuentro Talca", "type": "encuentro", "location": "Plaza de Armas, Talca"}).json()
    assert zone["location"] == "Plaza de Armas, Talca"
    # 2026-09-15 es martes (2 en la convención 0 = domingo).
    slot = client.post("/api/time-slots", headers=admin_headers, json={"zone_id": zone["id"], "label": "Martes de encuentro", "start_time": "11:00", "end_time": "13:00", "weekdays": [2]}).json()
    assert slot["weekdays"] == [2]
    assert slot["zone_name"] == "Punto de encuentro Talca"
    payload = {"customer_name": "Luis", "scheduled_date": "2026-09-15", "time_slot_id": slot["id"], "fulfillment": "encuentro", "shipping_zone_id": zone["id"], "location": zone["location"], "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]}
    order = client.post("/api/orders", json=payload)
    assert order.status_code == 201
    body = order.json()
    assert body["shipping_zone_name"] == "Punto de encuentro Talca"
    assert body["time_slot_label"] == "Martes de encuentro"
    assert body["fulfillment"] == "encuentro"
    # La nota del pedido se retiró (D17).
    assert "notes" not in body
    # La franja pertenece a un día: el 2026-09-16 es miércoles.
    assert client.post("/api/orders", json={**payload, "scheduled_date": "2026-09-16"}).status_code == 409
    # El despacho a domicilio ya no es un tipo de entrega válido (D16).
    assert client.post("/api/orders", json={**payload, "fulfillment": "domicilio"}).status_code == 422
    assert client.post("/api/shipping-zones", headers=admin_headers, json={"name": "A domicilio", "type": "domicilio"}).status_code == 422


def test_time_slots_belong_to_a_pickup_point(client, admin_headers):
    first = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Retiro presencial San Javier", "type": "retiro", "location": "Av. Principal 123"}).json()
    second = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Punto de encuentro Talca", "type": "encuentro"}).json()
    base = {"label": "Tarde", "start_time": "16:00", "end_time": "19:00", "weekdays": [1]}
    # Una franja sin punto (o sin días) no se acepta, y el punto debe existir.
    assert client.post("/api/time-slots", headers=admin_headers, json=base).status_code == 422
    assert client.post("/api/time-slots", headers=admin_headers, json={**base, "zone_id": first["id"], "weekdays": []}).status_code == 422
    assert client.post("/api/time-slots", headers=admin_headers, json={**base, "zone_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404
    assert client.post("/api/time-slots", headers=admin_headers, json={**base, "zone_id": first["id"], "weekdays": [7]}).status_code == 422
    created = client.post("/api/time-slots", headers=admin_headers, json={**base, "zone_id": first["id"], "weekdays": [6, 1, 1]})
    assert created.status_code == 201
    assert created.json()["weekdays"] == [1, 6]  # ordenados y sin repetir
    slot_id = created.json()["id"]
    assert [slot["id"] for slot in client.get(f"/api/time-slots?zone_id={first['id']}").json()] == [slot_id]
    assert client.get(f"/api/time-slots?zone_id={second['id']}").json() == []
    # Edición parcial: cambia los días y el horario, sin tocar la etiqueta.
    updated = client.patch(f"/api/time-slots/{slot_id}", headers=admin_headers, json={"weekdays": [5], "start_time": "10:00"})
    assert updated.status_code == 200
    assert updated.json()["weekdays"] == [5]
    assert updated.json()["start_time"] == "10:00"
    assert updated.json()["label"] == "Tarde"
    assert client.patch(f"/api/time-slots/{slot_id}", json={"enabled": False}).status_code == 401
    # Deshabilitada: fuera del listado público y tampoco sirve para un pedido.
    assert client.patch(f"/api/time-slots/{slot_id}", headers=admin_headers, json={"enabled": False}).status_code == 200
    assert client.get(f"/api/time-slots?zone_id={first['id']}").json() == []
    assert len(client.get(f"/api/time-slots?zone_id={first['id']}&include_disabled=true").json()) == 1
    order = {"customer_name": "Luis", "scheduled_date": "2026-09-18", "time_slot_id": slot_id, "shipping_zone_id": first["id"], "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]}
    assert client.post("/api/orders", json=order).status_code == 409
    # Y una franja de otro punto se rechaza aunque el día calce.
    other = client.post("/api/time-slots", headers=admin_headers, json={"zone_id": second["id"], "label": "Sábado", "start_time": "11:00", "end_time": "13:00", "weekdays": [6]}).json()
    assert client.post("/api/orders", json={**order, "time_slot_id": other["id"], "scheduled_date": "2026-09-19"}).status_code == 409
    assert client.post("/api/orders", json={**order, "time_slot_id": "00000000-0000-0000-0000-000000000000"}).status_code == 409
    # Al eliminar el punto se van sus franjas.
    assert client.delete(f"/api/shipping-zones/{first['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/time-slots?include_disabled=true").json() == [other]


def test_pickup_point_can_be_edited(client, admin_headers):
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "San Javier", "type": "retiro", "location": "Av. Principal 123"}).json()
    assert client.patch(f"/api/shipping-zones/{zone['id']}", json={"name": "Otro"}).status_code == 401
    updated = client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"name": "Retiro presencial San Javier", "type": "encuentro", "location": "Plaza de San Javier"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Retiro presencial San Javier"
    assert updated.json()["type"] == "encuentro"
    assert updated.json()["location"] == "Plaza de San Javier"
    assert updated.json()["active"] is True
    # `location: null` la borra y el resto del punto no cambia.
    cleared = client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"location": None}).json()
    assert cleared["location"] is None
    assert cleared["name"] == "Retiro presencial San Javier"
    assert client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"name": ""}).status_code == 422


def test_fresh_install_creates_tables_and_closes_sunday(monkeypatch):
    """Instalación nueva (sin tablas): la API las crea y deja el domingo cerrado todas las semanas."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(main, "engine", engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(main.app) as fresh:
            assert [day["weekday"] for day in fresh.get("/api/closed-weekdays").json()] == [0]
    finally:
        main.app.dependency_overrides.clear()


def test_weekly_closed_days(client, admin_headers, db_session):
    # Instalación nueva: el domingo queda cerrado por defecto y no se duplica (D19).
    assert main.seed_default_closed_weekday(db_session) is True
    assert main.seed_default_closed_weekday(db_session) is False
    assert [day["weekday"] for day in client.get("/api/closed-weekdays").json()] == [0]
    assert client.post("/api/closed-weekdays", json={"weekday": 1}).status_code == 401
    assert client.post("/api/closed-weekdays", headers=admin_headers, json={"weekday": 9}).status_code == 422
    created = client.post("/api/closed-weekdays", headers=admin_headers, json={"weekday": 1, "reason": "Solo producción"})
    assert created.status_code == 201
    assert client.post("/api/closed-weekdays", headers=admin_headers, json={"weekday": 1}).status_code == 409
    rows = client.get("/api/closed-weekdays").json()
    assert [day["weekday"] for day in rows] == [0, 1]
    assert next(day for day in rows if day["weekday"] == 1)["reason"] == "Solo producción"
    assert client.delete(f"/api/closed-weekdays/{created.json()['id']}", headers=admin_headers).status_code == 204
    assert [day["weekday"] for day in client.get("/api/closed-weekdays").json()] == [0]


def test_reviews_are_moderated(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Torta", "slug": "torta", "price": 9000, "status": "active", "inventory": 5}).json()
    created = client.post("/api/reviews", json={"product_id": product["id"], "author": "María", "rating": 5, "comment": "Deliciosa"})
    assert created.status_code == 201
    assert created.json()["status"] == "pending"
    assert client.get(f"/api/reviews?product_id={product['id']}").json() == []
    approved = client.patch(f"/api/reviews/{created.json()['id']}/status", headers=admin_headers, json={"status": "approved"})
    assert approved.status_code == 200
    public = client.get(f"/api/reviews?product_id={product['id']}").json()
    assert len(public) == 1
    assert public[0]["product_name"] == "Torta"
