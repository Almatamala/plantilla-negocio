# Plan de Implementación — BOSQUE

**Proyecto:** Tienda BOSQUE (repostería)
**Basado en:** `RPD.md` (decisiones D1–D54; D5, D6, D11 y D23 quedaron retiradas)
**Fecha:** 2026-10-07 · **Estado:** documento vivo — despliegue y pendientes

---

## 0. Cómo usar este documento

- **Qué queda acá:** lo que **falta hacer** y cómo **desplegar**. El **estado actual del código** y las
  **decisiones** (D1–D54, con D5, D6, D11 y D23 retiradas) viven en `RPD.md`, incluido el detalle de los
  ajustes ya implementados (el historial por tanda que tenía este documento en §3 se retiró).
- **Regla del proyecto (AGENTS.md):** antes de escribir código, leer la guía correspondiente en
  `node_modules/next/dist/docs/` (esta versión de Next.js tiene breaking changes respecto de lo conocido).
- **Verificación de cada cambio:** `npx tsc --noEmit`, `npm run lint` y `npm run build`; en `backend/`,
  `pytest`.

---

## 1. Transición a AWS — qué considerar al desplegar

Hoy la tienda corre en local (Next + API dockerizada con `docker-compose.backend.yml`). Al pasar a AWS:

1. **Reconstruir y redesplegar la imagen de la API (obligatorio).** El `Dockerfile` copia el código
   (`COPY . .`) y arranca `uvicorn` **sin `--reload`**, así que un contenedor viejo sirve código viejo.
   En local basta `docker compose -f docker-compose.backend.yml up --build -d`; en AWS, subir la imagen a
   ECR y redesplegar (ECS/EC2). Los **índices** de A61 y los `ALTER`/`DROP` de columnas retiradas se
   ejecutan también al arrancar: sin reconstruir la imagen, la base queda sin ellos y con columnas que ya
   nadie usa (entre las últimas bajas están las tres tarjetas de beneficios, **D54**).
2. **Schema sin Alembic.** Las tablas se crean al arrancar con `Base.metadata.create_all`, que **no** altera
   tablas existentes. Para mantener al día una base ya creada, la API ejecuta al arrancar listas
   idempotentes de `ALTER TABLE …`/`DROP … IF EXISTS` **solo en PostgreSQL** (catálogo retirado, columnas de
   verificación y de contenido, agenda y ajustes retirados). Entre los últimos retiros están
   `time_slots.label`, `closed_days.reason` y la tabla `closed_weekdays` (**D32**), el tipo del punto y el de
   la entrega   `shipping_zones.type` / `orders.fulfillment` (**D33**), los datos bancarios
   `store_settings.bank_account_info` (**D34**) y la reserva de stock `orders.expires_at` junto con
   `products.allow_backorder` (el «bajo pedido» ahora es **implícito**); además se **agrega**
   `products.preparation_days` (los **días de preparación**, **D35**). Un `UPDATE` convierte a `active` los
   productos con estados retirados (`draft`, `sold_out`, `preorder`, **D36**) y otro convierte a `pending`
   los pedidos guardados en `paid`/`preparing` (estados unificados, **D37**). Con **D44** se **crea** la tabla `delivery_zones` (envíos por comuna) y se **agregan** `profiles.address`/`region`/`city` y las columnas de entrega de `orders` (`delivery_method`, `shipping_address`, `shipping_region`, `shipping_city`, `shipping_fee`). El usuario de la base
   debe tener permiso DDL; en RDS, verificar que no esté restringido. En una base nueva no hace nada.
3. **Variables de entorno.** `AUTH_JWT_SECRET` debe ser **el mismo** en Next.js y en la API (si difiere, las
   sesiones dejan de validar); `CORS_ORIGINS` debe incluir el dominio de producción; `ADMIN_EMAILS` define
   quién obtiene rol `admin`; `NEXT_PUBLIC_API_URL` apunta al dominio/balanceador de la API.
4. **Instagram.** `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN` van en el entorno de la **API** (ver §2).
5. **Imágenes (`/api/upload`).** Montar un volumen persistente (EFS/EBS) en `UPLOAD_DIR` o migrar a S3 para
   no perder fotos al reiniciar contenedores.
6. **Health check** del target group: `/health`.

> Regla práctica: **cada cambio en `backend/` exige reconstruir la imagen** antes de probar en el frontend;
> si no, aparecerán `404`/`405` por rutas que en el código ya existen.

---

## 2. Instagram — renovación automática del token (D31)

El token **no se le pasa a la página**: se carga **una sola vez en el entorno de la API** y la API se
encarga del resto (consulta, caché y renovación).

1. **En la API, no en Next.** Definir `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN` en `backend/.env` (o el
   `.env` de la raíz que usa `docker compose`) en local, y en las variables del servicio en AWS
   (`backend/.env.example` las documenta; `docker-compose.backend.yml` ya las pasa).
2. **Una sola vez.** Al arrancar, `backend/app/instagram.py` guarda el token en la tabla `instagram_token` y
   una **tarea de fondo** lo renueva sola (revisa cada 12 h y renueva pasados 50 de los 60 días). Desde ahí
   el valor del entorno deja de usarse: no hay que recalcularlo ni volver a cargarlo.
3. **El navegador nunca ve el token.** El widget (`components/instagram-grid.tsx`) solo lee
   `GET /api/instagram/feed`, que devuelve las publicaciones normalizadas; no hay `NEXT_PUBLIC_*` ni route
   handler de Next para Instagram.
4. **Diagnóstico y renovación manual (admins):** `GET /api/instagram/token` (estado, origen y última falla) y
   `POST /api/instagram/refresh` para adelantar la renovación.

> **Seguridad:** el token se compartió por chat, así que conviene **rotarlo** desde la cuenta de Instagram
> antes de dejarlo en producción; al renovarse, la API guarda el nuevo en la base y el del entorno deja de
> usarse.

---

## 3. Ajustes del dueño

El historial de los ajustes pedidos por el dueño y ya implementados (**A37–A76**) se retiró de este
documento: todo eso está en el código y sus decisiones (**D1–D54**) viven en `RPD.md`, que es donde se
consulta qué existe hoy y por qué. Las referencias «A…» que quedan en el RPD son marcas de esos ajustes.
Lo que **falta** está en §4 y el checklist de la pasarela en §5.

## 4. Pendientes

1. **Webpay Plus (D8):** solicitar credenciales TBK e integrar el SDK en `app/api/webpay/*` (el `create`
   que arma la transacción y su `returnUrl`, y el `commit` del retorno). Ya están hechas la **página de
   retorno** (`/checkout/retorno`) y la **confirmación por correo** al cliente y a la tienda. Antes de
   activarlo hay que cumplir la **checklist de §5**. Es el **único medio de pago** del checkout y del
   panel; hasta activarlo, el pedido se registra y el pago se coordina por WhatsApp.
2. **Credenciales externas:** OAuth Client de Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), cuenta y
   dominio **verificados** en **Resend** (`RESEND_API_KEY`/`RESEND_EMAIL_FROM`) y **rotar** el token de Instagram.
3. **Seed de agenda y envíos:** cargar en Agenda los **puntos reales de retiro presencial** (San Javier / Talca) con
   su ubicación y sus **franjas** (días + horario), y las **zonas de envío** reales (comuna + tarifa + límite de cobro,
   D44). El **catálogo real ya está cargado**.
4. **Desplegar en AWS** (§1): reconstruir la imagen de la API y cargar las variables de entorno. Sin la
   reconstrucción, la tienda no ve los **destacados** (`GET /api/products/highlights`, D54) —la sección cae
   al catálogo que ya tiene— y la base se queda con las columnas retiradas de los beneficios.

---

## 5. Webpay Plus — restricciones y «por si acaso» (checklist de activación)

Referencias: `https://www.transbankdevelopers.cl/documentacion/webpay-plus` y
`https://ayuda.transbank.cl/errores-webpay-plus`. El objetivo es que **ninguna** transacción deje la tienda
en un estado raro: ni un pedido **pagado sin marcar**, ni un pedido marcado **dos veces**, ni un token
expuesto.

### 5.1 Credenciales y entornos
- Dos juegos de credenciales: **integración** (`webpay3gint.transbank.cl`) y **producción**
  (`webpay3g.transbank.cl`). No se mezclan: un `TBK_COMMERCE_CODE`/llaves apunta a **un** entorno.
- Variables: `TBK_COMMERCE_CODE`, `TBK_API_KEY_ID`, `TBK_API_KEY_SECRET`, `TBK_ENVIRONMENT`
  (`integration`|`production`) en el **servidor**, y `NEXT_PUBLIC_WEBPAY_ENABLED` (solo UI) en el frontend.
- En **integración** el código de comercio es **compartido** entre integradores: un `buyOrder` repetido
  puede chocar con otra integración (falla al anular). El `buyOrder` debe ser único de verdad.
- Las llaves **nunca** van en `NEXT_PUBLIC_*` ni al navegador: solo en los route handlers y en el backend.
  Si se filtraron, se regeneran en el portal de Transbank (igual que el token de Instagram).

### 5.2 Datos de la transacción (límites duros)
| Campo | Restricción | En nuestro caso |
|---|---|---|
| `buyOrder` | obligatorio, **único**, ≤ **26** caracteres | El id del pedido es un UUID de 36 → **no sirve directo**. Guardar un `buy_order` propio por intento (`BO-` + 20 chars). |
| `sessionId` | obligatorio, no vacío, ≤ **61** caracteres | Usar el id del pedido acotado. |
| `amount` | entero en **pesos**, sin decimales, > 0 | Recalcular en el servidor desde los ítems; **nunca** confiar en el monto que manda el cliente. |
| `returnUrl` | absoluta, http/https, **estable** | `NEXT_PUBLIC_SITE_URL` + `/api/webpay/confirm`; jamás armarla desde un parámetro del cliente. |

### 5.3 Flujo y métodos HTTP
- `POST /transactions` crea (devuelve `token` + `url`), `PUT /transactions/{token}` **confirma** (commit),
  `GET /transactions/{token}` consulta estado y `POST /transactions/{token}/refund` reversa.
- El **retorno del navegador llega por POST** con `token_ws` en el cuerpo (form): el route handler debe
  exportar **`POST`** además de `GET`. Hoy `app/api/webpay/confirm/route.ts` solo tiene `GET` → **corregir
  antes de activar** (si no, el commit falla con 405).
- **Compra anulada:** llega por **GET** con `TBK_TOKEN`, `TBK_ORDEN_COMPRA` y `TBK_ID_SESION` (sin
  `token_ws`). Se muestra `anulado` (ya implementado).
- El commit se hace **solo** en el retorno: Webpay no tiene webhook, no hay que confirmar dos veces.

### 5.4 Idempotencia y «por si acaso» del retorno
- **Refrescar la página de retorno** (F5) o volver atrás repite el POST: guardar el resultado por `token` y
  **cortocircuitar** (si ya se confirmó, no volver a llamar a Transbank).
- El `token_ws` es **de un solo uso y de vida corta**: si expiró o ya se usó, mostrar `error`/`rechazado`
  con salida por WhatsApp, sin reintentar el commit.
- El redirect final **no debe llevar `token_ws`** en la URL (evita reprocesos y filtración en el historial):
  usar `estado` + `pedido` (ya implementado).
- **No depender de la cookie de sesión** en el POST de retorno: es navegación *cross-site* y `SameSite=Lax`
  no la envía en POST. El **invitado** debe poder confirmar igual (la cookie sí sirve en el GET posterior).
- Deshabilitar el botón de pago mientras se crea la transacción: dos clics no pueden crear dos transacciones.
- `proxy.ts` no debe interceptar `/api/webpay/*` ni `/checkout/retorno`.

### 5.5 Dinero, stock y estado del pedido
- La tienda trabaja **bajo pedido** (**D35**): el pedido se crea antes de pagar y **no** toca el stock (no
  hay reserva ni expiración ni devolución: nunca se retuvo nada).
- Estados: con **D37** el pedido no cambia de estado al pagar (sigue `pending`); el commit debe ser
  **idempotente** (registrar el pago una sola vez aunque lleguen dos confirmaciones).
- Comparar **monto confirmado vs. total del pedido**: si no coinciden, **no** marcar pagado y alertar.
- Asociar `buyOrder`/`sessionId`/`token` al pedido en la base para poder consultar y auditar.

### 5.6 Confirmación segura en el backend (fuente de verdad)
- El route handler **no** puede confirmar un pago con un endpoint público: hoy
  `PATCH /api/orders/{id}/status` exige admin. Agregar un endpoint dedicado (p. ej.
  `POST /api/orders/{id}/payment`) con **secreto compartido** (`API_ADMIN_TOKEN` o uno propio) que reciba
  token, `buyOrder`, monto, código de autorización, tipo de pago y fecha; que **valide el monto** y sea
  **idempotente**. La llamada es **servidor a servidor**. Con **D37** este endpoint **no** cambia el
  estado del pedido: registra el pago (en `payment_method` y la transacción guardada) y el pedido sigue
  en `pending`.

### 5.7 Reconciliación (por si el cliente cierra el navegador)
- Si el cliente paga y **cierra la pestaña** sin volver, el pago queda autorizado en Transbank y el pedido
  sin marcar. Guardar el `token` y ofrecer al admin **consultar el estado** (`GET /transactions/{token}`)
  desde el panel, más un trabajo periódico que revise los pendientes con token. El retorno **no** siempre
  ocurre: la reconciliación es la red de seguridad.

### 5.8 Reembolsos y anulaciones
- La reversa (`refund`) es solo para admin, con confirmación y monto ≤ pagado; dejar el pedido en
  `refunded` y guardar el resultado. Definir explícitamente si la reversa **devuelve stock** (no es
  automático).

### 5.9 Despliegue (AWS)
- El `returnUrl` debe ser **público y con HTTPS** (el dominio real, no el interno) e **idéntico** al
  registrado. Detrás de un ALB, `request.nextUrl.origin` puede dar `http://localhost` o el host interno:
  armar el `returnUrl` con `NEXT_PUBLIC_SITE_URL` (o `x-forwarded-host`/`x-forwarded-proto`).
- Frontend y route handlers deben usar el **mismo** juego de credenciales; al pasar a producción se
  cambian llaves y `TBK_ENVIRONMENT` juntos. El gate real es tener credenciales: `NEXT_PUBLIC_WEBPAY_ENABLED`
  solo esconde la UI.

### 5.10 Pruebas antes de activar
- **Nunca** llamar a Transbank en la suite: reemplazar el SDK (`create`/`commit`/`status`/`refund`) con
  mocks, como se hace con Instagram.
- Casos: create OK · commit `AUTHORIZED` · commit rechazado · commit `null`/anulado · token expirado o ya
  usado · retorno duplicado (**idempotencia**) · monto distinto · pedido inexistente · red/5xx de Transbank.
- Probar en **integración** con las tarjetas de prueba (aprobada/rechazada) de Transbank Developers antes
  de producción.

### 5.11 Errores de la API (para el manejo de errores)
- `400` JSON inválido · `401` llaves malas · `404` transacción no encontrada · `405` método incorrecto
  (POST para crear, PUT para confirmar) · `415` `Content-Type` incorrecto · `422` validación/lógica ·
  `500` error inesperado.
- Límites por comercio: `-97` monto acumulado del día · `-98` monto máximo por transacción · `-99`
  cantidad de transacciones del día.
- Si hay fallas generales, revisar `https://status.transbankdevelopers.cl/`. **Nunca** marcar un pedido
  como pagado sin una respuesta `AUTHORIZED`.

### 5.12 Checklist de activación
- [ ] `POST` en `/api/webpay/confirm` (hoy solo `GET`).
- [ ] `buyOrder`/`sessionId` propios, únicos y ≤ 26/61 caracteres, guardados por pedido.
- [ ] Monto recalculado en el servidor y validado contra la confirmación.
- [ ] Endpoint interno **idempotente** para registrar el pago (con secreto); no cambia el estado (D37).
- [ ] Página de retorno sin `token_ws` en la URL y sin depender de la cookie.
- [ ] Reintento de pago **sin duplicar el pedido**.
- [ ] Reconciliación de pagos sin retorno (consulta de estado).
- [ ] Reembolso admin (con política de stock).
- [ ] `returnUrl` absoluto con HTTPS vía `NEXT_PUBLIC_SITE_URL`.
- [ ] Pruebas con mocks + integración con tarjetas de prueba.

