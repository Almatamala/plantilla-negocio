# RPD — Registro de Producto y Decisiones

**Proyecto:** Tienda BOSQUE (panadería/pastelería artesanal)
**Versión del documento:** 1.1
**Fecha:** 2026-09-10
**Estado:** Borrador para revisión del dueño del producto

---

## 1. Contexto y objetivo

Este documento cruza los requerimientos funcionales de BOSQUE contra el código actual de la plantilla
(`plantilla-negocio`), identifica qué existe hoy, qué falta, dónde hay conflictos técnicos y propone un
orden de prioridad para decidir el plan de implementación. **Ningún punto de este documento implica
cambios de código por sí solo**: su propósito es que el dueño del producto lea, ajuste y decida.

---

## 1.1 Actualización v2 — Adiós Supabase, hola API dockerizada (AWS)

**Decisión D7 resuelta:** la API FastAPI dockerizada (desplegada en AWS) es la **única fuente de
verdad**. Todo lo relacionado con Supabase fue eliminado: dependencias (`@supabase/*`),
`lib/supabase/`, `supabase/schema.sql` y las llamadas desde los componentes. La capa de datos del
frontend ahora es `lib/api.ts` (cliente HTTP con `X-Admin-Token`).

**Conflicto/decisiones analizados en la migración:**

1. **CORS:** el dominio del frontend (dev y producción) debe estar en `CORS_ORIGINS` del backend; si
   no, las peticiones del navegador fallan.
2. **Autenticación:** se reemplazó el magic-link de Supabase por login con `API_ADMIN_TOKEN`
   (guardado en `localStorage` y enviado como `X-Admin-Token`). No hay usuarios por cliente: las
   órdenes se crean públicamente y el admin confirma el pago manualmente.
3. **Imágenes:** Supabase Storage → endpoint `POST /api/upload` del backend con volumen persistente
   (`UPLOAD_DIR`, EBS/EFS en AWS).
4. **Stock:** el decremento y la auto-desactivación (Agotado) viven server-side en `POST /api/orders`
   dentro de una transacción, reemplazando el RPC `decrement_stock` de Supabase.
5. **Schema:** ya no hay archivo SQL separado; las tablas se crean al arrancar desde
   `backend/app/models.py` (SQLAlchemy).
6. **Configuración:** el frontend usa `NEXT_PUBLIC_API_URL` en lugar de las variables de Supabase.
7. **Riesgo:** sin la API levantada, la tienda no persiste pedidos (muestra error claro); el catálogo
   demo queda como fallback visual.

**Pendientes que no cambian:** credenciales TBK para Webpay, webhook de notificación WhatsApp y seed
inicial de franjas/zonas/días cerrados desde el panel Agenda.

---

## 1.2 Actualización v3 — Login de usuarios (clientes y admins) y sesión server-side

**Estado: implementado y probado (2026-09-10).** `pytest` 28/28, `tsc`/lint/build OK, API dockerizada
local verificada de punta a punta.

La autenticación vive en el backend FastAPI (única fuente de verdad) con **dos vías**, ambas emitiendo
un **JWT de sesión** (HS256, 30 días, firmado con `AUTH_JWT_SECRET`):

1. **Correo y contraseña** — `POST /api/auth/register` (crea cuenta) y `POST /api/auth/login`.
   Contraseñas con hash `bcrypt`; rol `customer` por defecto, `admin` si el correo está en
   `ADMIN_EMAILS`.
2. **Google OAuth2** — `GET /api/auth/google/authorize` y `GET /api/auth/google/callback` (flujo
   Authorization Code con `authlib`). Find-or-create del perfil por email; rol `admin` según
   `ADMIN_EMAILS`.

**Sesión en el frontend (Next.js):** la cookie es **httpOnly, SameSite=Strict, Secure** y la manejan
los route handlers `app/api/auth/*`. El archivo **`proxy.ts`** (Next 16) protege `/admin` (solo
`role=admin`) y redirige a los logueados fuera de `/login`. Esto **resuelve D13** del PLAN: la clave
`API_ADMIN_TOKEN` ya no es método de login de la UI (queda solo como respaldo para llamadas directas a
la API con `X-Admin-Token`).

**Nuevas páginas y flujo:**

- `/login` — correo/contraseña (con opción de registro) y botón "Continuar con Google" debajo.
- `/cuenta` — editar nombre y **teléfono por defecto** (se precarga en el checkout), historial de
  pedidos propios (`GET /api/orders/me`) y cerrar sesión.
- Checkout — autocompleta nombre/correo/teléfono si hay sesión, **sin obligar a loguearse** (flujo de
  invitado intacto).
- Storefront — el header/footer reflejan la sesión (enlace "Mi cuenta").
- Órdenes — `POST /api/orders` vincula `orders.customer_id` al perfil cuando `customer_email` coincide.

**Endpoints nuevos:** `POST /api/auth/register`, `POST /api/auth/login`,
`GET /api/auth/google/authorize`, `GET /api/auth/google/callback`, `GET|PATCH /api/auth/me`,
`GET /api/orders/me`.

**Env vars nuevas:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ADMIN_EMAILS`
(default `alvaro.dario09@gmail.com`), `AUTH_JWT_SECRET` (**el mismo valor en Next.js y en la API**).

**Pendientes:** credenciales TBK para Webpay (F2.3), webhook de notificación WhatsApp (F3.1),
**credenciales de Google Cloud** (`GOOGLE_CLIENT_ID/SECRET` — hasta configurarlas el botón de Google
avisa con un 503 amigable; el login por correo/contraseña funciona sin ellas), seed inicial de agenda
(franjas/zonas/días cerrados) y las secciones Clientes/Configuración del panel (siguen como placeholder).

---

## 2. Estado actual del código (resumen)

| Capa | Qué existe hoy |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Tailwind v4). Tienda en `app/page.tsx` → `components/storefront.tsx`, carrito en `localStorage`, panel admin en `app/admin` → `components/admin-dashboard.tsx`, login por correo/contraseña + Google en `app/login`, página de cuenta `app/cuenta`, `proxy.ts` protege `/admin` (rol admin). |
| **Catálogo** | `lib/products.ts` con 4 productos demo como fallback; si la API responde, el storefront lee `products` activos reales. Fotos: subida desde el admin (`POST /api/upload`), galería en ficha y storefront, con gradiente CSS como fallback. |
| **Datos** | `backend/app/models.py` (SQLAlchemy): tablas `profiles`, `categories`, `products`, `product_variants`, `orders`, `order_items`, `time_slots`, `closed_days`, `shipping_zones`, `reviews`, `pages`, `store_settings`. Las tablas se crean al arrancar la API. |
| **Admin** | Panel con secciones Inicio / Productos / Pedidos / Agenda / Clientes / Comentarios / Contenido / Reportes / Configuración. CRUD de productos contra la API, filtros, edición de stock, gestión de pedidos con modal de ítems y filtros, agenda (franjas/días cerrados/zonas) y contenido editable. Acceso controlado por `proxy.ts` (rol admin). |
| **Backend (fuente de verdad)** | `backend/` FastAPI + SQLAlchemy dockerizado (AWS). Catálogo, agenda, zonas, reviews, órdenes con stock server-side, ajustes e imágenes. Auth por correo/contraseña (bcrypt) + Google OAuth (authlib). Mutaciones admin con JWT `role=admin` o `X-Admin-Token`. |
| **Identidad** | Textos de la tienda hardcodeados en `lib/store-config.ts` (nombre, hero, historia). Existe tabla `store_settings` pero **no se usa**. |

> Nota: el trabajo que quedó a medio camino en `components/admin-dashboard.tsx` (modal de ítems,
> filtros, creación de producto, modal de stock) fue commiteado y el desarrollo continuó: ver §1.2.

---

## 3. Análisis por requerimiento

### 3.1 Catálogo de Productos y Galería

**Estado actual: parcial (sin fotos ni ficha)**

- ✅ Carta digital: grid de productos con búsqueda y filtro por categoría.
- ❌ **Ficha de producto**: no existe detalle (ni página `/producto/[slug]` ni modal). No hay ingredientes,
  ni sello artesanal/sustentable.
- ❌ **Fotos**: `image_url` existe en schema y en el backend, pero el admin **no la lee ni la edita** y el
  storefront no la muestra (gradientes CSS en su lugar).
- ❌ **Alérgenos**: no hay columna en la BD, ni íconos en la UI.

**Conflictos y decisiones:**

1. **Ficha como página propia vs. modal.** Una página `/producto/[slug]` es lo correcto para SEO y para
   "fotos bonitas + descripción + ingredientes", pero agrega rutas dinámicas y generación de rutas en el
   storefront. Un modal es más barato de construir. → **Decidir formato.**
2. **Alérgenos por producto o por familia.** Si la receta base (masa madre, etc.) comparte alérgenos,
   conviene un catálogo de alérgenos (tabla o constante) y una relación producto↔alérgeno; si cada
   producto es único, basta un array por producto. Afecta el schema.
3. **Subida de fotos.** El panel debe poder subir imágenes → requiere bucket público en Supabase Storage +
   política RLS + editor de foto en el admin. Es trabajo transversal (admin + storefront + schema).

---

### 3.2 Gestión de Stock Simple

**Estado actual: parcial (stock en BD, pero sin etiquetas visibles ni auto-desactivación)**

- ✅ `products.inventory` (número) + `status` (`draft` / `active` / `sold_out`).
- ✅ Admin: editar stock, modal "agregar stock", filtros Disponible / Stock bajo (≤5) / Agotado.
- ❌ Etiquetas para el cliente: el storefront no muestra **Disponible / Agotado / Bajo Pedido**.
- ❌ **"Bajo Pedido" no existe** como estado, y **"días de anticipación"** no existe como dato.
- ❌ **Desactivación automática**: nada cambia el estado del producto cuando el stock llega a 0 (y nadie
  decrementa el stock hoy, porque no hay checkout real).

**Conflictos y decisiones:**

1. **Estado derivado vs. manual.** ¿El estado visible se calcula del inventario (`inventory > 0` →
   Disponible; `= 0` → Agotado) o lo controla el dueño? Para un negocio artesanal es probable que el
   dueño quiera dejar un producto en "Bajo Pedido" aunque tenga stock 0 hoy (producción futura con
   anticipación). → **Regla a definir**: umbral de "stock bajo", y si "Agotado" es automático o manual.
2. **Schema a migrar.** El `CHECK` de `products.status` solo permite `draft/active/sold_out`; agregar
   "bajo pedido" + `lead_time_days` (días de anticipación) implica migración en Supabase **y** en el
   modelo FastAPI (hay dos fuentes de verdad que mantener sincronizadas).
3. **Auto-desactivación = decremento de stock al pedir.** Hoy no hay flujo de compra que reste stock;
   esto queda atado al checkout (punto 3.4). Debe ser un decremento atómico (p. ej. `rpc` de Supabase)
   para no vender de más con dos clientes simultáneos.

---

### 3.3 Agenda de Pedidos — *el requerimiento clave*

**Estado actual: casi inexistente**

- ❌ Checkout real: el botón del carrito dice "Continuar (próximamente)".
- ❌ Selección de **día + rango horario** por el cliente: no existe ningún flujo.
- ❌ **Bloqueo de días** (cierre de días) y configuración de horarios: no hay tabla de agenda ni de días
  cerrados.
- ⚠️ Despacho: el admin ya distingue `retiro` / `domicilio` con una dirección de texto libre, pero **no
  hay zonas de entrega** (San Javier domicilio; San Javier y Talca presencial) ni validación.

**Conflictos y decisiones:**

1. **Es el módulo más transversal.** La agenda depende del checkout (3.4), del stock (3.2) y de la ficha
   de producto (3.1). Por eso es "clave": conviene **modelar los datos temprano** (tabla de slots/días
   cerrados) aunque la UI de compra se construya en una fase posterior.
2. **Slots fijos vs. libres.** ¿Franjas predefinidas configurables (ej. 09:00–12:00, 12:00–15:00) o el
   cliente escribe su horario? Para control de producción, lo razonable son slots configurables por el
   admin. → **Decidir** (afecta schema: `order_slots` + `closed_days`).
3. **Zonas de entrega.** Domicilio solo en San Javier (¿radio/barrios?), retiro/entrega presencial en San
   Javier **y** Talca. Hoy `location` es texto libre. Se necesita una tabla o constante de zonas con su
   alcance y (si aplica) tarifa. → **Decidir alcance exacto**.
4. **Desincronización de idiomas.** El admin usa estados en español ("Preparando") y `fulfillment`
   hardcodeado; el schema/backend usan inglés (`preparing`, `pending`). Al persistir pedidos hay que
   unificar los valores.
5. La fecha/franja del pedido **no existe** en `orders`; hay que agregar `scheduled_date`,
   `time_slot_id` y `fulfillment`/`zone` al schema.

---

### 3.4 Pagos y WhatsApp

**Estado actual: inexistente (solo campos preparados)**

- ❌ **Webpay Plus**: no hay integración ni credenciales. Requiere backend (crear transacción, retorno y
  confirmación/webhook) y la transacción se marca "pagado".
- ❌ **Transferencia bancaria**: no hay datos de cuenta del negocio ni flujo de "adjuntar comprobante".
- ❌ **WhatsApp**: no hay botón flotante, ni notificación automática al chat cuando entra un pedido.
- ⚠️ **Pedidos desde admin**: el botón "Nueva orden" solo agrega una fila **en memoria local**; no
  persiste en Supabase `orders` ni en el backend FastAPI, aunque ambas estructuras existen.

**Conflictos y decisiones:**

1. **¿Dónde vive la integración de pagos?** Webpay necesita un servidor: las API Routes de Next.js o el
   backend FastAPI existente. El backend FastAPI **no está desplegado** y hoy el frontend no lo usa →
   hay que decidir si se despliega, se migra a API Routes, o se elimina para tener una sola fuente de
   verdad (recomendado: **una sola**, idealmente Supabase + API Routes, para no mantener dos backends).
2. **Webpay es el bloque de mayor esfuerzo y dependencia externa** (cuenta Transbank, certificados TBK).
   Es buen candidato a **dejarse para el final** o fase 2, partiendo con transferencia + confirmación
   manual.
3. **Notificación WhatsApp**: opciones — API oficial de Meta (WhatsApp Cloud, requiere cuenta Business,
   es la única vía "automática" robusta), o enlace `wa.me` con mensaje prefabricado (cero backend, pero
   el cliente debe apretar "enviar"). El botón flotante de dudas es trivial; la **notificación
   automática** es la parte costosa. → **Decidir proveedor/vía.**
4. Transferencia = flujo manual: el admin marca "Pagado" cuando ve el comprobante. Esto ya es posible
   con los estados existentes, pero falta la UI en el cliente.

---

### 3.5 Identidad y Panel de Control

**Estado actual: parcial**

- ✅ Sección "Nuestra Historia": existe, pero con textos hardcodeados en `lib/store-config.ts`; la
  sección **Contenido** del admin es una tarjeta placeholder (no edita nada).
- ❌ **Feed de Instagram**: no existe.
- ⚠️ **Panel auto-gestionable**: el admin funciona en desktop, pero **en celular el menú lateral está
  oculto** (`hidden md:block`) sin alternativa → contradice directamente el requisito "gestionar desde el
  celular, ipad, computador".
- ❌ **Comentarios de clientes**: no existe ni tabla ni UI.
- ✅ El panel **sí valida el rol**: `proxy.ts` solo deja entrar a sesiones `role=admin` y la API exige
  JWT de admin o `X-Admin-Token` en las mutaciones (ver §1.2).

**Conflictos y decisiones:**

1. **Feed de Instagram**: un embed real requiere cuenta comercial + token de Meta (caduca, frágil). La
   alternativa barata es una grilla estática o enlace directo. → **Decidir** si vale el embed real.
2. **Comentarios**: ¿anónimos o con cuenta? ¿Moderados por el admin o publicados al instante? Requiere
   tabla `reviews` + RLS. Bajo costo, pero es "nice-to-have" → candidato a última fase.
3. **Panel móvil**: rediseñar la navegación del admin (drawer o bottom nav) es trabajo transversal y
   **necesario** si la premisa es administrar desde el celular → sube de prioridad.
4. **Contenido editable**: para cumplir "cambiar precios, subir fotos, actualizar stock desde cualquier
   dispositivo" el panel ya cubre productos/stock; falta conectar `store_settings` (nombre, hero,
   historia, WhatsApp, datos de transferencia) al panel y al storefront.

---

## 4. Priorización propuesta

> Clasificación sugerida. El dueño puede reasignar; está hecha para separar "lo que habilita vender"
> de "lo que embellece/retiene".

| Prioridad | Bloque | Justificación |
|---|---|---|
| **P0 — Fundación (antes de abrir a clientes)** | **3.1 Catálogo + fotos + ficha + alérgenos** | Sin ficha con fotos e ingredientes no hay venta; es la carta del negocio. |
| **P0** | **3.2 Stock (etiquetas + bajo pedido + auto-desactivación)** | Evita vender lo que no hay; bajo pedido es el modelo de producción artesanal. |
| **P0** | **3.3 Agenda (día + franja, bloqueo de días, zonas San Javier/Talca)** | Es el diferenciador clave del negocio y el módulo que condiciona al resto (checkout, stock, pagos). |
| **P1 — Operación** | **3.4 Pagos (transferencia primero, Webpay después) + persistencia real de pedidos** | Sin cobro no hay negocio; pero Webpay (dependencia externa) puede ir en fase 2. |
| **P1** | **3.5 Panel móvil + contenido editable (conectar `store_settings`)** | Habilita el "panel auto-gestionable" prometido. |
| **P2 — Al final** | **WhatsApp: botón flotante** (rápido) y **notificación automática** (depende de proveedor externo) | El botón es barato y de alto valor; la notificación automática depende de decisión de proveedor. |
| **P2** | **Feed de Instagram, sección de comentarios, reportes/analítica avanzada** | Nice-to-have de marca y retención; no bloquean la venta. |

**Resumen para el dueño:** *primero* catálogo con fotos/ficha/alérgenos + stock + agenda;
*al final* Instagram, comentarios y la notificación automática de WhatsApp (y posiblemente Webpay si se
quiere partir con transferencia).

---

## 5. Decisiones abiertas (para resolver por el dueño)

| # | Decisión | Opciones | Impacto |
|---|---|---|---|
| D1 | Ficha de producto | Página `/producto/[slug]` vs. modal | SEO, esfuerzo frontend |
| D2 | Alérgenos | Por producto vs. por familia/receta | Schema |
| D3 | Regla de stock | Estado automático derivado de inventario vs. manual con umbrales | Lógica + schema |
| D4 | "Bajo pedido" | ¿Qué significa? (producción futura, días de anticipación `lead_time_days`, cupos diarios) | Schema + agenda |
| D5 | Slots horarios | Franjas fijas configurables vs. horario libre del cliente | Schema agenda |
| D6 | Zonas de entrega | Radio San Javier, Talca solo presencial, tarifas | Schema + checkout |
| D7 | Fuente de verdad única | ~~Supabase~~ **RESUELTA: API FastAPI dockerizada en AWS** | Arquitectura; ver §1.1 |
| D8 | Orden de pagos | Transferencia primero (manual) + Webpay en fase 2 | Esfuerzo, credenciales |
| D9 | WhatsApp automático | API Meta Cloud vs. enlace `wa.me` manual | Costo, cuenta Business |
| D10 | Comentarios | Anónimos vs. con cuenta; moderados vs. directos | Schema, RLS |
| D11 | Instagram | Embed real (token) vs. enlace/gráfica estática | Mantención |
| D12 | Alcance del panel móvil | Drawer/bottom-nav en admin | Trabajo transversal |
| D13 | Protección del panel de administración | **RESUELTA E IMPLEMENTADA** (ver §1.2): sesión server-side en cookie httpOnly + `proxy.ts` por rol admin; login por correo/contraseña + Google | Arquitectura + seguridad |

---

## 6. Plan sugerido (una vez decidido)

1. **Commit del trabajo actual** en `admin-dashboard.tsx` (ya hay código sin commitear).
2. **Fase 0 — Modelo de datos:** migración Supabase (alérgenos, fotos, stock/bajo pedido, agenda/días
   cerrados, zonas, campos de pedido) y sincronización/eliminación del backend FastAPI según D7.
3. **Fase 1 (P0):** fotos + ficha + alérgenos en storefront y admin; etiquetas de stock y auto-desactivación;
   modelo y UI mínima de agenda en el checkout (día + franja + bloqueo + zona).
4. **Fase 2 (P1):** checkout real (persistir órdenes), transferencia con confirmación manual, panel móvil,
   contenido editable desde `store_settings`.
5. **Fase 3 (P2):** Webpay, WhatsApp (botón + notificación), Instagram, comentarios, reportes.

---

## 7. Anexo — Mapa de archivos relevantes

| Archivo | Rol |
|---|---|
| `app/page.tsx` / `components/storefront.tsx` | Tienda pública (catálogo, carrito, historia, footer) |
| `components/admin-dashboard.tsx` | Panel admin completo (productos, stock, pedidos, secciones placeholder) |
| `app/admin/page.tsx`, `app/login/page.tsx` | Rutas admin y login magic-link |
| `lib/products.ts` | Productos demo + `formatPrice` |
| `lib/store-config.ts` | Textos de identidad hardcodeados |
| `lib/api.ts` | Cliente HTTP de la API dockerizada (JWT de sesión `Bearer`; respaldo `X-Admin-Token`) |
| `lib/session.ts` | Verificación del JWT de sesión (jose) + nombre de la cookie httpOnly |
| `proxy.ts` | Protege `/admin` (rol admin) y redirige a logueados fuera de `/login` |
| `app/api/auth/*` | Route handlers: login/registro, callback de Google, `/me`, logout (cookie httpOnly) |
| `app/cuenta` | Página de cuenta: datos, teléfono por defecto, historial de pedidos, cerrar sesión |
| `backend/app/*` | **Única fuente de verdad**: modelos, schemas y endpoints (crea las tablas al arrancar); auth por correo/contraseña + Google |
| `docker-compose.backend.yml` | Stack local de prueba: PostgreSQL 16 + API (GOOGLE_*, ADMIN_EMAILS, AUTH_JWT_SECRET) |
| `backend/tests/*` | Tests de la API local |