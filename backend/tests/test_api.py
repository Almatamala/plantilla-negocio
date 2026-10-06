from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.database import get_db
from app.models import Order, OrderItem


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_store_settings_without_instagram_widget(client, admin_headers):
    # El widget de terceros de Instagram (D23) se retiró al pasar al **feed propio** con la API de
    # Instagram (D30), cuyo token vive solo en el servidor: el ajuste sale del panel y de la API y la
    # columna se elimina al arrancar en PostgreSQL. El enlace al perfil (`instagram_url`) se mantiene.
    settings = client.get("/api/settings").json()
    assert "instagram_embed_url" not in settings

    payload = {key: value for key, value in settings.items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["instagram_url"] = "https://www.instagram.com/bosque"

    assert client.put("/api/settings", json=payload).status_code == 401
    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["instagram_url"] == "https://www.instagram.com/bosque"
    assert "instagram_embed_url" not in saved.json()
    assert client.get("/api/settings").json()["instagram_url"] == "https://www.instagram.com/bosque"


def test_store_settings_without_products_per_page(client, admin_headers):
    # Productos por página del catálogo (D26): quedaron fijos en 8, así que el ajuste se retiró del panel
    # y de la API (la columna se elimina al arrancar en PostgreSQL). El resto de los ajustes sigue igual.
    settings = client.get("/api/settings").json()
    assert "products_per_page" not in settings

    payload = {key: value for key, value in settings.items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["name"] == "BOSQUE"
    assert "products_per_page" not in saved.json()
    assert client.get("/api/settings").json()["name"] == "BOSQUE"


def test_store_settings_save_theme_colors(client, admin_headers):
    # Paleta de marca (D29): los cinco tonos se guardan tal cual y la API solo acepta hex de seis dígitos
    # en los tonos conocidos; el frontend completa con su paleta por defecto los que no se envíen.
    settings = client.get("/api/settings").json()
    assert settings["theme_colors"] is None

    payload = {key: value for key, value in settings.items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["theme_colors"] = {"accent": "#123ABC", "ink": "#401a04"}

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["theme_colors"] == {"accent": "#123abc", "ink": "#401a04"}
    assert client.get("/api/settings").json()["theme_colors"]["accent"] == "#123abc"

    payload["theme_colors"] = {"accent": "verde"}
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 422
    payload["theme_colors"] = {"acento": "#123abc"}
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 422


def test_store_settings_save_editable_page_texts(client, admin_headers):
    # Textos que el editor visual de la página (`/admin/editor`, D38) pasó a editar: los antetítulos, las
    # tres tarjetas de beneficios, la bajada y la ubicación del pie. Cada uno es una columna de `store_settings`, así
    # que se guardan y vuelven por la API; con `extra="forbid"`, un nombre mal escrito sería un 422.
    settings = client.get("/api/settings").json()
    payload = {key: value for key, value in settings.items() if key not in ("id", "updated_at")}
    payload.update({
        "name": "BOSQUE",
        "hero_eyebrow": "Tu colección, tu estilo",
        "story_eyebrow": "Una plantilla que crece contigo",
        "benefit_1_title": "Compra con confianza",
        "benefit_1_text": "Texto del primer beneficio.",
        "benefit_2_title": "Una experiencia simple",
        "benefit_2_text": "Texto del segundo beneficio.",
        "benefit_3_title": "Tu negocio, tu estilo",
        "benefit_3_text": "Texto del tercer beneficio.",
        "footer_location": "San Javier y Talca, Chile",
        "footer_tagline": "Repostería artesanal de San Javier y Talca. Pedidos programados con retiro presencial.",
    })

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["footer_location"] == "San Javier y Talca, Chile"
    assert saved.json()["footer_tagline"] == "Repostería artesanal de San Javier y Talca. Pedidos programados con retiro presencial."

    stored = client.get("/api/settings").json()
    assert stored["hero_eyebrow"] == "Tu colección, tu estilo"
    assert stored["benefit_2_text"] == "Texto del segundo beneficio."
    assert stored["story_eyebrow"] == "Una plantilla que crece contigo"
    assert stored["footer_tagline"] == "Repostería artesanal de San Javier y Talca. Pedidos programados con retiro presencial."

    assert client.put("/api/settings", headers=admin_headers, json={**payload, "inventado": "x"}).status_code == 422

    # Un campo que la API no conoce se rechaza en vez de descartarse en silencio: con una imagen vieja de
    # la API, guardar la paleta respondía 200 y no guardaba nada (extra="forbid" en SettingsIn).
    payload["theme_colors"] = {"accent": "#123abc"}
    payload["theme_colours"] = "#123abc"
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 422
    payload.pop("theme_colours")

    # Volver a la paleta del código: basta con vaciar el ajuste.
    payload["theme_colors"] = None
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["theme_colors"] is None


def test_store_settings_save_hero_image(client, admin_headers):
    # Foto de fondo del hero (D47/D48): es una columna de `store_settings` y se edita en el editor visual de
    # la página. Guarda la URL que devuelve `/api/upload` (o una externa) y, sin valor, la tienda usa la
    # foto de la plantilla.
    assert client.get("/api/settings").json()["hero_image"] is None

    payload = {key: value for key, value in client.get("/api/settings").json().items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["hero_image"] = "http://localhost:8000/uploads/portada.jpg"

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["hero_image"] == "http://localhost:8000/uploads/portada.jpg"
    assert client.get("/api/settings").json()["hero_image"] == "http://localhost:8000/uploads/portada.jpg"

    # Volver a la foto de la plantilla: basta con vaciar el ajuste.
    payload["hero_image"] = None
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["hero_image"] is None

    # «Quitar foto» (A74): el editor manda la cadena vacía y la API la guarda tal cual; el frontend la
    # trata como «sin foto» (`??`, no `||`), así que el hero no cae a ninguna imagen por defecto.
    payload["hero_image"] = ""
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["hero_image"] == ""


def test_store_settings_save_hero_logo(client, admin_headers):
    # Logo del hero (D49, **opcional**): es otra columna de `store_settings`, se edita desde el editor de la
    # página y, sin valor, la tienda no dibuja nada en la esquina.
    assert client.get("/api/settings").json()["hero_logo"] is None

    payload = {key: value for key, value in client.get("/api/settings").json().items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["hero_logo"] = "http://localhost:8000/uploads/logo.png"

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["hero_logo"] == "http://localhost:8000/uploads/logo.png"
    assert client.get("/api/settings").json()["hero_logo"] == "http://localhost:8000/uploads/logo.png"

    # Quitar el logo: basta con vaciar el ajuste.
    payload["hero_logo"] = None
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["hero_logo"] is None


def test_store_settings_save_hero_logo_shape(client, admin_headers):
    # Forma del marco del logo (D50): `circle` (por defecto), `soft` (bordes difuminados) o `flower`. Es
    # otra columna de `store_settings`, la cambia el editor de la página con el mismo logo y solo afecta al
    # recorte de la imagen.
    assert client.get("/api/settings").json()["hero_logo_shape"] is None

    payload = {key: value for key, value in client.get("/api/settings").json().items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["hero_logo"] = "http://localhost:8000/uploads/logo.png"

    for shape in ("flower", "soft", "circle"):
        payload["hero_logo_shape"] = shape
        saved = client.put("/api/settings", headers=admin_headers, json=payload)
        assert saved.status_code == 200
        assert saved.json()["hero_logo_shape"] == shape
        assert client.get("/api/settings").json()["hero_logo_shape"] == shape

    # Solo las tres formas conocidas: cualquier otra se rechaza.
    payload["hero_logo_shape"] = "estrella"
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 422


def test_store_settings_save_hero_image_position(client, admin_headers):
    # Encuadre de la foto del hero (D51): un `object-position` de CSS (porcentajes 0–100) que el editor
    # mueve arrastrando la foto. Sin valor guardado manda el recorte por defecto (`object-right`).
    assert client.get("/api/settings").json()["hero_image_position"] is None

    payload = {key: value for key, value in client.get("/api/settings").json().items() if key not in ("id", "updated_at")}
    payload["name"] = "BOSQUE"
    payload["hero_image_position"] = "35% 80%"

    saved = client.put("/api/settings", headers=admin_headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["hero_image_position"] == "35% 80%"
    assert client.get("/api/settings").json()["hero_image_position"] == "35% 80%"

    # También se aceptan las palabras clave de CSS («center center»): una base ya creada puede traer un
    # encuadre guardado así y el GET no puede fallar por eso.
    payload["hero_image_position"] = "center center"
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["hero_image_position"] == "center center"

    # Un encuadre que no sea un `object-position` válido se rechaza (por ejemplo «derecha»).
    payload["hero_image_position"] = "derecha"
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 422

    # Volver al recorte por defecto: basta con vaciar el ajuste.
    payload["hero_image_position"] = None
    assert client.put("/api/settings", headers=admin_headers, json=payload).status_code == 200
    assert client.get("/api/settings").json()["hero_image_position"] is None


def test_admin_token_is_required(client):
    response = client.post("/api/categories", json={"name": "Catálogo", "slug": "catalogo"})
    assert response.status_code == 401


def test_create_product_and_public_catalog(client, admin_headers):
    category = client.post("/api/categories", headers=admin_headers, json={"name": "Accesorios", "slug": "accesorios"}).json()
    response = client.post("/api/products", headers=admin_headers, json={
        "name": "Producto demo", "slug": "producto-demo", "price": 19990, "status": "active", "inventory": 5,
        "category_id": category["id"],
    })
    assert response.status_code == 201
    assert response.json()["name"] == "Producto demo"
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
    # `paid` y `preparing` se unificaron en `pending` (D37): ya no son estados válidos.
    assert client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "preparing"}).status_code == 422
    assert client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "paid"}).status_code == 422
    updated = client.patch(f"/api/orders/{order['id']}/status", headers=admin_headers, json={"status": "shipped"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "shipped"


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


def test_order_does_not_touch_stock(client, admin_headers):
    """La tienda es **bajo pedido** (D35): el pedido no descuenta ni reserva inventario."""
    product = client.post("/api/products", headers=admin_headers, json={"name": "Pan", "slug": "pan", "price": 1000, "status": "active", "inventory": 2}).json()
    order = client.post("/api/orders", json={"items": [{"product_id": product["id"], "name": "Pan", "unit_price": 1000, "quantity": 5}]})
    assert order.status_code == 201
    assert "expires_at" not in order.json()
    updated = client.get(f"/api/products/{product['id']}").json()
    assert updated["inventory"] == 2
    assert updated["status"] == "active"
    # Cancelar tampoco devuelve nada: nunca hubo reserva.
    assert client.patch(f"/api/orders/{order.json()['id']}/status", headers=admin_headers, json={"status": "cancelled"}).status_code == 200
    assert client.get(f"/api/products/{product['id']}").json()["inventory"] == 2


def test_product_stores_preparation_days(client, admin_headers):
    """Los días de preparación (D35) se guardan por producto y por defecto son 0."""
    created = client.post("/api/products", headers=admin_headers, json={"name": "Torta", "slug": "torta", "price": 9000, "preparation_days": 3})
    assert created.status_code == 201
    assert created.json()["preparation_days"] == 3
    assert "allow_backorder" not in created.json()
    # Un valor negativo no tiene sentido y se rechaza.
    assert client.post("/api/products", headers=admin_headers, json={"name": "Otra", "slug": "otra", "price": 1000, "preparation_days": -1}).status_code == 422
    plain = client.post("/api/products", headers=admin_headers, json={"name": "Pan", "slug": "pan", "price": 1000}).json()
    assert plain["preparation_days"] == 0


def test_product_statuses_are_active_or_inactive(client, admin_headers):
    """Solo hay dos estados: `active` (visible en la tienda) e `inactive` (oculto, visible en el panel)."""
    client.post("/api/products", headers=admin_headers, json={"name": "Visible", "slug": "visible", "price": 1000, "status": "active"})
    client.post("/api/products", headers=admin_headers, json={"name": "Oculto", "slug": "oculto", "price": 1000, "status": "inactive"})
    # El catálogo público solo muestra lo activo, y la ficha por slug tampoco expone lo inactivo.
    assert [p["slug"] for p in client.get("/api/products").json()] == ["visible"]
    assert client.get("/api/products/slug/oculto").status_code == 404
    assert client.get("/api/products/slug/visible").status_code == 200
    # El panel pide todo y ve también lo inactivo.
    panel = client.get("/api/products?include_inactive=true", headers=admin_headers).json()
    assert {p["slug"] for p in panel} == {"visible", "oculto"}
    # Un producto nuevo nace activo y los estados retirados ya no son válidos.
    assert client.post("/api/products", headers=admin_headers, json={"name": "Nuevo", "slug": "nuevo", "price": 1000}).json()["status"] == "active"
    assert client.post("/api/products", headers=admin_headers, json={"name": "Borrador", "slug": "borrador", "price": 1000, "status": "draft"}).status_code == 422


def test_order_confirmation_goes_to_customer_and_store(client, admin_headers, monkeypatch):
    """Al registrar un pedido se avisa al **cliente** (correo del checkout) y a la **tienda** (Contenido)."""
    sent: list[dict] = []
    monkeypatch.setattr(main.settings, "resend_api_key", "test-key")
    monkeypatch.setattr(main.settings, "resend_email_from", "tienda@test.cl")

    def fake_send(**kwargs):
        sent.append(kwargs)
        return {"customer": True, "store": True}

    monkeypatch.setattr(main, "send_order_confirmation", fake_send)

    # El correo de la tienda sale de Contenido › contacto.
    settings_payload = {key: value for key, value in client.get("/api/settings").json().items() if key not in ("id", "updated_at")}
    settings_payload["name"] = "BOSQUE"
    settings_payload["contact_email"] = "hola@bosque.cl"
    assert client.put("/api/settings", headers=admin_headers, json=settings_payload).status_code == 200

    order = client.post("/api/orders", json={"customer_name": "Luis", "customer_email": "luis@test.cl", "items": [{"name": "Pan", "unit_price": 1200, "quantity": 2}]})
    assert order.status_code == 201

    assert len(sent) == 1
    call = sent[0]
    assert call["customer_email"] == "luis@test.cl"
    assert call["store_email"] == "hola@bosque.cl"
    assert call["order_id"] == order.json()["id"][:8].upper()
    assert call["total"] == 2400
    assert call["items"] == [{"name": "Pan", "quantity": 2, "unit_price": 1200}]


def test_order_is_registered_even_if_confirmation_email_fails(client, monkeypatch):
    """Un correo caído no puede tumbar la compra: el pedido se registra igual."""
    def boom(**kwargs):
        raise RuntimeError("Resend caído")

    monkeypatch.setattr(main, "send_order_confirmation", boom)
    response = client.post("/api/orders", json={"customer_email": "luis@test.cl", "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
    assert response.status_code == 201
    assert client.get("/api/orders", headers={"X-Admin-Token": "test-admin-token"}).json()[0]["customer_email"] == "luis@test.cl"


def test_pickup_point_with_slot_in_order(client, admin_headers):
    # El punto es solo **retiro presencial** (D33): ni el punto ni la entrega tienen tipo.
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Retiro presencial Talca", "location": "Plaza de Armas, Talca"}).json()
    assert zone["location"] == "Plaza de Armas, Talca"
    assert "type" not in zone
    # 2026-09-15 es martes (2 en la convención 0 = domingo). La franja no tiene nombre: se
    # identifica por su horario.
    slot = client.post("/api/time-slots", headers=admin_headers, json={"zone_id": zone["id"], "start_time": "11:00", "end_time": "13:00", "weekdays": [2]}).json()
    assert slot["weekdays"] == [2]
    assert "label" not in slot
    assert slot["zone_name"] == "Retiro presencial Talca"
    payload = {"customer_name": "Luis", "scheduled_date": "2026-09-15", "time_slot_id": slot["id"], "shipping_zone_id": zone["id"], "location": zone["location"], "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]}
    order = client.post("/api/orders", json=payload)
    assert order.status_code == 201
    body = order.json()
    assert body["shipping_zone_name"] == "Retiro presencial Talca"
    assert body["time_slot_label"] == "11:00–13:00"
    # La nota del pedido se retiró (D17) y el tipo de entrega (D33).
    assert "notes" not in body
    assert "fulfillment" not in body
    # La franja pertenece a un día: el 2026-09-16 es miércoles.
    assert client.post("/api/orders", json={**payload, "scheduled_date": "2026-09-16"}).status_code == 409
    # El despacho a domicilio no existe (D16) y el tipo se unificó en retiro presencial (D33): un
    # `type` desconocido ya no define nada, el punto se crea igual como retiro presencial.
    ignored = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "A domicilio", "type": "domicilio"})
    assert ignored.status_code == 201
    assert "type" not in ignored.json()


def test_time_slots_belong_to_a_pickup_point(client, admin_headers):
    first = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Retiro presencial San Javier", "location": "Av. Principal 123"}).json()
    second = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "Retiro presencial Talca"}).json()
    base = {"start_time": "16:00", "end_time": "19:00", "weekdays": [1]}
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
    # Edición parcial: cambia los días y el horario.
    updated = client.patch(f"/api/time-slots/{slot_id}", headers=admin_headers, json={"weekdays": [5], "start_time": "10:00"})
    assert updated.status_code == 200
    assert updated.json()["weekdays"] == [5]
    assert updated.json()["start_time"] == "10:00"
    assert client.patch(f"/api/time-slots/{slot_id}", json={"enabled": False}).status_code == 401
    # Deshabilitada: fuera del listado público y tampoco sirve para un pedido.
    assert client.patch(f"/api/time-slots/{slot_id}", headers=admin_headers, json={"enabled": False}).status_code == 200
    assert client.get(f"/api/time-slots?zone_id={first['id']}").json() == []
    assert len(client.get(f"/api/time-slots?zone_id={first['id']}&include_disabled=true").json()) == 1
    order = {"customer_name": "Luis", "scheduled_date": "2026-09-18", "time_slot_id": slot_id, "shipping_zone_id": first["id"], "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]}
    assert client.post("/api/orders", json=order).status_code == 409
    # Y una franja de otro punto se rechaza aunque el día calce.
    other = client.post("/api/time-slots", headers=admin_headers, json={"zone_id": second["id"], "start_time": "11:00", "end_time": "13:00", "weekdays": [6]}).json()
    assert client.post("/api/orders", json={**order, "time_slot_id": other["id"], "scheduled_date": "2026-09-19"}).status_code == 409
    assert client.post("/api/orders", json={**order, "time_slot_id": "00000000-0000-0000-0000-000000000000"}).status_code == 409
    # Al eliminar el punto se van sus franjas.
    assert client.delete(f"/api/shipping-zones/{first['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/time-slots?include_disabled=true").json() == [other]


def test_pickup_point_can_be_edited(client, admin_headers):
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "San Javier", "location": "Av. Principal 123"}).json()
    assert client.patch(f"/api/shipping-zones/{zone['id']}", json={"name": "Otro"}).status_code == 401
    updated = client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"name": "Retiro presencial San Javier", "location": "Plaza de San Javier"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Retiro presencial San Javier"
    assert "type" not in updated.json()
    assert updated.json()["location"] == "Plaza de San Javier"
    assert updated.json()["active"] is True
    # `location: null` la borra y el resto del punto no cambia.
    cleared = client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"location": None}).json()
    assert cleared["location"] is None
    assert cleared["name"] == "Retiro presencial San Javier"
    assert client.patch(f"/api/shipping-zones/{zone['id']}", headers=admin_headers, json={"name": ""}).status_code == 422


def test_fresh_install_creates_tables(monkeypatch):
    """Instalación nueva (sin tablas): la API las crea y la agenda arranca vacía."""
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
            assert fresh.get("/api/time-slots").json() == []
            assert fresh.get("/api/closed-days").json() == []
            # Los cierres semanales se retiraron: la ruta ya no existe.
            assert fresh.get("/api/closed-weekdays").status_code == 404
    finally:
        main.app.dependency_overrides.clear()


def test_puntual_closed_dates_are_kept(client, admin_headers):
    # Lo único que queda de «días cerrados» son las fechas puntuales (feriados, vacaciones).
    assert client.get("/api/closed-days").json() == []
    created = client.post("/api/closed-days", headers=admin_headers, json={"date": "2026-09-18"})
    assert created.status_code == 201
    # Sin motivo: la fecha se explica sola.
    assert "reason" not in created.json()
    assert client.get("/api/closed-days").json()[0]["date"] == "2026-09-18"
    assert client.post(f"/api/closed-days", headers=admin_headers, json={"date": "2026-09-18"}).status_code == 409
    assert client.delete(f"/api/closed-days/{created.json()['id']}", headers=admin_headers).status_code == 204
    assert client.get("/api/closed-days").json() == []


def test_reviews_are_moderated(client, admin_headers):
    product = client.post("/api/products", headers=admin_headers, json={"name": "Torta", "slug": "torta", "price": 9000, "status": "active", "inventory": 5}).json()
    created = client.post("/api/reviews", json={"product_id": product["id"], "author": "María", "rating": 5, "comment": "Deliciosa"})
    assert created.status_code == 201
    assert created.json()["status"] == "pending"
    assert client.get(f"/api/reviews?product_id={product['id']}").json() == []
    # La moderación solo muestra los pendientes (D45): al aprobar, el comentario sale del panel y entra
    # a la tienda.
    assert [r["id"] for r in client.get("/api/reviews/admin", headers=admin_headers).json()] == [created.json()["id"]]
    approved = client.patch(f"/api/reviews/{created.json()['id']}/status", headers=admin_headers, json={"status": "approved"})
    assert approved.status_code == 200
    public = client.get(f"/api/reviews?product_id={product['id']}").json()
    assert len(public) == 1
    assert public[0]["product_name"] == "Torta"
    assert client.get("/api/reviews/admin", headers=admin_headers).json() == []
    # Rechazar **borra** el comentario (D45): no reaparece ni en el panel ni en la tienda.
    rejected = client.post("/api/reviews", json={"product_id": product["id"], "author": "Pedro", "rating": 1, "comment": "No me gustó"}).json()
    assert client.patch(f"/api/reviews/{rejected['id']}/status", headers=admin_headers, json={"status": "rejected"}).status_code == 200
    assert client.get("/api/reviews/admin", headers=admin_headers).json() == []
    assert client.delete(f"/api/reviews/{rejected['id']}", headers=admin_headers).status_code == 404


def test_delivery_zones_cover_local_area_and_charge_fee(client, admin_headers):
    # Sin zonas activas no hay envío y la tienda no lo menciona (D44).
    assert client.get("/api/delivery-zones").json() == []
    assert client.post("/api/delivery-zones", json={"region": "Maule", "city": "Talca"}).status_code == 401
    zone = client.post("/api/delivery-zones", headers=admin_headers, json={
        "country": "Chile", "region": "Región del Maule", "city": "San Javier", "fee": 2500, "free_threshold": 20000,
    }).json()
    assert zone["active"] is True and zone["fee"] == 2500
    other = client.post("/api/delivery-zones", headers=admin_headers, json={"region": "Región del Maule", "city": "Talca", "fee": 3000}).json()
    assert len(client.get("/api/delivery-zones").json()) == 2
    # El panel ve también las inactivas; la tienda no.
    client.patch(f"/api/delivery-zones/{other['id']}", headers=admin_headers, json={"active": False})
    assert len(client.get("/api/delivery-zones").json()) == 1
    assert len(client.get("/api/delivery-zones?include_inactive=true", headers=admin_headers).json()) == 2

    base = {"customer_name": "Luis", "delivery_method": "delivery", "items": [{"name": "Pan", "unit_price": 10000, "quantity": 1}]}
    # Dirección incompleta (falta la Comuna) y comuna sin cobertura: se rechazan antes de cobrar.
    assert client.post("/api/orders", json={**base, "shipping_address": "Av. Principal 1", "shipping_region": "Región del Maule"}).status_code == 422
    assert client.post("/api/orders", json={**base, "shipping_address": "Av. Principal 1", "shipping_region": "Región del Maule", "shipping_city": "Curicó"}).status_code == 409
    # Con cobertura, el envío se suma al total (la tarifa la recalcula la API, no el cliente).
    charged = client.post("/api/orders", json={**base, "shipping_address": "Av. Principal 1", "shipping_region": "Región del Maule", "shipping_city": "San Javier"})
    assert charged.status_code == 201
    body = charged.json()
    assert body["delivery_method"] == "delivery"
    assert body["shipping_fee"] == 2500
    assert body["total"] == 12500
    # Sobre el límite de cobro de la zona, el envío es gratis.
    free = client.post("/api/orders", json={**base, "items": [{"name": "Torta", "unit_price": 25000, "quantity": 1}], "shipping_fee": 0,
                                             "shipping_address": "Av. Principal 1", "shipping_region": "Región del Maule", "shipping_city": "San Javier"}).json()
    assert free["shipping_fee"] == 0
    assert free["total"] == 25000
    # Un pedido de retiro no cobra envío.
    pickup = client.post("/api/orders", json={"customer_name": "Ana", "items": [{"name": "Pan", "unit_price": 5000, "quantity": 1}]}).json()
    assert pickup["delivery_method"] == "pickup" and pickup["shipping_fee"] == 0


# ── Feed de Instagram propio (D30) ──────────────────────────────────────────

GRAPH_MEDIA = [
    {"id": "1", "media_type": "IMAGE", "media_url": "https://img/1.jpg", "permalink": "https://ig/p/1", "caption": "Hola", "like_count": 7, "comments_count": 2, "timestamp": "2026-09-01T00:00:00+0000"},
    {"id": "2", "media_type": "VIDEO", "thumbnail_url": "https://img/2.jpg", "media_url": "https://video/2.mp4", "permalink": "https://ig/reel/2", "like_count": 3, "comments_count": 1},
    {"id": "3", "media_type": "CAROUSEL_ALBUM", "children": {"data": [{"media_type": "IMAGE", "media_url": "https://img/3.jpg"}]}, "permalink": "https://ig/p/3", "like_count": 0, "comments_count": 0},
    # Sin imagen (ni propia, ni miniatura, ni hijos): se descarta en vez de pintar un hueco.
    {"id": "4", "media_type": "IMAGE"},
]


def fake_graph(payload: dict, calls: list[dict] | None = None):
    """Reemplaza a `instagram._graph_get` para no depender de la red en las pruebas."""
    def handler(path: str, params: dict) -> dict:
        if calls is not None:
            calls.append({"path": path, "params": params})
        return payload
    return handler


def test_instagram_feed_normaliza_y_no_expone_el_token(client, monkeypatch):
    # La API entrega las últimas publicaciones ya normalizadas para el widget (imagen, enlace,
    # descripción, likes y comentarios) y **nunca** el token de Instagram.
    from app import instagram

    instagram.reset_feed_cache()
    monkeypatch.setattr(instagram, "_graph_get", fake_graph({"data": GRAPH_MEDIA}))

    response = client.get("/api/instagram/feed")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    # El 4 no tiene imagen, así que no se devuelve.
    assert [post["id"] for post in body["posts"]] == ["1", "2", "3"]
    assert body["posts"][0]["image"] == "https://img/1.jpg"
    assert body["posts"][0]["likes"] == 7 and body["posts"][0]["comments"] == 2
    assert body["posts"][0]["caption"] == "Hola"
    # Video → miniatura; carrusel → primera imagen hija.
    assert body["posts"][1]["is_video"] is True and body["posts"][1]["image"] == "https://img/2.jpg"
    assert body["posts"][2]["is_video"] is False and body["posts"][2]["image"] == "https://img/3.jpg"
    assert "token" not in response.text


def test_instagram_feed_usa_la_cache(client, monkeypatch):
    # El feed se cachea 15 min: la sección se refresca sola cada tanto desde la tienda y no cada visita.
    from app import instagram

    instagram.reset_feed_cache()
    calls: list[dict] = []
    monkeypatch.setattr(instagram, "_graph_get", fake_graph({"data": GRAPH_MEDIA}, calls))

    client.get("/api/instagram/feed")
    client.get("/api/instagram/feed")
    assert len(calls) == 1
    assert calls[0]["params"]["limit"] == 15


def test_instagram_refresh_guarda_el_token_y_el_estado(client, admin_headers, db_session, monkeypatch):
    # Renovación (D30): el token nuevo se guarda y el estado queda disponible para el admin, siempre
    # **sin** devolver el token.
    from app import instagram

    calls: list[dict] = []
    monkeypatch.setattr(instagram, "_graph_get", fake_graph({"access_token": "token-renovado", "expires_in": 5184000}, calls))

    # El token nunca se puede leer sin ser admin.
    assert client.get("/api/instagram/token").status_code == 401
    assert client.post("/api/instagram/refresh").status_code == 401

    refreshed = client.post("/api/instagram/refresh", headers=admin_headers)
    assert refreshed.status_code == 200
    assert calls[0]["path"] == "refresh_access_token"
    assert calls[0]["params"]["grant_type"] == "ig_refresh_token"

    status = client.get("/api/instagram/token", headers=admin_headers).json()
    assert status["configured"] is True
    assert status["source"] == "base_de_datos"
    assert status["refreshed_at"] and status["next_refresh_at"]
    assert status["last_error"] is None
    assert "token" not in refreshed.text
    # Con el token ya renovado, la tarea de fondo no vuelve a llamar a Instagram.
    assert instagram.refresh_if_due(db_session) is False
    assert len(calls) == 1


def test_instagram_refresh_guarda_el_motivo_del_fallo(client, admin_headers, monkeypatch):
    # Si Instagram rechaza la renovación (lo típico: el token todavía no tiene las 24 h que exige), el
    # motivo queda guardado para poder avisar y el próximo ciclo lo reintenta solo.
    from app import instagram

    def error_handler(path: str, params: dict) -> dict:
        raise instagram.InstagramError("Token has not been refreshed in 24 hours")

    monkeypatch.setattr(instagram, "_graph_get", error_handler)
    failed = client.post("/api/instagram/refresh", headers=admin_headers)
    assert failed.status_code == 502
    assert "24 hours" in failed.json()["detail"]

    status = client.get("/api/instagram/token", headers=admin_headers).json()
    assert status["last_error"] == "Token has not been refreshed in 24 hours"
    assert status["source"] == "entorno"  # sigue usando el del entorno hasta que la renovación funcione


def test_orders_por_defecto_solo_los_abiertos(client, admin_headers):
    # El panel pide en el día a día solo los pedidos **abiertos** (pendientes o enviados), que son los que
    # se gestionan y nunca se vuelven cientos; el historial completo (entregados y cancelados) entra con
    # `?include_closed=true`, que es lo que dispara el filtro de la tabla (A63).
    def make(status: str, name: str) -> None:
        created = client.post("/api/orders", json={"customer_name": name, "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
        assert created.status_code == 201
        if status != "pending":
            patched = client.patch(f"/api/orders/{created.json()['id']}/status", headers=admin_headers, json={"status": status})
            assert patched.status_code == 200

    make("pending", "Pendiente")
    make("shipped", "Enviado")
    make("delivered", "Entregado")
    make("cancelled", "Cancelado")

    assert client.get("/api/orders").status_code == 401  # solo admin
    activos = client.get("/api/orders", headers=admin_headers).json()
    assert sorted(order["customer_name"] for order in activos) == ["Enviado", "Pendiente"]

    historial = client.get("/api/orders?include_closed=true", headers=admin_headers).json()
    assert sorted(order["customer_name"] for order in historial) == ["Cancelado", "Entregado", "Enviado", "Pendiente"]


def test_reports_agregan_el_periodo(client, admin_headers, db_session):
    # Los reportes (D21) se calculan en la API: el panel pedía **todos** los pedidos y sumaba en el
    # navegador. Acá se revisa el agregado de un período, la comparación con el tramo anterior y quiénes
    # no suman dinero (cancelados y reembolsados).
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "San Javier"}).json()
    slot = client.post(
        "/api/time-slots",
        headers=admin_headers,
        json={"zone_id": zone["id"], "start_time": "10:00", "end_time": "13:00", "weekdays": [6]},
    ).json()

    def make_order(when: datetime, status: str, total: int, quantity: int, zone_id: str | None = None, slot_id: str | None = None, scheduled: date | None = None) -> None:
        order = Order(
            customer_name="Ana",
            status=status,
            total=total,
            created_at=when,
            shipping_zone_id=zone_id,
            time_slot_id=slot_id,
            scheduled_date=scheduled,
        )
        order.items = [OrderItem(name="Torta", unit_price=1000, quantity=quantity)]
        db_session.add(order)

    # Período: 2026-09-10 → 2026-09-13 (el `to` es exclusivo).
    make_order(datetime(2026, 9, 10, 12, tzinfo=timezone.utc), "delivered", 2000, 2, zone["id"], slot["id"], date(2026, 9, 12))
    make_order(datetime(2026, 9, 11, 12, tzinfo=timezone.utc), "cancelled", 5000, 5, zone["id"])
    make_order(datetime(2026, 9, 12, 12, tzinfo=timezone.utc), "pending", 1000, 1)
    # Tramo anterior de igual largo: 2026-09-07 → 2026-09-10.
    make_order(datetime(2026, 9, 8, 12, tzinfo=timezone.utc), "delivered", 7000, 7, zone["id"])
    # Fuera de todo: no entra en ningún tramo.
    make_order(datetime(2026, 8, 1, 12, tzinfo=timezone.utc), "delivered", 9000, 9)
    db_session.commit()

    assert client.get("/api/reports?from=2026-09-10&to=2026-09-13").status_code == 401  # solo admin

    body = client.get("/api/reports?from=2026-09-10&to=2026-09-13&compare=true", headers=admin_headers).json()
    assert (body["orders"], body["sales_orders"]) == (3, 2)
    assert body["revenue"] == 3000  # el pedido cancelado cuenta como pedido, no como venta
    assert body["units"] == 3
    assert body["pending_pickup"] == 1  # el único pendiente de retirar del período
    assert body["previous"] == {"orders": 1, "sales_orders": 1, "units": 7, "revenue": 7000}
    assert body["oldest_order_at"].startswith("2026-08-01")

    # Ranking por producto: el cancelado no suma ni unidades ni dinero.
    assert body["products"] == [{"name": "Torta", "units": 3, "revenue": 3000}]

    # Punto de retiro: el pedido sin punto cae a «Sin punto definido» y ordena por ingresos.
    assert body["places"] == [
        {"label": "San Javier", "orders": 1, "units": 2, "revenue": 2000},
        {"label": "Sin punto definido", "orders": 1, "units": 1, "revenue": 1000},
    ]

    # Agenda: el sábado 2026-09-12 y la única franja con pedido.
    assert body["weekdays"] == [{"weekday": 6, "orders": 1}]
    assert body["slots"] == [{"label": "10:00–13:00", "orders": 1}]

    # Sin fechas se reporta todo el historial (5 pedidos y 4 que vendieron).
    everything = client.get("/api/reports", headers=admin_headers).json()
    assert everything["from_date"] is None and everything["to_date"] is None
    assert (everything["orders"], everything["sales_orders"]) == (5, 4)
    assert everything["revenue"] == 19000
    assert everything["previous"] is None


def test_performance_indexes_apuntan_a_columnas_existentes():
    """Los índices que se crean al arrancar (A61) deben ser válidos e idempotentes.

    Se ejecutan sobre SQLite (mismo `CREATE INDEX … IF NOT EXISTS`) y dos veces seguidas: así un nombre de
    tabla o de columna mal escrito se detecta acá y no al arrancar la API contra PostgreSQL, que es donde
    corren de verdad.
    """
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    main.Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        for _ in range(2):
            for statement in main.PERFORMANCE_INDEXES:
                connection.execute(text(statement))
        created = set(connection.execute(text("SELECT name FROM sqlite_master WHERE type = 'index'")).scalars().all())
        assert {
            "idx_order_items_order_id",
            "idx_reviews_product_status_created",
            "idx_reviews_status_created",
            "idx_orders_created_at",
        } <= created


def test_order_status_patch_returns_schedule_labels(client, admin_headers):
    # El PATCH de estado devuelve el pedido por el mismo `order_out` que el resto de los endpoints, así
    # que la respuesta trae la franja y el punto de retiro resueltos (antes volvían en `null`).
    zone = client.post("/api/shipping-zones", headers=admin_headers, json={"name": "San Javier"}).json()
    slot = client.post(
        "/api/time-slots",
        headers=admin_headers,
        json={"zone_id": zone["id"], "start_time": "10:00", "end_time": "13:00", "weekdays": [6]},
    ).json()
    created = client.post(
        "/api/orders",
        json={
            "customer_name": "Ana",
            "scheduled_date": "2026-09-19",  # sábado
            "time_slot_id": slot["id"],
            "shipping_zone_id": zone["id"],
            "items": [{"name": "Pan", "unit_price": 1000, "quantity": 2}],
        },
    )
    assert created.status_code == 201

    patched = client.patch(f"/api/orders/{created.json()['id']}/status", headers=admin_headers, json={"status": "shipped"})
    assert patched.status_code == 200
    assert patched.json()["status"] == "shipped"
    assert patched.json()["time_slot_label"] == "10:00–13:00"
    assert patched.json()["shipping_zone_name"] == "San Javier"


def test_orders_with_missing_products_are_rejected(client, admin_headers):
    # Los productos se validan en una sola consulta: un id inexistente sigue siendo 409 (bajo pedido).
    payload = {
        "customer_name": "Ana",
        "items": [
            {"product_id": "00000000-0000-0000-0000-000000000000", "name": "Fantasma", "unit_price": 1000, "quantity": 1},
        ],
    }
    rejected = client.post("/api/orders", json=payload)
    assert rejected.status_code == 409
    assert "Fantasma" in rejected.json()["detail"]


def test_deleting_a_category_leaves_products_without_category(client, admin_headers):
    category = client.post("/api/categories", headers=admin_headers, json={"name": "Tortas", "slug": "tortas"}).json()
    product = client.post(
        "/api/products",
        headers=admin_headers,
        json={"name": "Torta de chocolate", "slug": "torta-chocolate", "price": 9000, "category_id": category["id"]},
    ).json()
    assert client.delete(f"/api/categories/{category['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/products/{product['id']}").json()["category_id"] is None
