# Backend local

La API usa FastAPI, SQLAlchemy y PostgreSQL. Sus modelos cubren el catálogo, variantes, inventario, órdenes, contenido y ajustes definidos en `supabase/schema.sql`.

## Docker

Desde la raíz del repositorio:

```powershell
docker compose -f docker-compose.backend.yml up --build
```

Quedarán disponibles PostgreSQL en `localhost:5432` y la API en `http://localhost:8000`. La documentación interactiva está en `http://localhost:8000/docs`.

Para mutar recursos administrativos, envía el header `X-Admin-Token: change-me-in-development`. Cámbialo mediante variables de entorno antes de cualquier despliegue.

## Desarrollo sin Docker para la API

```powershell
cd backend
Copy-Item .env.example .env
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Mantén PostgreSQL levantado con `docker compose -f docker-compose.backend.yml up db`.

## Pruebas

```powershell
cd backend
pytest
```

Las pruebas usan SQLite en memoria para ser rápidas y no modificar la base Docker. Validan token administrativo, catálogo con variantes, reglas de entrada y cálculo de órdenes.
