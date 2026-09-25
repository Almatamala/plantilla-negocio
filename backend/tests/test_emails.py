"""Correos transaccionales (Resend): confirmación del pedido al cliente y aviso a la tienda.

Se prueba el armado del correo y los destinatarios, reemplazando `requests.post` para no salir a la red.
"""

from app import emails


class FakeResponse:
    status_code = 200
    text = "ok"


def capture(monkeypatch) -> list[dict]:
    """Reemplaza el POST a Resend y devuelve la lista de cuerpos enviados."""
    calls: list[dict] = []
    monkeypatch.setattr(emails.requests, "post", lambda url, **kwargs: calls.append(kwargs["json"]) or FakeResponse())
    return calls


def test_order_email_includes_items_and_total():
    html = emails.order_email_html(
        store_name="BOSQUE",
        store_url="https://bosque.cl",
        for_store=False,
        order_id="ABC12345",
        customer_name="Luis",
        items=[{"name": "Pan", "quantity": 2, "unit_price": 1200}],
        total=2400,
        scheduled_date="2026-09-30",
        time_slot="11:00–13:00",
        place="Retiro San Javier",
        payment_method="Webpay",
    )
    assert "ABC12345" in html
    assert "Pan" in html
    assert "$2.400" in html
    assert "Retiro San Javier" in html
    assert "Luis" in html


def test_send_order_confirmation_reaches_customer_and_store(monkeypatch):
    calls = capture(monkeypatch)
    result = emails.send_order_confirmation(
        order_id="ABC12345",
        customer_name="Luis",
        customer_email="luis@test.cl",
        items=[{"name": "Pan", "quantity": 1, "unit_price": 1000}],
        total=1000,
        store_name="BOSQUE",
        store_email="hola@bosque.cl",
        api_key="key",
        sender="tienda@test.cl",
    )
    assert result == {"customer": True, "store": True}
    assert [call["to"] for call in calls] == [["luis@test.cl"], ["hola@bosque.cl"]]
    assert "Confirmamos tu pedido" in calls[0]["subject"]
    assert "Nuevo pedido" in calls[1]["subject"]


def test_send_order_confirmation_skips_duplicate_store_address(monkeypatch):
    calls = capture(monkeypatch)
    result = emails.send_order_confirmation(
        order_id="X",
        customer_email="hola@bosque.cl",
        items=[{"name": "Pan", "quantity": 1, "unit_price": 100}],
        total=100,
        store_name="BOSQUE",
        store_email="hola@bosque.cl",
        api_key="key",
        sender="tienda@test.cl",
    )
    assert result == {"customer": True, "store": False}
    assert len(calls) == 1


def test_send_order_confirmation_without_credentials_is_skipped(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(emails.requests, "post", lambda url, **kwargs: calls.append(kwargs))
    result = emails.send_order_confirmation(
        order_id="X",
        customer_email="luis@test.cl",
        items=[{"name": "Pan", "quantity": 1, "unit_price": 100}],
        total=100,
        store_name="BOSQUE",
        store_email="hola@bosque.cl",
        api_key="",
        sender="",
    )
    assert result == {"customer": False, "store": False}
    assert calls == []
