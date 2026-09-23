import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["API_ADMIN_TOKEN"] = "test-admin-token"
os.environ["AUTH_JWT_SECRET"] = "test-jwt-secret"
os.environ["ADMIN_EMAILS"] = "admin@test.cl"
os.environ["DATABASE_URL"] = "sqlite://"
# Feed de Instagram propio (D30): credenciales de mentira. Las pruebas **nunca** llaman a Instagram
# (se reemplaza `instagram._graph_get`) y la tarea de fondo espera un ciclo entero antes de su primera
# revisión, así que no hay red en la suite.
os.environ["INSTAGRAM_USER_ID"] = "17841434442618145"
os.environ["INSTAGRAM_ACCESS_TOKEN"] = "test-instagram-token"

from app import main  # noqa: E402
from app.database import Base, get_db  # noqa: E402


@pytest.fixture()
def engine_and_session(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(main, "engine", engine)
    yield engine, Session
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(engine_and_session):
    _, Session = engine_and_session

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = override_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()


@pytest.fixture
def db_session(engine_and_session):
    _, Session = engine_and_session
    session = Session()
    yield session
    session.close()


@pytest.fixture
def admin_headers():
    return {"X-Admin-Token": "test-admin-token"}