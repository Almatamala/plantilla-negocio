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


def test_invalid_product_and_discount_are_rejected(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Sin precio", "slug": "sin-precio", "price": -1})
    assert product.status_code == 422
    discount = client.post("/api/discounts", headers=admin_headers, json={"code": "SALE", "type": "percentage", "value": 150})
    assert discount.status_code == 422


def test_order_total_is_calculated_and_status_can_change(client, admin_headers):
    order = client.post("/api/orders", headers=admin_headers, json={"items": [{"name": "Producto", "unit_price": 10000, "quantity": 2}, {"name": "Otro", "unit_price": 5000, "quantity": 1}]}).json()
    assert order["total"] == 25000
    updated = client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "preparing"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "preparing"
