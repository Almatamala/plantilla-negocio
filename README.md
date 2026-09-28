# Tienda BOSQUE

Plantilla de comercio para repostería artesanal: tienda pública con pedidos agendados (retiro
presencial), carrito, cuenta de cliente y panel de administración.

| Parte | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router, React 19, Tailwind v4) |
| API (fuente de verdad) | FastAPI + SQLAlchemy + PostgreSQL, en `backend/` |
| Sesión | JWT en cookie httpOnly; `proxy.ts` exige rol admin en `/admin` |
| Correo | Resend (códigos de confirmación y avisos de pedido) |
| Pagos | Webpay Plus (pendiente de credenciales TBK; ver `PLAN.md` §5) |

## Cómo levantarlo

```bash
# 1) API + base de datos (PostgreSQL 16 + FastAPI)
docker compose -f docker-compose.backend.yml up --build -d

# 2) Frontend
npm install
npm run dev            # http://localhost:3000
```

La API queda en `http://localhost:8000` (`/health` responde el estado). El frontend la busca con
`NEXT_PUBLIC_API_URL`; sin esa variable usa `http://localhost:8000`.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend | Dominio de la API |
| `AUTH_JWT_SECRET` | Frontend **y** API | Debe ser el mismo en los dos o las sesiones no validan |
| `NEXT_PUBLIC_SITE_URL` | Frontend | `returnUrl` de Webpay |
| `NEXT_PUBLIC_WEBPAY_ENABLED` | Frontend | Solo esconde/muestra la UI de pago |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | API | Login con Google |
| `RESEND_API_KEY` / `RESEND_EMAIL_FROM` | API | Correos |
| `ADMIN_EMAILS` | API | Quién obtiene rol `admin` |
| `CORS_ORIGINS` | API | Dominios permitidos |
| `INSTAGRAM_USER_ID` / `INSTAGRAM_ACCESS_TOKEN` | API | Feed de Instagram (el token se renueva solo) |
| `TBK_*` | API / route handlers | Credenciales de Webpay Plus |

## Estructura

- `app/` — rutas: tienda (`/`), ficha (`/producto/[slug]`), checkout y su retorno, cuenta, login,
  panel (`/admin`) y editor visual de la página (`/admin/editor`). Los route handlers de `app/api/`
  solo median entre el navegador y la API (login, Google, Webpay).
- `components/` — interfaz de la tienda y del panel.
- `lib/` — tipos y utilidades compartidas (API, carrito, sesión, catálogo, pedidos, agenda, tema).
- `backend/` — API FastAPI: modelos, schemas, endpoints, correos e Instagram. Crea y migra las tablas
  al arrancar.
- `PLAN.md` — pendientes y despliegue (AWS, Webpay).
- `RPD.md` — estado actual del código y decisiones (D1–D39).

## Verificación

```bash
npx tsc --noEmit     # tipos
npm run lint         # eslint
npm run build        # compilación
cd backend && pytest # API
```

> Cada cambio en `backend/` exige reconstruir la imagen de la API antes de probar en el frontend;
> el contenedor arranca sin `--reload`.
