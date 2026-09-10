# BOSQUE API (FastAPI dockerizada)

La API es la **única fuente de verdad** de la tienda: catálogo (fotos, ingredientes, alérgenos,
stock), agenda (franjas horarias, días cerrados, zonas de entrega), reviews, órdenes con despacho,
ajustes de la tienda y subida de imágenes. Se despliega dockerizada (AWS) y el frontend la consume
vía HTTP (`NEXT_PUBLIC_API_URL`).

## Endpoints principales

| Endpoint | Métodos | Acceso |
|---|---|---|
| `/api/products`, `/api/products/slug/{slug}` | GET | Público |
| `/api/products` | POST/PUT/DELETE | Admin (`X-Admin-Token`) |
| `/api/time-slots`, `/api/closed-days`, `/api/shipping-zones` | GET | Público |
| Ídem | POST/PATCH/DELETE | Admin |
| `/api/reviews` | GET (aprobadas), POST | Público |
| `/api/reviews/admin`, PATCH status, DELETE | — | Admin |
| `/api/orders` | GET | Admin |
| `/api/orders` | POST | Público (decrementa stock server-side) |
| `/api/orders/{id}/status` | PATCH | Admin |
| `/api/settings` | GET / PUT | Público / Admin |
| `/api/upload` | POST (multipart) | Admin |
| `/api/auth/register` | POST (name, email, password) | Público (crea cuenta y emite sesión) |
| `/api/auth/login` | POST (email, password) | Público (emite sesión JWT) |
| `/api/auth/google/authorize` | GET | Público (devuelve URL de Google) |
| `/api/auth/google/callback` | GET (code) | Público (intercambia y emite sesión JWT) |
| `/api/auth/me` | GET | Sesión (Bearer) |
| `/health` | GET | Público |

## Local con Docker

Desde la raíz del repositorio:

```bash
docker compose -f docker-compose.backend.yml up --build
```

Quedan disponibles PostgreSQL en `localhost:5432`, la API en `http://localhost:8000`
(documentación interactiva en `/docs`) y las imágenes subidas en el volumen `uploads_data`
(servidas en `/uploads`).

Las tablas se crean automáticamente al arrancar desde `backend/app/models.py` (SQLAlchemy).

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (o `sqlite://` para desarrollo sin Docker) |
| `API_ADMIN_TOKEN` | Clave para mutaciones administrativas (`X-Admin-Token`). **Cámbiala antes de desplegar.** |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma (frontend en dev y producción) |
| `UPLOAD_DIR` | Carpeta donde se guardan las imágenes subidas |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | URI de retorno (apunta al route handler de Next, p. ej. `http://localhost:3000/api/auth/google/callback`). Debe estar registrada en Google Cloud Console |
| `ADMIN_EMAILS` | Correos separados por coma que reciben rol `admin` al iniciar sesión |
| `AUTH_JWT_SECRET` | Secreto para firmar la sesión JWT. **Debe ser el mismo en Next.js y en la API.** |

## Login con Google (clientes y administradores)

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com) y genera
   credenciales **OAuth Client ID / Secret** (tipo *Web application*).
2. Agrega como *Authorized redirect URI* el valor de `GOOGLE_REDIRECT_URI`.
3. Define las variables de entorno de arriba (o en `docker-compose.backend.yml`).
4. El flujo es: frontend → `GET /api/auth/google/authorize` → Google → callback → JWT de sesión.
   El frontend guarda ese JWT en una cookie httpOnly y lo envía como `Authorization: Bearer`
   cuando hace falta (mutaciones admin con rol `admin` o `/api/auth/me`).
5. Las órdenes creadas con un `customer_email` que coincida con un perfil quedan vinculadas
   automáticamente a ese usuario (`orders.customer_id`).

## Despliegue en AWS

1. **Base de datos:** usa el contenedor `db` del compose (EBS) o Amazon RDS/PostgreSQL (recomendado en producción). En ese caso apunta `DATABASE_URL` a RDS.
2. **API:** sube la imagen `backend` a ECR y desplégala en ECS (Fargate) o EC2. Define `API_ADMIN_TOKEN` fuerte y `CORS_ORIGINS` con el dominio del frontend (p. ej. `https://tu-tienda.cl`).
3. **Imágenes:** monta un volumen persistente en `UPLOAD_DIR` (EFS o EBS) para que las fotos no se pierdan entre reinicios. Para multi-instancia, evalúa mover `/api/upload` a S3.
4. **Health check:** usa `/health` en el target group.
5. **Frontend:** define `NEXT_PUBLIC_API_URL` con el dominio o balanceador de la API.

## Desarrollo y pruebas

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest
```

Las pruebas usan SQLite en memoria y cubren: token administrativo (clave y JWT), catálogo con
variantes, reglas de entrada, cálculo de órdenes, **decremento de stock con auto-desactivación**,
bajo pedido, agenda/zonas en la orden, moderación de reviews y sesión de usuarios (auth sin
credenciales, `/api/auth/me`, roles admin/customer y vínculo orden→perfil).