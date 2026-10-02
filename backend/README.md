# BOSQUE API (FastAPI dockerizada)

La API es la **única fuente de verdad** de la tienda: catálogo (fotos, ingredientes, alérgenos,
stock y **días de preparación**), agenda (franjas horarias, fechas cerradas, **puntos de retiro presencial
con ubicación y horario**), reviews, órdenes (sin despacho a domicilio, D16), ajustes de la
tienda y subida de imágenes. Se despliega dockerizada (AWS) y el frontend la consume
vía HTTP (`NEXT_PUBLIC_API_URL`).

## Endpoints principales

| Endpoint | Métodos | Acceso |
|---|---|---|
| `/api/products`, `/api/products/slug/{slug}` | GET | Público (el panel usa `/api/products?include_inactive=true`) |
| `/api/products` | POST/PUT/DELETE | Admin (`X-Admin-Token`) |
| `/api/shipping-zones`, `/api/time-slots?zone_id=&include_disabled=`, `/api/closed-days` | GET | Público |
| Ídem | POST/PATCH/DELETE | Admin |
| `/api/time-slots` | POST con `zone_id`, `weekdays`, `start_time`, `end_time` (la franja siempre cuelga de un punto) | Admin |
| `/api/reviews` | GET (aprobadas), POST | Público |
| `/api/reviews/admin`, PATCH status, DELETE | — | Admin |
| `/api/orders` | GET | Admin |
| `/api/orders` | POST | Público (no toca stock: la tienda es **bajo pedido**; avisa por correo al cliente y a la tienda) |
| `/api/orders/{id}/status` | PATCH | Admin |
| `/api/orders/{id}` | PUT (corrige datos del pedido; no toca el stock) | Admin |
| `/api/settings` | GET / PUT | Público / Admin |
| `/api/instagram/feed?limit=15` | GET (publicaciones ya normalizadas, **nunca el token**) | Público |
| `/api/instagram/token` | GET (estado y próxima renovación, sin el token) | Admin |
| `/api/instagram/refresh` | POST (fuerza la renovación; es lo que hace la tarea de fondo) | Admin |
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
(por ejemplo `time_slots.zone_id`/`weekdays`, el retiro de `shipping_zones.areas`/`schedule`,
`orders.notes` y de `store_settings.products_per_page`, ya que la cantidad de productos por página
quedó **fija en 8**, y de `store_settings.instagram_embed_url`, al reemplazar el widget de terceros por el
**feed propio** con la API de Instagram (D30); más la columna de contenido `theme_colors` —la **paleta
editable** desde el panel—, las de `store_settings.hero_image` y `store_settings.hero_logo` (la **foto del
hero** y su **logo** opcional, editables en el editor visual de la página, D47/D49) y la de
`products.preparation_days` (los **días de preparación**, D35). También se
retiran `products.allow_backorder` (el «bajo pedido» ahora es **implícito** de toda la tienda) y
`orders.expires_at` (la antigua **reserva de stock**), además de `shipping_zones.type` y
`orders.fulfillment` (retiro presencial y punto de encuentro se unificaron, D33) y
`store_settings.bank_account_info` (la web no publica datos bancarios, D34); un `UPDATE` convierte a
`active` los productos con **estados retirados** (`draft`, `sold_out`, `preorder`, D36); y otro
convierte a `pending` los pedidos en los **estados retirados** `paid` y `preparing` (los estados del
pedido quedaron unificados, D37). Ver la transición a AWS en **§1 de `PLAN.md`**.

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
| `INSTAGRAM_USER_ID` | ID de la cuenta profesional de Instagram del feed propio (D30) |
| `INSTAGRAM_ACCESS_TOKEN` | Token de **larga duración** de la *Instagram API with Instagram Login*. Es el valor de **arranque**: la API guarda y renueva el vigente en la tabla `instagram_token` (ver abajo) |
| `INSTAGRAM_REFRESH_DAYS` | Días que se espera antes de renovar (por defecto **50**; el token dura 60) |
| `INSTAGRAM_REFRESH_CHECK_HOURS` | Cada cuántas horas la tarea de fondo revisa el token (por defecto **12**) |

## Feed de Instagram propio y renovación automática del token (D30)

La sección de Instagram de la tienda la sirve esta API (`GET /api/instagram/feed`): acá vive el token, acá
se consulta Instagram y acá se **renueva solo**. El frontend solo recibe las publicaciones normalizadas
(imagen, enlace, descripción, likes y comentarios), así que el token nunca sale del servidor.

- **Cómo se renueva:** al arrancar la API se lanza una **tarea de fondo** (`app/instagram.py`) que revisa
  el token cada `INSTAGRAM_REFRESH_CHECK_HOURS` y, cuando pasaron `INSTAGRAM_REFRESH_DAYS` desde la última
  renovación, llama a `GET /refresh_access_token` de Instagram y guarda el token nuevo en la tabla
  `instagram_token`. Instagram exige que el token tenga **al menos 24 h** y que **no esté vencido**: si el
  intento falla, el motivo queda en `instagram_token.last_error` (visible en `GET /api/instagram/token`) y
  el ciclo siguiente lo reintenta solo. No hace falta ningún cron externo.
- **De dónde sale el token:** primero el que renovó la tarea (`instagram_token`, la fuente normal); si
  todavía no existe, el de `INSTAGRAM_ACCESS_TOKEN`. En una instalación nueva, la tarea empieza a renovar
  por su cuenta, así que el valor del entorno solo se usa al principio.
- **Para revisar o adelantar la renovación** (admin): `GET /api/instagram/token` muestra `source`,
  `refreshed_at`, `next_refresh_at` y `last_error`; `POST /api/instagram/refresh` la fuerza ahora mismo.
- **Si el token vence sin renovarse**, la sección de Instagram simplemente **no se dibuja** (no rompe la
  tienda): por eso `last_error` es el dato a mirar.

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

## Confirmación del pedido por correo (cliente y tienda)

Las mismas credenciales de Resend se usan para avisar de un pedido nuevo (D8): al registrar una orden
(`POST /api/orders`), la API envía la **confirmación al cliente** (al correo que dejó en el checkout) y el
**aviso a la tienda** (al correo de contacto de `store_settings`, editable en Contenido). El envío es de
**mejor esfuerzo**: sin credenciales se omite (queda en el log) y cualquier fallo se registra, pero la
compra nunca se cae. Si ambos correos coinciden se envía un solo mensaje.

## Bajo pedido y días de preparación (D35)

Esta plantilla es para negocios que **hacen el pedido con tiempo**, así que todo el catálogo se trabaja
**bajo pedido**: la compra nunca se bloquea por stock y el pedido **no descuenta ni reserva inventario**
(la antigua reserva con vencimiento se retiró). El `inventory` queda como número **informativo** que el
admin ajusta a mano.

Cada producto declara sus **días de preparación** (`preparation_days`, por defecto **0**). El checkout
empuja el primer día agendable para que el pedido alcance a prepararse: aunque el punto de retiro atienda
antes, esos días no se ofrecen. Los días cerrados puntuales y los días en que el punto no atiende siguen
bloqueando su fecha como siempre.

## Estados del producto (D36)

El producto tiene **solo dos estados**: `active` (visible en la tienda) e `inactive` (oculto en la tienda
pero visible en el panel de inventario). `GET /api/products` devuelve **solo los activos**; el panel pide el
catálogo completo con `?include_inactive=true`. Un producto nuevo nace **activo**. Los estados antiguos
(`draft`, `sold_out`, `preorder`) ya no existen: se convierten a `active` al arrancar la API y el schema los
rechaza (`422`).

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

Las pruebas usan SQLite en memoria y cubren: token administrativo (clave y JWT), catálogo,
CRUD de categorías, reglas de entrada, cálculo de órdenes, **bajo pedido implícito** (el pedido no toca el
stock y las **fechas de preparación** se guardan por producto), **correo de
confirmación del pedido** (cliente y tienda, más el armado del correo y el caso de un envío caído), agenda
por punto (**franjas con días de la semana**: la API rechaza
franjas deshabilitadas, de otro punto o de un día que no corresponde), **puntos de retiro presencial con
ubicación** (sin tipo de punto ni de entrega, D33), **fechas cerradas puntuales**, moderación de reviews y
sesión de
usuarios (auth sin credenciales, `/api/auth/me`, roles admin/customer, vínculo orden→perfil y
**confirmación por correo**: código correcto/incorrecto, expiración, límite de intentos, reenvíos y
desactivación cuando faltan las credenciales de Resend) y la **paleta de la tienda**: guardado de los
cinco tonos, normalización a minúsculas y rechazo de tonos desconocidos o valores que no sean un hex de
seis dígitos.