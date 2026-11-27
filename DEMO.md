# Demo interactiva — cómo publicarla

Una URL pública, un solo proyecto y datos de ejemplo listos para hacer clic: tienda, ficha de
producto, carrito, checkout, cuenta de cliente y panel de administración. **Sin cobros reales, sin
correos, sin Google y sin Instagram**: todo lo externo queda apagado y la demo se apoya en tu
catálogo real, exportado de la base.

| Pieza | Dónde vive |
|---|---|
| Frontend (Next.js 16) | servicio `frontend` de Vercel Services |
| API (FastAPI) | servicio `backend` del mismo proyecto |
| Base de datos | PostgreSQL administrado (externo) |
| URL pública | una sola: la del proyecto de Vercel |

El navegador habla con la API por `https://<dominio>/api/backend/*`; el `vercel.json` enruta ese
prefijo al servicio `backend` y le quita `/api/backend` antes de que la API vea la ruta. Como todo
sale del mismo dominio, no hay CORS ni segunda URL que configurar en el frontend.

> Los datos viven en la base y cualquiera con la cuenta demo puede editarlos desde el panel: es una
> demo, no una tienda en producción. Lo que no se puede hacer en la demo (pagos, correos, Google,
> Instagram) está al final.

---

## 1. Base de datos

Crea un PostgreSQL administrado (Neon, Supabase, Railway o RDS sirven) y copia su cadena de conexión.
Para psycopg tiene que empezar con `postgresql+psycopg://`:

```
postgresql+psycopg://usuario:clave@host/base?sslmode=require
```

Las tablas se crean solas cuando arranca la API, y la siembra del paso 5 deja los datos de demo.
No hace falta ejecutar SQL a mano.

## 2. Proyecto en Vercel

1. Importa el repositorio en Vercel.
2. En **Settings → Build and Deployment**, cambia el **Framework** a **Services** (si no, Vercel
   compila solo el frontend y el `backend` nunca se despliega).
3. Define las variables del paso 3 y despliega.

`vercel.json` ya declara los dos servicios, así que no hay que configurar carpetas ni comandos.

## 3. Variables de entorno

Se definen una sola vez en el proyecto y las comparten los dos servicios.

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<dominio>/api/backend` |
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio>` |
| `NEXT_PUBLIC_WEBPAY_ENABLED` | `false` |
| `AUTH_JWT_SECRET` | cadena aleatoria larga (`openssl rand -hex 32`) |
| `API_ADMIN_TOKEN` | otra cadena aleatoria; la usa la siembra |
| `DATABASE_URL` | la cadena del paso 1 |
| `ADMIN_EMAILS` | `demo@bosque.cl` |
| `CORS_ORIGINS` | `https://<dominio>` |
| `UPLOAD_DIR` | `/tmp/uploads` |
| `STORE_NAME` | `BOSQUE` |
| `STORE_URL` | `https://<dominio>` |

**Déjalo vacío a propósito:** `RESEND_API_KEY`, `RESEND_EMAIL_FROM`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y todo `TBK_*`. Sin Resend la confirmación por correo se
desactiva y las cuentas entran activas; sin credenciales de Google el login social se esconde.

Dos detalles de Vercel:

- `NEXT_PUBLIC_*` se **inyecta al compilar**. Si cambias el dominio de la demo, actualiza
  `NEXT_PUBLIC_API_URL` y vuelve a desplegar.
- `UPLOAD_DIR=/tmp/uploads` es obligatorio porque el sistema de archivos del servicio es de solo
  lectura: sin esa variable la API no arranca. Las fotos que se suban desde el panel vivirán solo
  mientras dure la instancia (para la demo, las fotos del catálogo ya vienen en `public/demo`).

### Instagram en la demo

El feed de Instagram **también funciona en la demo**: la siembra (paso 5) le pasa el token de larga
duración y la cuenta a la API con `PUT /api/instagram/token`, que las valida contra Instagram y las
guarda en la base de la demo. Por eso no hace falta copiar el token como variable de Vercel: basta con
tenerlo en tu `.env` al sembrar, y la sección aparece sola cuando el feed responde.

Si prefieres configurarlo como variables del proyecto, define `INSTAGRAM_USER_ID` e
`INSTAGRAM_ACCESS_TOKEN` y la API las usa de arranque; el token guardado en la base manda sobre ellas.
En ambos casos el token se renueva solo cada 50 días, y si la base de la demo se recrea hay que volver
a sembrar para recuperar las credenciales (o dejar las variables como respaldo).

## 4. Llevar tus datos actuales a la demo

La demo no usa un catálogo inventado: se siembra con lo que ya tienes en la base. Con la API local
levantada (o contra la desplegada, pasándole su URL y su token):

```bash
API_ADMIN_TOKEN=change-me-in-development npm run demo:export
```

Escribe `scripts/demo-snapshot.json` con las categorías, los productos (precio, descripción,
ingredientes, alérgenos), los textos y colores de la tienda, el punto de retiro con sus franjas y las
zonas de envío. Además copia las fotos de `/uploads` a `public/demo` —reducidas a 1600 px— y reescribe
las URLs, que en la base apuntan a `http://localhost:8000` y en un deploy no existirían.

**No exporta pedidos ni cuentas**: son datos de clientes. La siembra crea tres pedidos de ejemplo a
partir de los productos exportados. Los precios se copian tal como estén en la base: revísalos antes
de publicar.

El archivo se versiona con el repo, así que el deploy no necesita tu base. Si borras
`scripts/demo-snapshot.json`, la siembra cae al catálogo de ejemplo de la plantilla. Cuando cambies
productos o textos en la base, vuelve a correr `npm run demo:export` y luego la siembra.

## 5. Sembrar los datos de la demo

Con la API ya desplegada, desde tu computador (Node 20+):

```bash
DEMO_API_URL=https://<dominio>/api/backend \
API_ADMIN_TOKEN=<el mismo de Vercel> \
INSTAGRAM_ACCESS_TOKEN=<el de tu .env> \
INSTAGRAM_USER_ID=17841434442618145 \
npm run demo:seed
```

En PowerShell:

```powershell
$env:DEMO_API_URL="https://<dominio>/api/backend"; $env:API_ADMIN_TOKEN="<token>"; $env:INSTAGRAM_ACCESS_TOKEN="<token>"; $env:INSTAGRAM_USER_ID="17841434442618145"; npm run demo:seed
```

Las dos variables de Instagram son opcionales: sin ellas la tienda funciona igual y la sección de
Instagram no se muestra. Si pasas solo el token, la cuenta la devuelve Instagram al validarlo.

La siembra es **idempotente** y crea:

- las categorías y los productos del snapshot (o los seis de ejemplo si no hay snapshot), con sus
  fotos en `public/demo`;
- el punto de retiro con sus franjas y las zonas de envío;
- los textos, las fotos del hero/historia y los colores de la tienda;
- las credenciales de Instagram del feed (token y cuenta), si pasaste `INSTAGRAM_ACCESS_TOKEN`;
- tres pedidos de ejemplo (uno entregado, para que Reportes tenga datos) y dos comentarios aprobados
  si estás usando el catálogo de ejemplo;
- la cuenta de administración **demo@bosque.cl / bosque-demo**.

Si el registro responde que la cuenta ya existe pero el rol no es admin, es porque `ADMIN_EMAILS` no
la incluía al crearla: corrige la variable y vuelve a correr la siembra con una cuenta nueva o con la
base limpia.

## 6. Comprobar

- `https://<dominio>/` — tienda con tus productos y tus fotos.
- `https://<dominio>/api/backend/health` — `{"status":"ok"}` (la API a través del dominio).
- `https://<dominio>/api/backend/api/products` — el catálogo en JSON.
- `https://<dominio>/api/backend/api/instagram/feed?limit=3` — las publicaciones del feed; si responde
  `configured: false`, la siembra no recibió el token.
- `https://<dominio>/login` — entra con la cuenta demo y el panel queda en `/admin`.

## Qué no hace la demo

| Tema | En la demo |
|---|---|
| Pagos | Webpay está apagado: el pedido se registra y el pago se coordina (es un demo, no se cobra). |
| Correos | Sin Resend no se envía nada; los pedidos igual quedan registrados. |
| Google | Sin credenciales, el botón de Google no aparece. |
| Instagram | Con token (lo carga la siembra), el feed real de la cuenta. Sin token, la sección no se muestra. |
| Fotos subidas | Se guardan en `/tmp` y se pierden al reciclar la instancia. |
| Datos | Son de mentira y cualquiera con la cuenta demo puede cambiarlos. |

Para **volver a empezar**: reejecuta la siembra (restaura lo que se haya borrado) o crea una base
nueva, apunta `DATABASE_URL` a ella y vuelve a sembrar. Los pedidos que hayan hecho los visitantes no
se borran con la siembra, porque la API no permite eliminar pedidos; para un estado realmente limpio
usa una base nueva.

## Alternativa local

Si solo necesitas la demo en tu computador, no hace falta Vercel:

```bash
docker compose -f docker-compose.backend.yml up --build -d   # Postgres + API en :8000
npm install && npm run dev                                   # tienda en :3000
npm run demo:seed                                            # datos + cuenta demo
```

El script usa `http://localhost:8000` por defecto y la clave `change-me-in-development` del compose,
así que solo necesita `npm run demo:seed`.
