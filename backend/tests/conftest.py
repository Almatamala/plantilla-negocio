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
os.environ["DATABASE_URL"] = "sqlite://"

from app import main  # noqa: E402
from app.database import Base, get_db  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    def override_db():
        db = Session()
        try: yield db
        finally: db.close()
    monkeypatch.setattr(main, "engine", engine)
    main.app.dependency_overrides[get_db] = override_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


@pytest.fixture
def admin_headers():
    return {"X-Admin-Token": "test-admin-token"}
