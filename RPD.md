# RPD — Registro de Producto y Decisiones

**Proyecto:** Tienda BOSQUE (repostería artesanal)
**Versión del documento:** 1.12
**Fecha:** 2026-09-25
**Estado:** Documento vivo — estado actual del código y decisiones

**Alcance:** describe **qué existe hoy** en el proyecto y **qué se decidió** en cada punto (D1–D35). El
historial de cambios por versión y el plan de trabajo por fases ya no se mantienen: lo aprobado está
implementado. Los **pendientes** se listan en `PLAN.md` §4.

---

## 1. Estado actual del código (resumen)

| Capa | Qué existe hoy |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Tailwind v4). Tienda en `app/page.tsx` → `components/storefront.tsx`; carrito en `localStorage` (`lib/cart.ts`); panel admin en `app/admin` → `components/admin-dashboard.tsx`; login por correo/contraseña + Google en `app/login`; cuenta `app/cuenta` dentro del layout de la tienda; `proxy.ts` protege `/admin` (rol admin). Sesión compartida (`lib/session-client.ts`), respaldo de lecturas públicas (`lib/offline-cache.ts`) y ajustes de tienda (`lib/use-store-settings.ts`). |
| **Catálogo** | `lib/products.ts` con 4 productos demo como fallback; si la API responde, el storefront lee `products` activos reales. Fotos: subida desde el admin (`POST /api/upload`), galería en ficha y storefront, con gradiente CSS como fallback. |
| **Datos** | `backend/app/models.py` (SQLAlchemy): `profiles`, `categories`, `products`, `orders` (con `expires_at`, la **reserva de stock**), `order_items`, `time_slots` (franjas **de cada punto**, con sus días y **sin nombre**), `closed_days` (fechas cerradas puntuales, **sin motivo**), `shipping_zones` (**solo retiro presencial, sin tipo**), `reviews`, `store_settings` e `instagram_token`. Las tablas se crean al arrancar la API; una lista idempotente de `ALTER TABLE`/`DROP` mantiene al día las bases ya creadas (**D22**). |
| **Admin** | Panel con secciones Inicio / Productos / Pedidos / Agenda / Comentarios / Contenido / Reportes. CRUD de productos contra la API, filtros, edición de stock, pedidos reales con creación y edición manual (sin borrado), agenda (puntos con sus franjas y fechas cerradas) y contenido editable. Acceso controlado por `proxy.ts` (rol admin). |
| **Backend (fuente de verdad)** | `backend/` FastAPI + SQLAlchemy dockerizado (AWS). Catálogo, agenda, puntos, reviews, órdenes con stock server-side (**reserva con expiración**, D35), ajustes, imágenes y feed de Instagram. Auth por correo/contraseña (bcrypt) + Google OAuth (authlib). Mutaciones admin con JWT `role=admin` o `X-Admin-Token`. |
| **Identidad** | `lib/store-config.ts` es el fallback (nombre, hero, historia); la tabla `store_settings` **sí se usa**: el storefront la lee con `GET /api/settings` y el panel la edita en **Contenido**, incluida la **paleta de la tienda** (`theme_colors`: acento, tinta, bloque suave, texto secundario y detalle cálido — D29). |

---

## 2. Decisiones

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| D1 | Ficha de producto | Página propia `/producto/[slug]` (mejor SEO y escalable), integrada al layout de la tienda. | Tienda, ficha |
| D2 | Alérgenos | Por producto: array de códigos (`gluten`, `lacteos`, `frutos-secos`, `huevo`, `mani`, `soja`, `sesamo`) + íconos en la ficha y en el editor. | Schema, ficha, panel |
| D3 | Regla de stock | Híbrido: estado manual + auto `sold_out` cuando `inventory = 0`, salvo `allow_backorder`. | API, etiquetas de la tienda |
| D4 | "Bajo pedido" | Solo `allow_backorder`, sin días de anticipación (`lead_time_days`). | Schema, tienda |
| D7 | Fuente de verdad | **API FastAPI dockerizada (AWS)** como única fuente de verdad. | Arquitectura |
| D8 | Orden de pagos | **Webpay Plus pendiente** de credenciales TBK: es el **único medio** del checkout y del panel (se retiró la transferencia, D34). Hasta activarlo el pedido se registra y el pago se coordina por WhatsApp. El flujo ya tiene **página visible de retorno** (`/checkout/retorno`) y, al registrar el pedido, **correo de confirmación al cliente y aviso a la tienda**. Las restricciones y los «por si acaso» de la pasarela están en **PLAN §5** (checklist de activación). | Checkout, panel, correo |
| D9 | WhatsApp | **Botón flotante `wa.me` implementado** (redondo, solo ícono). **Notificación automática pendiente** de proveedor. | Tienda, ficha, checkout |
| D10 | Comentarios | Anónimos por producto y **moderados** por el admin antes de publicarse (tabla `reviews`). | Ficha, panel › Comentarios |
| D12 | Panel móvil | El panel tiene menú desplegable en pantallas pequeñas (hamburguesa). | Panel |
| D13 | Protección del panel | Sesión server-side en cookie httpOnly + `proxy.ts` por rol admin; login por correo/contraseña + Google. | Seguridad |
| D14 | Confirmación de cuenta | Código temporal de 6 dígitos por correo (Resend). **Pendiente externo:** cuenta y dominio verificado en Resend. | `profiles`, auth, `/login` |
| D15 | Referencia de diseño | https://simplysweet.cl para la ficha y el checkout; https://www.studiopasacademy.com como referencia de la sección de Instagram. | Ficha, checkout, carta |
| D16 | Entrega | Sin despacho a domicilio: solo **retiro presencial** (en San Javier / Talca) con ubicación y horarios; ventana de 2 semanas. **Ajustada por D33:** dejó de distinguirse «punto de encuentro». | `shipping_zones`, checkout, admin |
| D17 | Nota del pedido | Eliminada del checkout, del admin y del schema (`orders.notes`). | Checkout, admin |
| D18 | Franjas horarias | Cada franja **cuelga de un punto** y declara los **días** en que atiende; el punto no tiene un horario en texto libre. El cliente elige punto → día → franja. | `time_slots`, checkout, agenda |
| D19 | Días cerrados | **Ajustada por D32:** quedan los **días de cada franja** y las **fechas cerradas puntuales**; el cierre semanal se retiró. | Checkout, agenda |
| D20 | Modo sin conexión | **Última versión conocida** en `localStorage` (clave versionada, 7 días) como respaldo de la **vidriera**; no cubre el panel ni la agenda del checkout (ahí se avisa y se bloquea la confirmación). | Tienda, ficha |
| D21 | Reportes del negocio | Ventas + ticket promedio, más/menos vendidos y los sin ventas, ventas por punto, pedidos por día y franja, e ingresos por categoría con reposición; incluye rango personalizado por meses enteros (hasta un año). | Panel › Reportes |
| D22 | Alcance del modelo | Producto **uno por publicación** (sin variantes, SKU ni campos SEO propios) y **sin páginas editables**; el contenido editable es `store_settings`. | Backend, panel |
| D24 | Identidad visual | Paleta cálida (**#D7CDC1**, **#D9B391**, **#846851**, **#401A04**, **#808C6D**) en carta y ficha; el footer es cálido en todo el sitio (D28) y los cinco tonos se editan en Contenido (D29). | `globals.css`, tienda, ficha |
| D25 | Paginado del catálogo | **8 productos por página** con flechas y transición animada al filtrar. Ajustada por D26 (cantidad fija). | Carta |
| D26 | Productos por página | **8 por página, fijos** (4 columnas × 2 filas); dejó de ser configurable y se retiró `store_settings.products_per_page`. | Carta, API |
| D27 | Footer de la tienda | Footer **profesional** compartido por carta, ficha y cuenta —marca, contacto (correo, teléfono, WhatsApp e Instagram), navegación y copyright—; el checkout mantiene su footer mínimo (D15). | `store-shell.tsx` |
| D28 | Footer cálido único | **Un solo footer, siempre en la paleta cálida**, en todo el sitio (pierde la prop `warm`); el header conserva `warm`. | `store-shell.tsx` |
| D29 | Paleta de marca editable | Los **cinco tonos** se editan en **Contenido › Colores** y se guardan en `store_settings.theme_colors`; la tienda los aplica con variables CSS `--brand-*` y deriva el resto con `color-mix`. | Panel, tienda |
| D30 | Feed de Instagram | **Feed propio** con la **API de Instagram** (15 últimas en 3 filas de 5 columnas, con likes, comentarios y descripción al pasar el mouse); el token vive **solo en la API**. Retira el widget de terceros (D23). | Instagram |
| D31 | Renovación del token de Instagram | **Automática y dentro de la API**: el token de larga duración vive en `instagram_token` y una **tarea de fondo** lo renueva (revisa cada 12 h, renueva a los 50 días); la API sirve el feed y expone estado y renovación manual a los admins. | Backend Instagram |
| D32 | Días libres, franja y cierre | Los días libres salen de los **días de cada franja** + **fechas cerradas puntuales**; se retiran el **cierre semanal** `closed_weekdays`, el **nombre de la franja** (`time_slots.label`) y el **motivo** de la fecha cerrada (`closed_days.reason`). Ajusta D18 y D19. | Backend, agenda, checkout |
| D33 | Puntos de entrega | **Un solo tipo: retiro presencial.** En la práctica «retiro presencial» y «punto de encuentro» eran lo mismo (una dirección y unos horarios donde el cliente pasa a buscar), así que se retiran `shipping_zones.type` y `orders.fulfillment`: el punto se define por su nombre, su ubicación y sus franjas. Ajusta D16. | Backend, agenda, pedidos, reportes, checkout |
| D34 | Pago sin transferencia | La web **no ofrece transferencia bancaria**: se retiran `store_settings.bank_account_info`, el bloque «Datos para transferir» del checkout y el medio de pago. Checkout y panel quedan **solo con Webpay** (D8); hasta cargar las credenciales TBK el pedido se registra y el pago se coordina por WhatsApp. | Backend, panel, checkout |
| D35 | Reserva de stock | El stock de un pedido **pendiente de pago** es una **reserva con vencimiento** (`orders.expires_at`): se descuenta al crear el pedido y, si el pago no llega en `STOCK_HOLD_MINUTES` (**30** por defecto), `app/stock.py` la libera —devuelve el stock y deja el pedido en **`expired`**—. Corre en una **tarea de fondo** y antes de crear un pedido; al pagar se cierra y al cancelar un pendiente el stock se devuelve. | Backend, panel (estado «Expirado»), reportes |

---

## 3. Anexo — Mapa de archivos relevantes

| Archivo | Rol |
|---|---|
| `app/page.tsx` / `components/storefront.tsx` | Tienda pública (hero, catálogo «Productos destacados», carrito, beneficios, historia, Instagram, footer) |
| `components/product-detail.tsx` | Ficha de producto `/producto/[slug]`: galería con flechas y miniaturas, ingredientes, alérgenos, stock y comentarios (D1, D2) |
| `components/instagram-grid.tsx` | **Feed de Instagram propio** (D30): 15 últimas publicaciones (3×5 en escritorio, 2 por fila en celular) con likes, comentarios y descripción al pasar el mouse; lee `GET /api/instagram/feed` |
| `lib/instagram.ts` | Tipos y **configuración única** del feed (`INSTAGRAM_POST_COUNT = 15`, `INSTAGRAM_COLUMNS = 5`, `INSTAGRAM_COLUMNS_MOBILE = 2`) y espejo de lo que devuelve la API; se edita **solo en el código** (D30) |
| `backend/app/instagram.py` | Feed de Instagram de la API: consulta Instagram, normaliza las publicaciones (imagen, video → miniatura, carrusel → primera hija), cachea 15 min y **renueva solo** el token con la tarea de fondo (D31). El token se carga **una sola vez en el entorno del backend** |
| `instagram_token` | Fila única con el token vigente (`access_token`, `refreshed_at`, `last_error`); la crea `create_all` y la actualiza la tarea de fondo. Vive aparte de `store_settings` por ser una credencial (D31) |
| `components/store-shell.tsx` | Header/footer compartidos. El footer trae marca, contacto, navegación y copyright (D27) y usa siempre la paleta cálida (D28); la prop `warm` del **header** aplica esa paleta en la carta y la ficha (D24) |
| `components/floating-cart.tsx` | Acceso flotante al carrito: aparece **cuando el header sale de pantalla**, encima del botón de WhatsApp; abre el carrito lateral o enlaza al checkout. El header se observa por su `id` (`store-header`) |
| `app/checkout/retorno/page.tsx` | **Página visible de retorno de Webpay** (D8): muestra el estado del pago (ok / rechazado / anulado / error), la referencia del pedido y qué sigue. Es donde redirige `/api/webpay/confirm` |
| `components/checkout-shell.tsx` | Header/footer mínimos del checkout según simplysweet.cl (D15) |
| `components/admin-dashboard.tsx` | Panel admin completo (Inicio, Productos, Pedidos, Agenda, Comentarios, Contenido, Reportes) |
| `components/admin-agenda.tsx` | Agenda del panel: una tarjeta por punto con sus franjas, más las **fechas cerradas** puntuales (D18, D19, D32) |
| `components/admin-reports.tsx` | Sección **Reportes** con las métricas de negocio y el selector de período (D21) |
| `lib/schedule.ts` | Días de la semana compartidos y formato compacto de franjas (D18) |
| `lib/agenda.ts` | Tipos compartidos de **punto de retiro presencial y franja** (`Zone`, `Slot`); el punto no tiene tipo (D33) |
| `lib/months.ts` | Claves de mes `YYYY-MM`, etiquetas y rango por meses enteros con tope de un año (`moveRange`) |
| `lib/theme.ts` | Paleta de marca editable: los cinco tonos, su normalización y las variables CSS que aplican las vistas cálidas (D29) |
| `store_settings.theme_colors` | Paleta guardada como JSON (`accent`, `ink`, `surface`, `muted`, `detail`); sin valores guardados manda la del código (D29) |
| `app/admin/page.tsx`, `app/login/page.tsx` | Rutas del panel y del login (correo/contraseña + Google) |
| `lib/products.ts` | Productos demo (fallback) + `formatPrice` y etiquetas de stock |
| `lib/store-config.ts` | Fallback de la identidad (nombre, hero, historia) |
| `lib/api.ts` | Cliente HTTP de la API (JWT de sesión `Bearer`; respaldo `X-Admin-Token`) |
| `lib/session.ts` / `lib/session-client.ts` | Verificación del JWT en el servidor (jose) y sesión compartida del navegador (una sola lectura de `/api/auth/me`) |
| `proxy.ts` | Protege `/admin` (rol admin) y redirige a los logueados fuera de `/login` |
| `app/api/auth/*` | Route handlers: login/registro, callback de Google, verificación, `/me` y logout (cookie httpOnly) |
| `app/cuenta` | Cuenta dentro del layout de la tienda: datos, teléfono por defecto, historial de pedidos y cerrar sesión |
| `lib/cart.ts`, `lib/account.ts` | Carrito único compartido y hooks de sesión/enlace de cuenta del header |
| `lib/offline-cache.ts` | Última versión conocida de la **vidriera** en `localStorage`, usada solo si la API falla (D20); expone `loadCached()` |
| `lib/use-store-settings.ts` | Hook único de **ajustes de tienda** (fetch + `mergeSettings` + respaldo) |
| `backend/app/*` | **Única fuente de verdad**: modelos, schemas y endpoints (crea las tablas al arrancar); auth por correo/contraseña + Google |
| `backend/tests/*` | Pruebas de la API (57: catálogo, órdenes con **reserva y expiración de stock**, agenda, auth, correo de confirmación, correos y Instagram) |
| `backend/app/stock.py` | **Reserva y expiración del stock** de los pedidos pendientes de pago (D35): libera el stock al vencer y deja el pedido en `expired`; tarea de fondo del arranque |
| `backend/app/emails.py` | Correo transaccional con **Resend**: plantilla del código de confirmación (D14) y **confirmación del pedido al cliente + aviso a la tienda** al registrar la orden (D8) |
| `docker-compose.backend.yml` | Stack local de prueba: PostgreSQL 16 + API (Google, admin, JWT e Instagram) |
| `https://simplysweet.cl` | **Referencia de diseño/UX** para la ficha y el checkout (D15) |
