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


def test_invalid_product_is_rejected(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Sin precio", "slug": "sin-precio", "price": -1})
    assert product.status_code == 422


def test_order_total_is_calculated_and_status_can_change(client, admin_headers):
    order = client.post("/api/orders", json={"items": [{"name": "Producto", "unit_price": 10000, "quantity": 2}, {"name": "Otro", "unit_price": 5000, "quantity": 1}]}).json()
    assert order["total"] == 25000
    updated = client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "preparing"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "preparing"


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
    product = client.post("/api/products", headers=admin_headers, json={"name": "Kuchen", "slug": "kuchen", "price": 5000, "status": "preorder", "inventory": 0, "allow_backorder": True, "lead_time_days": 2}).json()
    assert client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Kuchen", "unit_price": 5000, "quantity": 1}]}).status_code == 201
    updated = client.get(f"/api/products/{product['id']}").json()
    assert updated["inventory"] == 0
    assert updated["status"] == "preorder"


def test_schedule_and_shipping_zone_in_order(client, admin_headers):
    slot = client.post("/api/time-slots", headers=admin_headers, json={"label": "Mañana", "start_time": "09:00", "end_time": "12:00"}).json()
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "San Javier", "type": "domicilio", "areas": ["Centro"]}).json()
    order = client.post("/api/orders", json={"customer_name": "Luis", "scheduled_date": "2026-09-15", "time_slot_id": slot["id"], "fulfillment": "domicilio", "shipping_zone_id": zone["id"], "location": "Calle 1", "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
    assert order.status_code == 201
    assert order.json()["shipping_zone_name"] == "San Javier"
    assert order.json()["time_slot_label"] == "Mañana"


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
