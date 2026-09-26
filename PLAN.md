# Plan de Implementación — BOSQUE

**Proyecto:** Tienda BOSQUE (repostería)
**Basado en:** `RPD.md` (decisiones D1–D36)
**Fecha:** 2026-09-25 · **Estado:** documento vivo — despliegue y pendientes

---

## 0. Cómo usar este documento

- **Qué queda acá:** lo que **falta hacer** y cómo **desplegar**. El **estado actual del código** y las
  **decisiones** (D1–D36) viven en `RPD.md`.
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
   ECR y redesplegar (ECS/EC2).
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
   los pedidos guardados en `paid`/`preparing` (estados unificados, **D37**). El usuario de la base
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

## 3. Últimos ajustes del dueño (2026-09-25)

**Implementado y verificado** (`pytest` 54/54; `tsc`, `lint` y `build` sin errores). Diez puntos, con cinco
decisiones nuevas (**D32**, **D33**, **D34**, **D35** y **D36**):

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A37** | Cómo pasar el token de Instagram (solo necesario una vez) | Ver **§2**: el token vive en la API y se renueva solo; la página nunca lo recibe. |
| **A38** | Los enlaces Productos / Beneficios / Nosotros con la misma tipografía que el nombre | Se probó con la clase `display` y se **revirtió** el mismo día a pedido del dueño: queda como estaba. |
| **A39** | En **Inicio** del panel, «Ventas del período» no decía de qué período y sobraba el botón «Actualizar primero» | La métrica pasa a **«Ventas del último mes»** (los **últimos 30 días móviles**) y se **elimina el botón** «Actualizar primero». |
| **A40** | En **Agenda**: quitar el cierre «todas las semanas», mantener solo las fechas puntuales (sin motivo) y quitar el nombre de la franja | **D32:** los días libres salen de los **días de cada franja** + **fechas cerradas puntuales**; se retiran `closed_weekdays`, `time_slots.label` y `closed_days.reason`. La sección de cierres queda como **«Fechas cerradas»**. |
| **A41** | Quitar todo lo relacionado con la cuenta bancaria y el pago por transferencia | **D34:** se retiran el ajuste **«Datos de transferencia bancaria»** de Contenido, el bloque **«Datos para transferir»** del checkout y el medio de pago **Transferencia** (más **Efectivo** en el panel). Checkout y panel quedan **solo con Webpay** (D8); hasta activarlo, el pago se coordina por WhatsApp. |
| **A42** | Retiro presencial y punto de encuentro son lo mismo: unificarlos en solo retiro presencial | **D33:** se retira el tipo del punto (`shipping_zones.type`) y el de la entrega (`orders.fulfillment`). Agenda, Pedidos, Reportes, Checkout y Cuenta muestran siempre **Retiro presencial** (el punto se identifica por su nombre). |
| **A43** | Página visible al volver de Webpay | **D8:** nueva **`/checkout/retorno`** con el estado del pago (**ok / rechazado / anulado / error**), la referencia del pedido y qué sigue; `/api/webpay/confirm` redirige ahí. El `commit` con el SDK queda pendiente de las credenciales TBK. |
| **A44** | Correo de confirmación del pedido | **D8:** al registrar un pedido el backend envía con **Resend** la **confirmación al cliente** (correo del checkout) y el **aviso a la tienda** (correo de Contenido). Es de **mejor esfuerzo**: sin Resend se omite y nunca tumba la compra. WhatsApp automático queda descartado por ahora. |
| **A45** | Días de preparación para una tienda que trabaja **bajo pedido** | **D35:** todo el catálogo se vende **bajo pedido** (se retira `allow_backorder`; el stock no bloquea la compra ni se descuenta) y cada producto declara **días de preparación**, que empujan el primer día agendable del checkout. Se elimina la **reserva de stock** con expiración. |
| **A46** | Los estados del inventario quedan solo en **activo** e **inactivo** | **D36:** solo **activo** (visible en la tienda) e **inactivo** (oculto en la tienda, visible en el panel). Se retiran `draft`, `sold_out` y `preorder`, unificados en `active`; el catálogo público filtra por `active` y el panel pide `?include_inactive=true`. El filtro de stock «Bajo pedido (sin stock)» pasa a **«Sin stock»**. |
| **A47** | En el panel, unificar los estados de pedido **pendiente/pagado/preparando** en «Pendiente»; quitar el tag de stock de la vitrina y la ficha; opción para **eliminar un producto** | **D37:** `paid` y `preparing` se unifican en `pending` (un pedido en preparación ya está pagado), el panel ofrece Pendiente/Enviado/Entregado/Cancelado y la API convierte los pedidos viejos al arrancar. Se retira la etiqueta de disponibilidad («Disponible»/«Bajo Pedido») de «Productos destacados» y de la ficha —seguía apareciendo porque dependía del **stock**, no del estado del producto— y `stockLabel` sale de `lib/products.ts`. Se agrega el botón de **eliminar producto** en el panel (la API `DELETE /api/products/{id}` ya existía). |

**Decisión D32 (nueva):** los días que no se atiende salen de los **días de cada franja** (por punto, D18) y
de las **fechas cerradas puntuales** (`closed_days`). Se retira el cierre semanal `closed_weekdays` porque
duplicaba los días de la franja y, al ser global, cerraba el día para todos los puntos. La franja **no tiene
nombre** (se identifica por su horario) y la fecha cerrada **no pide motivo**.

**Decisiones D33 y D34 (nuevas):** **D33** unifica **retiro presencial** y **punto de encuentro** en un
solo tipo (se retiran `shipping_zones.type` y `orders.fulfillment`), y **D34** saca la **transferencia** de
la web (se retiran `store_settings.bank_account_info` y el medio de pago; checkout y panel quedan **solo con
Webpay**, D8, y hasta activarlo el pago se coordina por WhatsApp).

**Decisión D35 (nueva):** toda la tienda trabaja **bajo pedido**: la compra nunca se bloquea por stock y el
pedido **no descuenta ni reserva** inventario (se retiran `app/stock.py`, `orders.expires_at`, el estado
`expired` y el ajuste `allow_backorder`). Cada producto declara sus **días de preparación**
(`preparation_days`, **0** por defecto); el checkout empuja el primer día agendable para que el pedido
alcance a prepararse y el **calendario arranca en el primer día disponible**, sin mostrar los días
bloqueados previos.

**Decisión D36 (nueva):** el producto tiene **solo dos estados**, `active` e `inactive`. El **inactivo** no se
ve en la tienda pero sí en el panel de inventario, así que el catálogo público filtra por `active` y el panel
pide todo con `?include_inactive=true`. Se retiran `draft`, `sold_out` y `preorder` (unificados en `active`),
los productos guardados en esos estados se convierten a `active` al arrancar la API, y un producto nuevo
nace **activo**.

**Decisión D37 (nueva):** el pedido arranca y se gestiona en **un solo estado inicial, `pending`**. Un pedido
«en preparación» ya está pagado —se pagó en la web o se acordó al cargarlo en el panel—, así que `paid` y
`preparing` no aportaban información y se unifican en `pending`; quedan `pending`, `shipped`, `delivered`,
`cancelled` y `refunded` (que el panel y la cuenta muestran como **Cancelado**). El panel ofrece
Pendiente / Enviado / Entregado / Cancelado y los pedidos guardados en `paid`/`preparing` se convierten a
`pending` al arrancar la API. **Ajusta D8** (Webpay): al confirmar el pago el pedido **no cambia de
estado**; el pago se registra en los datos de la transacción (§5.6/§5.7), así que el commit idempotente no
necesita un estado «Pagado». **A47** retira además la etiqueta de disponibilidad de la vitrina y la ficha
(seguía apareciendo porque dependía del stock, no del estado del producto) y suma el borrado de productos
en el panel.

**Al desplegar:** **reconstruir la imagen de la API** (hay `ALTER TABLE`/`DROP TABLE` al arrancar; ver §1). El
`DROP TABLE IF EXISTS closed_weekdays` deja de cerrar los días que estuvieran marcados semanalmente: los que
deban seguir cerrados se ajustan en los **días de cada franja** desde Agenda.

---

## 4. Pendientes

1. **Webpay Plus (D8):** solicitar credenciales TBK e integrar el SDK en `app/api/webpay/*` (el `create`
   que arma la transacción y su `returnUrl`, y el `commit` del retorno). Ya están hechas la **página de
   retorno** (`/checkout/retorno`) y la **confirmación por correo** al cliente y a la tienda. Antes de
   activarlo hay que cumplir la **checklist de §5**. Es el **único medio de pago** del checkout y del
   panel; hasta activarlo, el pedido se registra y el pago se coordina por WhatsApp.
2. **Notificación automática de WhatsApp (D9):** elegir proveedor (API de Meta Cloud vs. enlace `wa.me`). El
   botón flotante `wa.me` ya funciona.
3. **Credenciales externas:** OAuth Client de Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), cuenta y
   dominio **verificados** en **Resend** (`RESEND_API_KEY`/`RESEND_EMAIL_FROM`) y **rotar** el token de Instagram.
4. **Seed de agenda e inventario:** cargar en Agenda los **puntos reales de retiro presencial** (San Javier / Talca) con
   su ubicación y sus **franjas** (días + horario), y todos los productos reales del inventario.
5. **Desplegar en AWS** (§1): reconstruir la imagen de la API y cargar las variables de entorno.

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

