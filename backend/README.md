# BOSQUE API (FastAPI dockerizada)

La API es la **única fuente de verdad** de la tienda: catálogo (fotos, ingredientes, alérgenos,
stock), agenda (franjas horarias, días cerrados, **puntos de retiro y encuentro con ubicación y
horario**), reviews, órdenes (sin despacho a domicilio, ver PLAN §0.7 / D16), ajustes de la tienda y
subida de imágenes. Se despliega dockerizada (AWS) y el frontend la consume
vía HTTP (`NEXT_PUBLIC_API_URL`).

## Endpoints principales

| Endpoint | Métodos | Acceso |
|---|---|---|
| `/api/products`, `/api/products/slug/{slug}` | GET | Público |
| `/api/products` | POST/PUT/DELETE | Admin (`X-Admin-Token`) |
| `/api/shipping-zones`, `/api/time-slots?zone_id=&include_disabled=`, `/api/closed-days`, `/api/closed-weekdays` | GET | Público |
| Ídem | POST/PATCH/DELETE | Admin |
| `/api/time-slots` | POST con `zone_id`, `weekdays`, `start_time`, `end_time` (la franja siempre cuelga de un punto) | Admin |
| `/api/reviews` | GET (aprobadas), POST | Público |
| `/api/reviews/admin`, PATCH status, DELETE | — | Admin |
| `/api/orders` | GET | Admin |
| `/api/orders` | POST | Público (decrementa stock server-side) |
| `/api/orders/{id}/status` | PATCH | Admin |
| `/api/orders/{id}` | PUT (corrige datos del pedido; no recalcula stock) | Admin |
| `/api/settings` | GET / PUT | Público / Admin |
| `/api/upload` | POST (multipart) | Admin |
| `/api/auth/register` | POST (name, email, password) | Público (crea la cuenta; con confirmación activa envía el código de 6 dígitos y **no** emite sesión) |
| `/api/auth/verify-email` | POST (email, code) | Público (confirma el código y emite sesión JWT) |
| `/api/auth/resend-code` | POST (email) | Público (reenvía el código: máx. 3 reenvíos) |
| `/api/auth/login` | POST (email, password) | Público (emite sesión JWT; `403` si el correo no está confirmado) |
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

Las tablas se crean automáticamente al arrancar desde `backend/app/models.py` (SQLAlchemy). Los cambios
posteriores de columnas se aplican al arrancar **solo en PostgreSQL** con `ALTER TABLE` idempotentes
(por ejemplo `time_slots.zone_id`/`weekdays`, el retiro de `shipping_zones.areas`/`schedule` y
`orders.notes`; ver PLAN §0.7 y §0.8). En una instalación nueva, el domingo queda como **día cerrado
semanal** por defecto (`closed_weekdays`).

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
| `RESEND_API_KEY` / `RESEND_EMAIL_FROM` | Credenciales de [Resend](https://resend.com) para la confirmación de cuentas por correo. **Si están vacías, la verificación queda desactivada** y las cuentas nuevas entran activas |
| `RESEND_API_URL` | Endpoint de Resend (por defecto `https://api.resend.com/emails`; útil para pruebas) |
| `STORE_NAME` / `STORE_URL` | Nombre del negocio y enlace a la tienda que aparecen en el correo |

## Confirmación de cuenta por correo (código de 6 dígitos)

1. Crea una cuenta en [Resend](https://resend.com), **verifica el dominio** del negocio y genera una
   API key. Sin dominio verificado solo se puede enviar desde `onboarding@resend.dev` (sirve para
   probar, pero solo llega a tu propia casilla).
2. Define `RESEND_API_KEY` y `RESEND_EMAIL_FROM` (por ejemplo `pedidos@tu-tienda.cl`).
3. Flujo: `POST /api/auth/register` crea el perfil **sin sesión**, genera un código de 6 dígitos
   (guardado hasheado, vence en 15 minutos, máx. 3 reenvíos y 5 intentos) y envía el correo
   personalizado del negocio. Luego `POST /api/auth/verify-email` confirma el código y emite la sesión.
4. Las cuentas creadas con **Google** entran ya confirmadas. Las cuentas **existentes** antes de esta
   función quedan confirmadas por la migración automática (`ALTER TABLE` al arrancar en PostgreSQL).
5. Sin credenciales de Resend la verificación se desactiva a propósito: el registro sigue creando la
   cuenta activa para no dejar la tienda sin acceso. Al definir las credenciales se activa sola.

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
variantes, CRUD de categorías, reglas de entrada, cálculo de órdenes, **decremento de stock con
auto-desactivación**, bajo pedido, agenda por punto (**franjas con días de la semana**: la API rechaza
franjas deshabilitadas, de otro punto o de un día que no corresponde), **puntos de retiro con ubicación**
(el tipo `domicilio` se rechaza), **cierres semanales** con domingo por defecto, moderación de reviews y
sesión de
usuarios (auth sin credenciales, `/api/auth/me`, roles admin/customer, vínculo orden→perfil y
**confirmación por correo**: código correcto/incorrecto, expiración, límite de intentos, reenvíos y
desactivación cuando faltan las credenciales de Resend).