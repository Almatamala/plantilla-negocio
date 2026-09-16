import os
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app import main
from app.models import Profile

FAR_FUTURE = 4102444800  # 2100 — exp válida para tests


@pytest.fixture
def verification(monkeypatch):
    """Activa la confirmación por correo y captura los códigos enviados."""
    sent: list[str] = []
    monkeypatch.setattr(main.settings, "resend_api_key", "test-key")
    monkeypatch.setattr(main.settings, "resend_email_from", "tienda@test.cl")

    def fake_send(**kwargs):
        sent.append(kwargs["code"])
        return True

    monkeypatch.setattr(main, "send_verification_code", fake_send)
    return sent


def register(client, email: str = "cliente@test.cl"):
    return client.post("/api/auth/register", json={"name": "Cliente", "email": email, "password": "password123"})


def session_token(sub: str, role: str) -> str:
    return jwt.encode(
        {"sub": sub, "role": role, "exp": FAR_FUTURE},
        os.environ["AUTH_JWT_SECRET"],
        algorithm="HS256",
    )


def test_google_authorize_not_configured(client):
    assert client.get("/api/auth/google/authorize").status_code == 503


def test_google_callback_not_configured(client):
    assert client.get("/api/auth/google/callback", params={"code": "abc", "state": "xyz"}).status_code == 503


def test_auth_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_auth_me_rejects_invalid_token(client):
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_auth_me_returns_profile(client, db_session):
    db_session.add(Profile(id="user-1", email="cliente@test.cl", name="Cliente", role="customer"))
    db_session.commit()
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {session_token('user-1', 'customer')}"})
    assert response.status_code == 200
    assert response.json()["email"] == "cliente@test.cl"
    assert response.json()["role"] == "customer"


def test_admin_jwt_grants_admin_access(client, db_session):
    db_session.add(Profile(id="admin-1", email="admin@test.cl", role="admin"))
    db_session.commit()
    response = client.post(
        "/api/categories",
        headers={"Authorization": f"Bearer {session_token('admin-1', 'admin')}"},
        json={"name": "Catálogo", "slug": "catalogo"},
    )
    assert response.status_code == 201


def test_customer_jwt_cannot_access_admin(client):
    response = client.post(
        "/api/categories",
        headers={"Authorization": f"Bearer {session_token('user-1', 'customer')}"},
        json={"name": "Catálogo", "slug": "catalogo"},
    )
    assert response.status_code == 401


def test_order_links_customer_by_email(client, db_session):
    db_session.add(Profile(id="user-2", email="camila@test.cl", name="Camila", role="customer"))
    db_session.commit()
    order = client.post(
        "/api/orders",
        json={
            "customer_name": "Camila",
            "customer_email": "camila@test.cl",
            "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}],
        },
    )
    assert order.status_code == 201
    assert order.json()["customer_id"] == "user-2"


def test_order_rejects_unknown_customer_id(client):
    response = client.post(
        "/api/orders",
        json={
            "customer_id": "no-existe",
            "customer_name": "Luis",
            "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}],
        },
    )
    assert response.status_code == 409


def test_register_creates_customer_and_logs_in(client):
    registered = client.post(
        "/api/auth/register",
        json={"name": "Cliente", "email": "cliente@test.cl", "password": "password123"},
    )
    assert registered.status_code == 201
    data = registered.json()
    assert data["user"]["role"] == "customer"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "cliente@test.cl"


def test_register_admin_by_allowlist(client):
    registered = client.post(
        "/api/auth/register",
        json={"name": "Dueño", "email": "admin@test.cl", "password": "password123"},
    )
    assert registered.status_code == 201
    assert registered.json()["user"]["role"] == "admin"
    token = registered.json()["token"]
    assert client.post(
        "/api/categories",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Catálogo", "slug": "catalogo"},
    ).status_code == 201


def test_register_duplicate_email_rejected(client):
    payload = {"name": "Cliente", "email": "cliente@test.cl", "password": "password123"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_register_short_password_rejected(client):
    assert client.post(
        "/api/auth/register",
        json={"name": "Cliente", "email": "cliente@test.cl", "password": "corta"},
    ).status_code == 422


def test_login_with_password(client):
    client.post(
        "/api/auth/register",
        json={"name": "Cliente", "email": "cliente@test.cl", "password": "password123"},
    )
    response = client.post("/api/auth/login", json={"email": "cliente@test.cl", "password": "password123"})
    assert response.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {response.json()['token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "cliente@test.cl"


def test_login_wrong_password_rejected(client):
    client.post(
        "/api/auth/register",
        json={"name": "Cliente", "email": "cliente@test.cl", "password": "password123"},
    )
    response = client.post("/api/auth/login", json={"email": "cliente@test.cl", "password": "incorrecta"})
    assert response.status_code == 401


def test_google_only_profile_cannot_login_with_password(client):
    client.post("/api/auth/login", json={"email": "nadie@test.cl", "password": "password123"})
    # Sin perfil previo → 401 con mensaje genérico (no revela si el correo existe).
    assert client.post("/api/auth/login", json={"email": "nadie@test.cl", "password": "password123"}).status_code == 401


def test_patch_auth_me_updates_name_and_phone(client, db_session):
    db_session.add(Profile(id="user-9", email="cliente@test.cl", name="Cliente", role="customer"))
    db_session.commit()
    headers = {"Authorization": f"Bearer {session_token('user-9', 'customer')}"}
    updated = client.patch("/api/auth/me", headers=headers, json={"name": "Cliente Nuevo", "phone": "+56912345678"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Cliente Nuevo"
    assert updated.json()["phone"] == "+56912345678"


def test_patch_auth_me_requires_session(client):
    assert client.patch("/api/auth/me", json={"phone": "+56912345678"}).status_code == 401


def test_register_requires_email_verification(client, verification):
    registered = register(client)
    assert registered.status_code == 201
    body = registered.json()
    assert body["verification_required"] is True
    assert "token" not in body
    assert len(verification) == 1

    # Sin confirmar el correo no se puede iniciar sesión.
    blocked = client.post("/api/auth/login", json={"email": "cliente@test.cl", "password": "password123"})
    assert blocked.status_code == 403
    assert "confirmado" in blocked.json()["detail"]

    # Código incorrecto → 400.
    assert client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": "000000"}).status_code == 400

    verified = client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": verification[0]})
    assert verified.status_code == 200
    data = verified.json()
    assert data["user"]["email_verified"] is True
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['token']}"})
    assert me.status_code == 200
    assert client.post("/api/auth/login", json={"email": "cliente@test.cl", "password": "password123"}).status_code == 200


def test_expired_code_is_rejected(client, db_session, verification):
    register(client)
    profile = db_session.query(Profile).filter(Profile.email == "cliente@test.cl").one()
    profile.verification_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    db_session.commit()
    response = client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": verification[0]})
    assert response.status_code == 400


def test_code_is_locked_after_too_many_attempts(client, verification):
    register(client)
    for _ in range(5):
        assert client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": "000000"}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": verification[0]}).status_code == 429


def test_resend_code_respects_wait_and_limit(client, db_session, verification):
    register(client)
    assert client.post("/api/auth/resend-code", json={"email": "cliente@test.cl"}).status_code == 429  # espera mínima
    profile = db_session.query(Profile).filter(Profile.email == "cliente@test.cl").one()
    profile.verification_sent_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    profile.verification_sends = main.VERIFICATION_MAX_SENDS
    db_session.commit()
    assert client.post("/api/auth/resend-code", json={"email": "cliente@test.cl"}).status_code == 429  # máximo alcanzado
    assert len(verification) == 1


def test_resend_code_sends_a_new_code(client, db_session, verification):
    register(client)
    profile = db_session.query(Profile).filter(Profile.email == "cliente@test.cl").one()
    profile.verification_sent_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    db_session.commit()
    assert client.post("/api/auth/resend-code", json={"email": "cliente@test.cl"}).status_code == 200
    assert len(verification) == 2
    assert client.post("/api/auth/verify-email", json={"email": "cliente@test.cl", "code": verification[1]}).status_code == 200


def test_verification_disabled_without_email_provider(client):
    """Sin credenciales de Resend la cuenta entra activa (la tienda no se bloquea)."""
    registered = register(client)
    assert registered.status_code == 201
    assert registered.json()["verification_required"] is False
    assert registered.json()["token"]
    assert client.post("/api/auth/login", json={"email": "cliente@test.cl", "password": "password123"}).status_code == 200


def test_orders_me_returns_only_own_orders(client, db_session):
    db_session.add(Profile(id="user-a", email="a@test.cl", role="customer"))
    db_session.add(Profile(id="user-b", email="b@test.cl", role="customer"))
    db_session.commit()
    client.post("/api/orders", json={"customer_email": "a@test.cl", "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
    client.post("/api/orders", json={"customer_email": "a@test.cl", "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
    client.post("/api/orders", json={"customer_email": "b@test.cl", "items": [{"name": "Pan", "unit_price": 1000, "quantity": 1}]})
    mine = client.get("/api/orders/me", headers={"Authorization": f"Bearer {session_token('user-a', 'customer')}"})
    assert mine.status_code == 200
    assert len(mine.json()) == 2
    assert client.get("/api/orders/me").status_code == 401