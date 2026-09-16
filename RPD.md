# RPD — Registro de Producto y Decisiones

**Proyecto:** Tienda BOSQUE (panadería/pastelería artesanal)
**Versión del documento:** 1.4
**Fecha:** 2026-09-15
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
(franjas/zonas/días cerrados); las secciones Clientes/Configuración del panel se eliminaron en la v4
(ver §1.3).

---

## 1.3 Actualización v4 — Ajustes de alcance (repostería)

**Aplicado (2026-09-11).** Se ajustó el producto al rubro (repostería) y se simplificó el panel:

- **Alérgenos:** `pescado` y `mariscos` fuera del código (`lib/allergens.ts`); el resto se mantiene.
- **Admin vs. cuenta:** el admin no usa `/cuenta`. El botón del storefront apunta a `/admin` para
  `role=admin` y `proxy.ts` redirige a `/admin` si intenta entrar a `/cuenta`.
- **Header del panel:** sin correo, sin estado de la API y con «Cerrar sesión» en lugar de «Salir».
- **Secciones eliminadas del panel:** **Clientes** (se deriva de las órdenes) y **Configuración**
  (los datos de tienda se editan en **Contenido**; `API_ADMIN_TOKEN` ya no es método de login).
- **Sellos eliminados:** `artisan_seal` y `sustainable` fuera del schema de la API, del editor y del
  storefront. **D4 se simplifica:** «bajo pedido» = solo `allow_backorder`, sin `lead_time_days`.
- **Pedidos desde el admin:** «Nueva orden» abre un formulario que persiste vía `POST /api/orders`
  (cliente, productos, entrega, agenda y pago). Un pedido mal ingresado se **edita** con
  `PUT /api/orders/{id}` desde la tabla; **no hay borrado** de pedidos. El cambio de estado se mantiene
  para confirmar pagos (transferencia). La edición no recalcula stock (se ajusta con «Agregar stock»).
- **Transición a AWS:** los pasos y consideraciones (reconstruir la imagen de la API, limpieza de las
  columnas retiradas y variables de entorno) quedaron en **PLAN §0.5**.

---

## 1.4 Actualización v5 — Ajustes del dueño (2026-09-14)

**Implementado y verificado** (`pytest` 36/36, `tsc`, `lint`, `build` y prueba de humo de la API). Los
cambios están detallados en **PLAN §0.6**; aquí el análisis que los justifica frente a este documento:

1. **Botón de WhatsApp redondo y solo con el ícono** (§3.4). Estaba con texto
   (`rounded-full … <MessageCircle/>WhatsApp`); pasa a `components/whatsapp-button.tsx` (redondo, ícono
   oficial) y se muestra en tienda, ficha y checkout.
2. **Bug del carrito (§3.1 / flujo de compra):** al agregar desde la ficha y elegir «seguir comprando»,
   el carrito se reiniciaba. Causa: dos dueños del mismo `localStorage` (la ficha escribía a mano y el
   storefront persistía un carrito vacío antes de restaurar lo guardado). Solución: `lib/cart.ts`,
   carrito único como store externo.
3. **Categorías editables (§3.5, panel):** el panel solo listaba categorías; la API tenía únicamente
   `GET` y `POST`. Se agregan **`PUT` y `DELETE /api/categories/{id}`** y un botón **«Categorías»** junto
   a «Nuevo producto» con modal para agregar, editar y quitar (los productos quedan «Sin categoría»).
4. **Confirmación de cuenta por correo (§3.6):** faltaba por completo; se implementa con **código
   temporal de 6 dígitos** y correo personalizado (**D14**, proveedor **Resend**).
5. **Acceso a cuenta/panel en el footer (§3.5):** el botón del header funciona correctamente, así que el
   enlace del footer se **elimina** (el footer conserva Instagram).
6. **Referencia de diseño simplysweet.cl (D15):** la ficha de producto mantiene **header y footer** y ya
   no tiene «Volver a la tienda»; el **checkout se reestructuró según la referencia** (verificado que es
   una tienda **Shopify**, o sea checkout estándar: header mínimo con el logo, formulario en columna
   izquierda con secciones separadas por líneas finas, resumen del pedido fijo al costado con el botón de
   pago, resumen plegable en móvil), **conservando los mismos campos** que se piden hoy y su flujo de 4
   pasos. La referencia queda registrada en **PLAN §9** para reutilizarla.

**Pendiente externo:** cuenta y **dominio verificado en Resend**. Sin esas credenciales la confirmación
por correo queda desactivada y las cuentas nuevas entran activas, para no dejar la tienda sin acceso.

---

## 1.5 Actualización v6 — Ajustes del dueño (2026-09-15)

**Implementado y verificado** (`pytest` 36/36, `tsc`, `lint`, `build`). El detalle por tarea está en
**PLAN §0.7**; aquí el análisis frente a este documento:

1. **No existe el despacho a domicilio (§3.3).** El código tenía `shipping_zones.type` = `retiro` |
   `domicilio` con cobertura en `areas[]`, y el checkout pedía dirección al elegir domicilio. El negocio
   **solo entrega para retiro**: **retiro presencial** y **puntos de encuentro** en San Javier y Talca,
   cada uno **definido por ubicación y horario**; el cliente elige **cuál** y **qué día/franja** ir a
   buscarlo, dentro de una **ventana de 2 semanas**. Esto **resuelve D6** y agrega **D16**: el tipo pasa a
   `retiro` | `encuentro` y las zonas ganan `location` + `schedule` (se retira `areas`).
2. **Nota del pedido eliminada (§3.4).** El paso «5 · Nota del pedido» del checkout se retira (no se usará
   a futuro), junto con el campo del formulario de pedidos del admin y del schema: **D17**, columna
   `orders.notes` eliminada con la migración idempotente al arrancar.
3. **Desborde horizontal del checkout en celular (§3.3, flujo de compra).** Los inputs, botones y el
   selector de días se salían del cuadro porque la fila de días (con scroll horizontal propio) ensanchaba
   su columna de grid (`min-width: auto`) y, con ella, todo el formulario. Se corrige con `min-w-0` en las
   columnas y en las tarjetas de punto de retiro; en tablet no había problema.

**Nota de datos:** `orders.fulfillment` cambia de `retiro` | `domicilio` a `retiro` | `encuentro`. El panel
normaliza valores antiguos a `retiro` para no romperse; si hubiera pedidos con `domicilio`, se corrigen
desde el panel (no hay producción todavía).

---

## 1.6 Actualización v7 — Agenda por punto y cierres cómodos (2026-09-15)

**Implementado y verificado** (`pytest` 40/40, `tsc`, `lint`, `build`). Detalle en **PLAN §0.8**. El dueño
pidió que el panel pueda administrar los puntos «de forma didáctica y precisa»:

1. **Las franjas horarias se fusionan con el punto de retiro/encuentro (§3.3).** Antes eran globales
   (`time_slots` sin dueño) y el punto tenía su horario como texto libre (§1.5): el cliente podía agendar
   el sábado 11:00–13:00 en un punto que solo existe los sábados… o el mismo punto un miércoles. Ahora
   cada franja **cuelga del punto** (`time_slots.zone_id`, con cascada) y declara sus **días de la semana**
   (`weekdays`, 0 domingo … 6 sábado). Esto agrega **D18** y cambia el flujo del checkout a
   **punto → día → franja**, con validación en la API (franja habilitada, del punto elegido y del día
   elegido).
2. **Cierres más cómodos (§3.3).** Además de las fechas puntuales, se agregan **cierres recurrentes por
   día de la semana** (`closed_weekdays`): cerrar el lunes de producción es un clic, sin cargar fechas a
   mano. Es **D19**; en una instalación nueva el domingo queda cerrado por defecto (editable).
3. **Panel didáctico.** La agenda del admin pasa a `components/admin-agenda.tsx`: una **tarjeta por punto**
   con su ubicación, sus franjas (agregar, editar, habilitar, eliminar, con chips de días) y las acciones
   del punto (editar, activar, eliminar); abajo, los cierres semanales como chips de Lunes a Domingo y las
   fechas puntuales. El `PATCH` de punto y de franja ahora son parciales.

**Nota de datos:** al migrar, las franjas globales antiguas **se eliminan** (no pertenecen a ningún punto) y
`shipping_zones.schedule` se retira; el horario del punto son sus franjas. Se vuelven a cargar desde Agenda
(las franjas por punto siguen pendientes de seed, igual que los puntos reales).

---

## 2. Estado actual del código (resumen)

| Capa | Qué existe hoy |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Tailwind v4). Tienda en `app/page.tsx` → `components/storefront.tsx`, carrito en `localStorage`, panel admin en `app/admin` → `components/admin-dashboard.tsx`, login por correo/contraseña + Google en `app/login`, página de cuenta `app/cuenta`, `proxy.ts` protege `/admin` (rol admin). |
| **Catálogo** | `lib/products.ts` con 4 productos demo como fallback; si la API responde, el storefront lee `products` activos reales. Fotos: subida desde el admin (`POST /api/upload`), galería en ficha y storefront, con gradiente CSS como fallback. |
| **Datos** | `backend/app/models.py` (SQLAlchemy): tablas `profiles`, `categories`, `products`, `product_variants`, `orders`, `order_items`, `time_slots` (franjas **de cada punto**, con días de la semana), `closed_days` (fechas), `closed_weekdays` (cierre semanal), `shipping_zones`, `reviews`, `pages`, `store_settings`. Las tablas se crean al arrancar la API. |
| **Admin** | Panel con secciones Inicio / Productos / Pedidos / Agenda / Comentarios / Contenido / Reportes. CRUD de productos contra la API, filtros, edición de stock, pedidos reales con creación y edición manual (sin borrado), agenda (franjas/días cerrados/zonas) y contenido editable. Acceso controlado por `proxy.ts` (rol admin). |
| **Backend (fuente de verdad)** | `backend/` FastAPI + SQLAlchemy dockerizado (AWS). Catálogo, agenda, zonas, reviews, órdenes con stock server-side, ajustes e imágenes. Auth por correo/contraseña (bcrypt) + Google OAuth (authlib). Mutaciones admin con JWT `role=admin` o `X-Admin-Token`. |
| **Identidad** | `lib/store-config.ts` es el fallback (nombre, hero, historia); la tabla `store_settings` **sí se usa**: el storefront la lee con `GET /api/settings` y el panel la edita en **Contenido**. |

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
- ✅ **Retiro:** el cliente elige el punto donde busca su pedido —**retiro presencial** o **punto de
  encuentro** (San Javier / Talca)— y cada punto se define por su **ubicación** y sus **franjas horarias**;
  no hay despacho a domicilio (**D16**, ver §1.5 y PLAN §0.7).
- ✅ **Franjas por punto y con días (D18, §1.6):** cada franja pertenece a un punto y declara los **días de
  la semana** en que se atiende, así el cliente solo puede agendar día y hora que ese punto realmente
  atiende; la ventana sigue siendo de **2 semanas**.
- ✅ **Cierres (D19, §1.6):** días cerrados **todas las semanas** (p. ej. lunes de producción, domingo por
  defecto) y **fechas puntuales**.

**Conflictos y decisiones:**

1. **Es el módulo más transversal.** La agenda depende del checkout (3.4), del stock (3.2) y de la ficha
   de producto (3.1). Por eso es "clave": conviene **modelar los datos temprano** (tabla de slots/días
   cerrados) aunque la UI de compra se construya en una fase posterior.
2. **Slots fijos vs. libres.** ¿Franjas predefinidas configurables (ej. 09:00–12:00, 12:00–15:00) o el
   cliente escribe su horario? Para control de producción, lo razonable son slots configurables por el
   admin. → **Decidir** (afecta schema: `order_slots` + `closed_days`).
3. **Puntos de retiro.** **Resuelto (D16, §1.5; D18/D19, §1.6):** no hay despacho a domicilio; solo
   retiro presencial y puntos de encuentro en San Javier y Talca, cada uno con **ubicación** y **franjas
   horarias** (que declaran sus días). Se descartó la cobertura por áreas (`areas[]`) porque no existe
   reparto; la tarifa queda fuera de alcance.
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

### 3.6 Cuenta de cliente: confirmación por correo con código temporal de 6 dígitos

**Estado actual: implementado en v5 (D14)** — requerimiento nuevo del dueño.

- ✅ Registro y login con **correo/contraseña** (bcrypt) y **Google OAuth**; la sesión es un JWT en
  **cookie httpOnly**.
- ✅ `POST /api/auth/register` genera un **código de 6 dígitos** (hasheado, vence en 15 min, máx. 3
  reenvíos, 5 intentos), envía el **correo personalizado del negocio** (`backend/app/emails.py`, Resend) y
  **no emite sesión**; `POST /api/auth/verify-email` confirma el código y emite la sesión;
  `POST /api/auth/resend-code` pide uno nuevo respetando espera y límite.
- ✅ El login responde **403** mientras el correo no esté confirmado y `/login` muestra el paso del código
  con «Reenviar código» y «Cambiar de correo».
- ✅ Las cuentas de **Google** entran confirmadas y las **existentes** también (migración automática al
  arrancar la API: `ALTER TABLE … ADD COLUMN IF NOT EXISTS email_verified … DEFAULT TRUE`).
- ⚠️ **Sin credenciales de Resend la confirmación queda desactivada** (decisión explícita para no dejar la
  tienda sin acceso): la cuenta se crea activa y se avisa en la respuesta.

**Pendiente externo:** crear la cuenta en [Resend](https://resend.com) y **verificar el dominio** del
negocio; después definir `RESEND_API_KEY` y `RESEND_EMAIL_FROM` en el entorno de la API.

---

## 4. Priorización propuesta

> Clasificación sugerida. El dueño puede reasignar; está hecha para separar "lo que habilita vender"
> de "lo que embellece/retiene".

| Prioridad | Bloque | Justificación |
|---|---|---|
| **P0 — Fundación (antes de abrir a clientes)** | **3.1 Catálogo + fotos + ficha + alérgenos** | Sin ficha con fotos e ingredientes no hay venta; es la carta del negocio. |
| **P0** | **3.2 Stock (etiquetas + bajo pedido + auto-desactivación)** | Evita vender lo que no hay; bajo pedido es el modelo de producción artesanal. |
| **P0** | **3.3 Agenda (día + franja, bloqueo de días, puntos de retiro de San Javier/Talca)** | Es el diferenciador clave del negocio y el módulo que condiciona al resto (checkout, stock, pagos). |
| **P1 — Operación** | **3.4 Pagos (transferencia primero, Webpay después) + persistencia real de pedidos** | Sin cobro no hay negocio; pero Webpay (dependencia externa) puede ir en fase 2. |
| **P1** | **3.5 Panel móvil + contenido editable (conectar `store_settings`)** | Habilita el "panel auto-gestionable" prometido. |
| **P2 — Al final** | **WhatsApp: botón flotante** (rápido) y **notificación automática** (depende de proveedor externo) | El botón es barato y de alto valor; la notificación automática depende de decisión de proveedor. |
| **P1** | **3.6 Confirmación de cuenta por correo (D14)** | Evita correos falsos y da la bienvenida de marca; requiere proveedor de correo y dominio verificado. |
| **P2** | **Feed de Instagram, sección de comentarios, reportes/analítica avanzada** | Nice-to-have de marca y retención; no bloquean la venta. |

**Resumen para el dueño:** *primero* catálogo con fotos/ficha/alérgenos + stock + agenda;
*al final* Instagram, comentarios y la notificación automática de WhatsApp (y posiblemente Webpay si se
quiere partir con transferencia).

**Ajustes del dueño v5 (§1.4):** la **confirmación por correo** (§3.6, D14) es el único bloque “de fondo”;
el resto son correcciones y ajustes acotados (botón de WhatsApp redondo, bug del carrito, CRUD de
categorías, footer sin accesos de cuenta y ficha/checkout dentro del layout con la referencia
simplysweet.cl) que **no reordenan el plan**: entran en las fases F1/F2 ya planificadas.

**Ajustes del dueño v6 (§1.5):** acotan el alcance de la entrega (sin despacho a domicilio: **D16**),
eliminan la nota del pedido (**D17**) y corrigen el layout móvil del checkout. No cambian el orden de las
fases: actualizan **F1.8** y **F2.1** (ver PLAN §0.7).

**Ajustes del dueño v7 (§1.6):** hacen la agenda **precisa y didáctica**: franjas que cuelgan del punto y
declaran sus **días** (**D18**) y cierres **semanales** además de los de fecha (**D19**). Tampoco reordenan
el plan: actualizan **F1.6**, **F1.7**, **F1.8** y **F2.4** (ver PLAN §0.8).

---

## 5. Decisiones abiertas (para resolver por el dueño)

| # | Decisión | Opciones | Impacto |
|---|---|---|---|
| D1 | Ficha de producto | Página `/producto/[slug]` vs. modal | SEO, esfuerzo frontend |
| D2 | Alérgenos | Por producto vs. por familia/receta | Schema |
| D3 | Regla de stock | Estado automático derivado de inventario vs. manual con umbrales | Lógica + schema |
| D4 | "Bajo pedido" | **RESUELTA (v4, ver §1.3):** solo `allow_backorder`, sin días de anticipación ni `lead_time_days` | Schema + agenda |
| D5 | Slots horarios | Franjas fijas configurables vs. horario libre del cliente | Schema agenda |
| D6 | Puntos de retiro | **RESUELTA (v6, §1.5):** no hay despacho a domicilio; retiro presencial y puntos de encuentro en San Javier y Talca, cada uno con ubicación y horario, sin tarifa. Ver D16 | Schema + checkout |
| D7 | Fuente de verdad única | ~~Supabase~~ **RESUELTA: API FastAPI dockerizada en AWS** | Arquitectura; ver §1.1 |
| D8 | Orden de pagos | Transferencia primero (manual) + Webpay en fase 2 | Esfuerzo, credenciales |
| D9 | WhatsApp automático | API Meta Cloud vs. enlace `wa.me` manual | Costo, cuenta Business |
| D10 | Comentarios | Anónimos vs. con cuenta; moderados vs. directos | Schema, RLS |
| D11 | Instagram | Embed real (token) vs. enlace/gráfica estática | Mantención |
| D12 | Alcance del panel móvil | Drawer/bottom-nav en admin | Trabajo transversal |
| D13 | Protección del panel de administración | **RESUELTA E IMPLEMENTADA** (ver §1.2): sesión server-side en cookie httpOnly + `proxy.ts` por rol admin; login por correo/contraseña + Google | Arquitectura + seguridad |
| D14 | Confirmación de cuenta | **RESUELTA E IMPLEMENTADA** (ver §1.4): código temporal de 6 dígitos por correo (Resend) | Schema `profiles`, auth, `/login` |
| D15 | Referencia de diseño | **RESUELTA** (ver §1.4): https://simplysweet.cl para la ficha de producto y el checkout | Ficha, checkout |
| D16 | Entrega | **RESUELTA E IMPLEMENTADA** (ver §1.5): no hay despacho a domicilio; solo retiro presencial y puntos de encuentro (San Javier / Talca) con ubicación y horario, en una ventana de 2 semanas | Schema `shipping_zones`, checkout, admin |
| D17 | Nota del pedido | **RESUELTA E IMPLEMENTADA** (ver §1.5): eliminada del checkout, del admin y del schema | Checkout, admin, `orders.notes` |
| D18 | Franjas horarias | **RESUELTA E IMPLEMENTADA** (ver §1.6): cada franja pertenece a un **punto** y declara los **días de la semana** en que atiende; el punto ya no tiene un horario en texto libre | Schema `time_slots`, checkout, agenda del admin |
| D19 | Días cerrados | **RESUELTA E IMPLEMENTADA** (ver §1.6): cierres **semanales recurrentes** (p. ej. lunes de producción; domingo por defecto) **y** fechas puntuales | Nueva tabla `closed_weekdays`, checkout, agenda del admin |

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
6. **Ajustes v5 (§1.4):** incorporados al PLAN en F1.9, F2.6, F2.7, F2.8, F2.9 y F2.10, más la
   referencia **simplysweet.cl** (D15, PLAN §9).

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
| `backend/app/emails.py` | Correo transaccional con **Resend** y plantilla del código de confirmación (D14, PLAN F2.9) |
| `components/checkout-shell.tsx` | Header/footer mínimos del checkout según simplysweet.cl (D15, PLAN §9 / F2.1) |
| `lib/cart.ts`, `lib/account.ts` | Carrito único compartido y enlace de cuenta del header |
| `components/store-shell.tsx` | Header y footer compartidos por carta, ficha y checkout (sin accesos de cuenta en el footer) |
| `https://simplysweet.cl` | **Referencia de diseño/UX** para la ficha de producto y el checkout (D15, PLAN §9) |
| `backend/app/models.py` › `ShippingZone` | Puntos de retiro y encuentro con `location`; sus franjas cuelgan de él (D16/D18, PLAN §0.7–§0.8) |
| `components/admin-agenda.tsx` | Agenda didáctica del panel: una tarjeta por punto con sus franjas, más los cierres semanales y por fecha (D18/D19, PLAN §0.8) |
| `lib/schedule.ts` | Días de la semana compartidos y formato compacto de franjas (D18) |