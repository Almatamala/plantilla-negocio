# RPD — Registro de Producto y Decisiones

**Proyecto:** Tienda BOSQUE (panadería/pastelería artesanal)
**Versión del documento:** 1.8
**Fecha:** 2026-09-21
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

## 1.7 Actualización v8 — Ajustes del dueño (2026-09-16)

**Implementado y verificado** (`tsc`, `lint`, `build`; la API no se modificó, así que no hace falta
reconstruir la imagen). El detalle por tarea está en **PLAN §0.9**; aquí el análisis frente a este
documento:

1. **Dos lecturas de sesión al arrancar (§1.2, §3.5).** El header, el checkout, la cuenta y el panel
   pedían `GET /api/auth/me` cada uno por su cuenta; en desarrollo React monta los efectos dos veces, de
   modo que al arrancar se veían **dos** llamadas idénticas (y una más en cada navegación). La sesión pasa
   a ser una **promesa compartida** (`lib/session-client.ts`) expuesta con `useSyncExternalStore`; ahora
   hay **una sola** lectura por carga de página sin importar cuántos componentes la pidan. El token sigue
   viviendo solo en la cookie httpOnly.
2. **La cuenta dentro del layout de la tienda (§3.5).** `/cuenta` era un `<main>` propio con «Volver a la
   tienda», exactamente el patrón que se corrigió en la ficha con **D15**. Ahora usa `StoreHeader` y
   `StoreFooter` (mismos que carta, ficha y checkout) con los ajustes de `/api/settings`.
3. **Modo sin conexión: última versión conocida en vez de valores por defecto (§3.1 y §3.3).** Este
   documento registraba como riesgo asumido que «sin la API levantada… el catálogo demo queda como
   fallback visual» (§1.1, punto 7). Se cierra con **D20**: cada lectura de la **vidriera** guarda su última
   respuesta buena en `localStorage` (clave con versión) y la usa **solo si la petición falla**, sin service
   worker ni PWA (la opción más barata: no hay copia en el servidor ni proceso que mantener). La API siempre
   gana cuando responde y lo guardado vence a los 7 días. **El panel queda fuera** por decisión del dueño:
   ahí un stock o un pedido viejos inducirían a editar sobre datos desactualizados. **El formulario del
   checkout también queda fuera** (ver el recorte en PLAN §0.9): con la API caída el pedido no se puede
   registrar de todas formas, así que el checkout muestra un aviso explícito con enlace a WhatsApp y solo
   conserva el respaldo del catálogo y los ajustes, para que el carrito no muestre precios falsos.
4. **Reportes del negocio (§3.5, panel).** La sección mostraba tres métricas y un ranking simple. Se
   implementa **D21** con las métricas que el dueño aprobó: ventas con **comparación contra el período
   anterior** (solo en los presets de 7 y 30 días) y ticket promedio, productos más y menos vendidos
   (unidades e ingresos) y los sin ventas, ventas por punto de retiro, pedidos por día y franja, e ingresos
   por categoría con alerta de reposición. El filtro fijo «Este mes» se reemplaza por un **rango
   personalizado de meses enteros (de un mes hasta un año)** que define el tramo de datos de las tablas —
   el dueño precisó que ese rango **no** busca comparar, sino acotar la información que alimenta cada
   tabla. **Nada requirió cambios de schema**: `GET /api/orders` ya devolvía `created_at`, las líneas, el
   punto de retiro y la agenda. Los **cobros pendientes** y los **clientes recurrentes** se propusieron y
   quedaron fuera de esta tanda.
5. **Selects del panel (§3.5, panel).** Los `<select>` nativos mostraban la flecha del navegador
   resaltada en azul al pasar el mouse, fuera de las esquinas redondeadas. Se oculta el widget nativo
   (`appearance: none`), se dibuja una flecha propia y el estado se marca **en el borde**, como el botón
   del filtro de precio.

**Nota de datos:** sin migraciones. Lo único que cambió de forma es que el panel ahora conserva
`created_at` de cada orden para poder agrupar por período.

---

## 1.8 Actualización v9 — Limpieza de código y del modelo de datos (2026-09-16)

**Implementado y verificado** (`pytest` 40/40, `tsc`, `lint`, `build`, y la migración ensayada contra el
PostgreSQL del contenedor dentro de una transacción revertida). Detalle por tarea en **PLAN §0.10**.

1. **Bug encontrado en la revisión (§1.2, D13).** `lib/api.ts › uploadImage` seguía enviando **solo**
   `X-Admin-Token`, la clave heredada que desde D13 ya no se guarda en la UI: con el login por sesión,
   **subir fotos desde el panel de productos fallaba con 401**. Ahora usa el `Authorization: Bearer` de la
   sesión, igual que el resto del cliente HTTP. Este documento daba por resuelta la migración a JWT de
   sesión; faltaba este endpoint.
2. **Código sin uso (§2 y §3.5).** Se retiraron los datos demo de agenda del checkout (inalcanzables desde
   el recorte de D20, y engañosos justo cuando la API responde sin puntos: decían «dirección por
   confirmar»), el campo `payment_method` del tipo de la cuenta que nunca se pintaba y varios `export`
   internos que aparentaban ser API pública de sus módulos.
3. **Duplicación convertida en piezas compartidas (§2).** Cuatro pantallas repetían el mismo efecto de
   ajustes y seis bloques la misma lectura con respaldo; el checkout, la agenda y el formulario de pedidos
   declaraban **sus propios** tipos de punto y franja (con la normalización de tipo viviendo dentro de un
   componente del panel); los meses y días estaban copiados en el checkout. Quedan `lib/use-store-settings.ts`,
   `loadCached()` en `lib/offline-cache.ts`, `lib/agenda.ts` y `MONTHS_SHORT` en `lib/months.ts`. **No se
   fusionaron** las etiquetas de entrega ni los estados de pedido del panel con los de la cuenta: son
   vocabularios distintos a propósito (el admin ve el estado crudo de la API, el cliente la etiqueta
   derivada) y fusionarlos mezclaría responsabilidades.
4. **Modelo de datos acotado (D22, §3.1–§3.3).** El schema arrastraba `product_variants` (con `variants`
   en los schemas, `order_items.variant_id` y un panel que enviaba siempre una lista vacía), las columnas
   `products.sku`/`seo_title`/`seo_description` y la tabla `pages` con un `POST /api/pages` sin GET, sin
   pantalla y sin pruebas. Al revisarlo con el dueño se confirmó que **ninguno se va a usar**: el
   «contenido editable» del plan es `store_settings` (F2.5) y la ficha propia ya da la URL por producto
   (D1), sin necesidad de campos SEO editables. Se retiraron del modelo, de los schemas y de la API, y una
   lista idempotente (`RETIRED_CATALOG_OBJECTS`) los borra al arrancar en PostgreSQL. La prueba que cubría
   variantes pasa a cubrir **producto + catálogo público**.

**Nota de datos:** la limpieza **sí** toca la base existente (borra una tabla, otra tabla y cuatro
columnas). Al momento de aplicarla, `pages`, `product_variants`, `order_items.variant_id`, `products.sku`
y los campos SEO estaban **vacíos**, así que no hubo pérdida de información. **Requiere reconstruir la
imagen de la API**, porque el Dockerfile copia el código en lugar de montarlo.

---

## 1.9 Actualización v10 — Ajustes del dueño (2026-09-21)

**Implementado y verificado** (`tsc`, `lint`, `build`, `pytest` 41/41 y prueba de punta a punta contra la
API dockerizada: `ALTER TABLE` de la columna nueva aplicado y `PUT`/`GET /api/settings` guardando y
devolviendo la URL del widget). Detalle por tarea en **PLAN §0.11**. Cuatro puntos sobre el código actual,
con dos decisiones nuevas (**D23** y **D24**):

1. **Ficha — moverse entre fotos con comodidad (F1.1, D1).** La galería ya traía miniaturas, pero con
   varias fotos obligaba a apuntar a cada una. Se agregan **flechas izquierda/derecha** sobre la foto
   principal que avanzan y dan la vuelta al llegar al final, en escritorio y en móvil, además de las
   miniaturas que ya existían.
2. **Feed de Instagram (D23, §3.5).** Este documento registraba «❌ Feed de Instagram: no existe» y D11
   dejaba abierto *embed real con token* vs. *enlace/gráfica estática*. El dueño pidió las últimas
   historias **al final de la página principal**, **de borde a borde** de la pantalla y **solo las
   publicaciones**, como en la referencia https://www.studiopasacademy.com. El **embed oficial del perfil** no sirve para eso: no se
   puede ensanchar más allá de su tarjeta (~540 px) ni ocultar el encabezado del perfil, y scrapear la API
   pública desde el servidor responde **429** (probado). Se resuelve con el **iframe de un widget de
   terceros** (D23) que se configura con el **código o la URL** en el panel (respeta la altura sugerida).
   **Solo se pinta el iframe**: sin encabezado ni enlace al perfil, porque el propio widget ya muestra las
   publicaciones y lleva a Instagram. Sin widget, la sección no se dibuja.
3. **Catálogo principal como «Productos destacados» (D15, F1.10).** Con https://simplysweet.cl como
   referencia, la carta de la página principal adopta su apartado de **productos destacados/más vendidos**:
   se **mantienen los filtros arriba**, la tarjeta queda **solo con foto, nombre y precio** —se quita la
   **categoría** que iba debajo de la carta y la **descripción** que iba debajo del `<h3>`— y el listado se
   titula «Productos destacados». Es un cambio de **estructura visual**, no de datos.
4. **Paleta cálida (D24).** El dueño entregó los tonos **#D7CDC1, #D9B391, #846851, #401A04 y #808C6D**
   (con blanco/negro de apoyo) para que la página se vea elegante y armónica, **solo en la página
   principal y la ficha**. Como el header/footer se comparten con `/checkout` y `/cuenta`, el tema se
   aplica con la clase `theme-bosque` sobre el `<main>` de esas dos vistas y el header/footer recibe una
   prop `warm`; el checkout y la cuenta **conservan** la identidad anterior. **Ajustado en v13 (§1.12 / D28): el footer es cálido en todas las páginas y ya no lleva la prop `warm`.** Los indicadores de stock
   mantienen su semántica (verde/ámbar/rojo) por ser funcionales, no decorativos.

**Nota de mantenimiento:** los `.pyc` de `backend/**/__pycache__` estaban **versionados** en git, así que
correr `pytest` ensuciaba el diff. Ya estaban cubiertos por `.gitignore`; se les quitó el seguimiento con
`git rm -r --cached` (los archivos siguen en disco).

---

## 1.10 Actualización v11 — Catálogo paginado (2026-09-21)

**Implementado y verificado** (`pytest` 42/42; `tsc`, `lint` y `build` sin errores). Detalle por tarea en
**PLAN §0.12**. Un punto sobre el código actual, con una decisión nueva (**D25**):

1. **Productos destacados con página y transición (D25, F1.10).** El catálogo mostraba **todos** los
   productos filtrados y el filtro los hacía desaparecer de golpe. Ahora son **8 por página** (4 columnas
   × 2 filas, ~~ajustable en Contenido~~ **fijo desde v12, D26**) con **flechas de página** a la derecha de los filtros, y al filtrar
   los que no coinciden **se desvanecen** mientras los que quedan **se juntan** (`framer-motion`: `layout`
   + `AnimatePresence mode="popLayout"`).

---

## 1.11 Actualización v12 — Ajustes del dueño (2026-09-22)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores; `pytest` 42/42). Detalle por tarea en
**PLAN §0.13**. Dos puntos sobre el código actual, con dos decisiones nuevas (**D26** y **D27**):

1. **Productos destacados: 8 por página, fijos (D26, F1.10).** La v11 dejó la cantidad como ajuste
   editable. Ahora la carta pagina **siempre 8 productos** (4 columnas × 2 filas) desde una constante y el
   ajuste sale del panel, del frontend y de la API: `store_settings.products_per_page` se retira con
   `DROP COLUMN` idempotente al arrancar. Las flechas, el contador y la animación del filtro se mantienen.
2. **Footer profesional (D27, F2.18).** El footer mostraba solo el nombre y una línea de plantilla. Ahora
   tiene marca, **Contacto** (correo, teléfono, WhatsApp e Instagram, cada fila solo si está configurada),
   navegación y una franja inferior con **© año + nombre** y la ubicación. `contact_email` **nunca había
   llegado al frontend** (`lib/store-config.ts` no lo declaraba, aunque la API sí lo guardaba), así que se
   agrega a los ajustes del frontend. El footer mínimo del checkout se mantiene (referencia Shopify, D15).

---

## 1.12 Actualización v13 — Ajuste del dueño (2026-09-22)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores). Detalle por tarea en **PLAN §0.14**.
Un punto sobre el código actual, con una decisión nueva (**D28**):

1. **Footer cálido en todas las páginas (D28, F2.19).** La v10 hizo el footer **compartido** por carta,
   ficha y cuenta, pero con la prop `warm`: cálido en las dos primeras y con el verde anterior en
   `/cuenta`. El dueño pidió uniformar **el footer de la cuenta**, así que `StoreFooter` deja de llevar la
   prop y usa siempre la paleta cálida (`#401A04` de fondo, `#D7CDC1` de texto, `#D9B391` en títulos y
   enlaces, `#846851` en la línea divisoria). Al ser un solo footer, la variante verde queda sin uso y se
   elimina (D22), y `app/cuenta/page.tsx` queda uniformada **sin cambios**. El **header** conserva `warm`
   (la cuenta mantiene ahí la identidad anterior) y el footer mínimo del checkout sigue igual (D15).

---

## 1.13 Actualización v14 — Ajuste del dueño (2026-09-22)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores; `pytest` 43/43). Detalle por tarea en
**PLAN §0.15**. Un punto sobre el código actual, con una decisión nueva (**D29**):

1. **Colores editables desde el panel (D29, F2.20).** El dueño quiere poder **probar las combinaciones
   que el cliente pida** sin tocar código. La paleta cálida estaba fija en dos lugares: la clase
   `theme-bosque` de `app/globals.css` y ~70 hex sueltos en la carta, la ficha, el footer y el carrito.
   Ahora los **cinco tonos** (acento, tinta, bloque suave, texto secundario y detalle cálido) son
   variables CSS (`--brand-*`) con la paleta actual como valor por defecto, se editan en **Contenido ›
   Colores de la tienda** (selector de color, hex e **«Intercambiar con…»**, que cambia dos tonos de lugar;
   el botón «Restablecer paleta» se retiró el mismo día a pedido del dueño) y se guardan en
   `store_settings.theme_colors` (columna JSON validada por la API). Cada vista cálida los escribe en
   línea sobre su `<main>`, así que carta, ficha, carrito y footer acompañan el cambio; lo que no se
   edita se deriva con `color-mix` para que la tienda siga legible. **Decidido con el dueño:** cinco
   tonos nombrados por su uso, alcance carta + ficha + footer, y **sin vista previa** (guardar y
   refrescar). El panel, el checkout y el contenido/header de la cuenta conservan sus colores. La API
   además **rechaza los campos que no conoce** (`extra="forbid"` en `SettingsIn`): contra una imagen
   vieja, guardar la paleta respondía 200 sin guardar nada, que es como apareció el problema. Probado de
   punta a punta contra la API dockerizada reconstruida (guardado, normalización a minúsculas y 422 para
   hex inválido, tono desconocido y campo de más).

---

## 1.14 Actualización v15 — Feed de Instagram propio (2026-09-23)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores; `GET /api/instagram/feed` probado **en
vivo** contra la API real: 15 publicaciones con likes y comentarios). Detalle por tarea en **PLAN §0.16**.
Un punto sobre el código actual, con una decisión nueva (**D30**):

1. **Feed propio en lugar del widget de terceros (D30, F3.2).** La v10 había resuelto Instagram con el
   **iframe de SociableKIT** (**D23**): mostraba las publicaciones a ancho completo, pero no permitía
   pintar datos propios (likes, comentarios, descripción) y dependía de las **vistas del plan gratis**. El
   dueño aportó el **token de larga duración** de la **Instagram API with Instagram Login** de la cuenta
   profesional —la API pública de *scrapeo* sí devolvía **429**, pero `/me/media` **no**—, así que ahora hay
   un **widget propio**: las **15 últimas publicaciones en 3 filas de 5 columnas** (constantes en
   `lib/instagram.ts`, editables **solo en el código**) con **likes, comentarios y descripción al pasar el
   mouse** y acceso a la publicación. El token **nunca llega al navegador**: vive en variables de entorno
   **de servidor** y un **route handler** de Next (`/api/instagram/feed`) entrega las publicaciones ya
   normalizadas (imagen; miniatura si es video; primera imagen si es carrusel) con **caché de 15 min**. El
   widget anterior **se mantiene** y la home muestra **los dos** mientras el dueño compara. La **renovación
   del token** (60 días, vía `refresh_access_token`) quedó **documentada sin implementar**, con la decisión
   del dueño de hacerla como **tarea programada en el mismo stack**; y el **webhook** de Instagram **no se
   usa**: sirve para eventos en tiempo real (comentarios, menciones y mensajes), no para leer el feed.

---

## 1.15 Actualización v16 — Retiro del widget de Instagram de terceros (2026-09-23)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores; `pytest` 43/43). Detalle por tarea en
**PLAN §0.17**. Cierra la **D30** de la v15, sin decisión nueva:

1. **El feed propio reemplaza al widget de terceros (D30, retira D23).** Confirmado el nuevo widget, se
   retiraron el iframe de SociableKIT (`components/instagram-feed.tsx`), la **leyenda de vista previa** y el
   ajuste «Instagram — código o URL del widget» de Contenido, junto con la columna
   `store_settings.instagram_embed_url` (`DROP COLUMN IF EXISTS` al arrancar, misma regla de **D22**). La
   sección de Instagram de la página principal es ahora **solo el feed propio**, y el enlace al perfil
   (`instagram_url`) del footer se mantiene.

---

## 1.16 Actualización v17 — Grillas de celular a 2 columnas (2026-09-23)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores). Detalle por tarea en **PLAN §0.18**.
Un punto sobre el código actual, **sin decisión nueva**:

1. **Celular a 2 columnas (D30 y F1.10).** El **feed propio** pasa a **2 publicaciones por fila** en
   celular (5 en escritorio) y **oculta la que sobra** cuando la cantidad no completa la última fila: con
   15 publicaciones se ven **14** (7 filas de 2) y en escritorio siguen las 15 en 3 filas de 5. **Productos
   destacados** también muestra **2 por fila** en celular, manteniendo los **8 por página**.

---

## 1.17 Actualización v18 — Separación del feed y alineación del header en PC (2026-09-23)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores). Detalle por tarea en **PLAN §0.19**.
Dos puntos sobre el código actual, **sin decisión nueva**:

1. **Margen entre publicaciones (D30, F3.2).** El feed pegaba las fotos con **líneas de 1 px**
   (`gap-px` sobre un fondo de color); ahora hay **8 px de margen real** (`gap-2`, sin fondo en la grilla),
   así que el hueco deja ver el blanco de la página, más **8 px de aire arriba y abajo** del feed (`py-2`).
2. **Header alineado con la carta en PC (F2.10 / F2.18).** El header ponía el padding **dentro** de
   `max-w-7xl` y la sección «Productos destacados» lo pone **fuera**: en PC el borde del header caía 40 px
   más adentro. El header pasa al mismo patrón de la carta, así que ambos bordes coinciden. El hero,
   «Beneficios» y el footer conservan el patrón anterior (queda documentado por si se quiere unificar).

---

## 2. Estado actual del código (resumen)

| Capa | Qué existe hoy |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Tailwind v4). Tienda en `app/page.tsx` → `components/storefront.tsx`, carrito en `localStorage`, panel admin en `app/admin` → `components/admin-dashboard.tsx`, login por correo/contraseña + Google en `app/login`, página de cuenta `app/cuenta` (dentro del layout de la tienda), `proxy.ts` protege `/admin` (rol admin). Sesión compartida en `lib/session-client.ts`, respaldo de lecturas públicas en `lib/offline-cache.ts` y ajustes de tienda en `lib/use-store-settings.ts` (§1.7–§1.8). |
| **Catálogo** | `lib/products.ts` con 4 productos demo como fallback; si la API responde, el storefront lee `products` activos reales. Fotos: subida desde el admin (`POST /api/upload`), galería en ficha y storefront, con gradiente CSS como fallback. |
| **Datos** | `backend/app/models.py` (SQLAlchemy): tablas `profiles`, `categories`, `products`, `orders`, `order_items`, `time_slots` (franjas **de cada punto**, con días de la semana), `closed_days` (fechas), `closed_weekdays` (cierre semanal), `shipping_zones`, `reviews`, `store_settings`. Las tablas se crean al arrancar la API; una lista idempotente de `ALTER TABLE`/`DROP` mantiene al día las bases ya creadas (**D22**). |
| **Admin** | Panel con secciones Inicio / Productos / Pedidos / Agenda / Comentarios / Contenido / Reportes. CRUD de productos contra la API, filtros, edición de stock, pedidos reales con creación y edición manual (sin borrado), agenda (franjas/días cerrados/zonas) y contenido editable. Acceso controlado por `proxy.ts` (rol admin). |
| **Backend (fuente de verdad)** | `backend/` FastAPI + SQLAlchemy dockerizado (AWS). Catálogo, agenda, zonas, reviews, órdenes con stock server-side, ajustes e imágenes. Auth por correo/contraseña (bcrypt) + Google OAuth (authlib). Mutaciones admin con JWT `role=admin` o `X-Admin-Token`. |
| **Identidad** | `lib/store-config.ts` es el fallback (nombre, hero, historia); la tabla `store_settings` **sí se usa**: el storefront la lee con `GET /api/settings` y el panel la edita en **Contenido**, incluida la **paleta de la tienda** (`theme_colors`: acento, tinta, bloque suave, texto secundario y detalle cálido — D29). |

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
- ✅ **Feed de Instagram**: existe desde v10 (**D23**, §1.9). Al final de la página principal se muestra, a ancho completo, el **iframe de un widget de terceros** con **solo las publicaciones**, configurado con una URL en el panel, más un botón con el glifo de Instagram al perfil. Sin token de Meta.
- ⚠️ **Panel auto-gestionable**: el admin funciona en desktop, pero **en celular el menú lateral está
  oculto** (`hidden md:block`) sin alternativa → contradice directamente el requisito "gestionar desde el
  celular, ipad, computador".
- ❌ **Comentarios de clientes**: no existe ni tabla ni UI.
- ✅ El panel **sí valida el rol**: `proxy.ts` solo deja entrar a sesiones `role=admin` y la API exige
  JWT de admin o `X-Admin-Token` en las mutaciones (ver §1.2).

**Conflictos y decisiones:**

1. **Feed de Instagram (resuelto, D23)**: un embed real con token de Meta requiere cuenta comercial y
   caduca (frágil); el embed oficial del perfil no se puede ensanchar ni ocultar su encabezado, y la API
   pública bloquea el scrapeo (429). Se resolvió con el **iframe de un widget de terceros** configurado
   desde el panel, que cubre la expectativa de la referencia sin manejar credenciales propias.
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

**Ajustes del dueño v8 (§1.7):** corrigen una lectura duplicada de sesión, integran `/cuenta` al layout de
la tienda, agregan el respaldo de **última versión conocida** cuando la API no responde (**D20**), amplían
los **reportes** con las métricas de negocio aprobadas (**D21**) y quitan el brillo nativo de los selects
del panel. Se reparten en **F2.11–F2.14** y **F3.4** sin reordenar las fases.

**Ajustes del dueño v10 (§1.9):** agregan flechas a la galería de la ficha, la sección de **Instagram** al
final de la página principal (widget de terceros con iframe, **D23**), adoptan el apartado de **productos
destacados** de simplysweet.cl en la carta (filtros arriba, sin categoría ni descripción por tarjeta) y
aplican la **paleta cálida** del dueño con el **salvia `#808C6D` como acento principal**, solo a la página
principal y la ficha (**D24**). Se reparten en **F1.1**, **F1.10**, **F3.2** y **F2.17** sin reordenar las
fases.

**Ajustes del dueño v12 (§1.11):** fijan los **8 productos por página** de «Productos destacados» —el
ajuste sale del panel y de la API (**D26**)— y rehacen el **footer** con contacto (correo, teléfono y
WhatsApp) y copyright (**D27**). Se reparten en **F1.10** y **F2.18** sin reordenar las fases.

**Ajustes del dueño v13 (§1.12):** uniforman el **footer de `/cuenta`** con la paleta cálida de la tienda
—el pie pasa a ser **uno solo** para carta, ficha y cuenta, sin la prop `warm` (**D28**)—. Se reparte en
**F2.19** sin reordenar las fases.

**Ajustes del dueño v14 (§1.13):** hacen **editables los colores** de la tienda desde el panel para poder
probar configuraciones con el cliente: cinco tonos como variables CSS guardadas en
`store_settings.theme_colors` (**D29**). Se reparten en **F2.20** sin reordenar las fases.

**Ajustes del dueño v15 (§1.14):** reemplazan el **widget de terceros** de Instagram por un **feed propio**
con la **API de Instagram** (token de larga duración **solo en el servidor**, **D30**): 15 publicaciones en
**3 filas de 5 columnas** y con **likes, comentarios y descripción al pasar el mouse**. Se reparten en
**F3.2** sin reordenar las fases.

**Ajustes del dueño v16 (§1.15):** confirman el feed propio y **retiran el widget de terceros** y todo su
ajuste (componente, campo del panel y columna `store_settings.instagram_embed_url`): cierran **D30** y
**retiran D23**. Se reparten en **F3.2** sin reordenar las fases.

**Ajustes del dueño v17 (§1.16):** llevan las **grillas de celular a 2 columnas** —el feed de Instagram
(descartando la publicación sobrante para no dejar una foto sola) y **Productos destacados**—, sin
decisión nueva. Se reparten en **F3.2** y **F1.10** sin reordenar las fases.

**Ajustes del dueño v18 (§1.17):** agregan **margen real entre las publicaciones** de Instagram (y un
respiro vertical de 8 px arriba y abajo del feed) y **alinean el header con la carta en PC** (mismo margen
lateral que «Productos destacados»), sin decisión nueva. Se reparten en **F3.2**, **F2.10** y **F2.18**
sin reordenar las fases.

**Ajustes del dueño v9 (§1.8):** limpian el código **duplicado o sin uso** (con la corrección del bug de
subida de fotos que apareció en la revisión), convierten en piezas compartidas los patrones repetidos en
cuatro pantallas (**hooks y tipos**) y **acotan el modelo de datos** retirando del backend lo que no se
usará: variantes, SKU, campos SEO propios y páginas editables (**D22**). Se reparten en **F0.5**,
**F2.15** y **F2.16**.

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
| D11 | Instagram | **RESUELTA (v10, §1.9):** widget de terceros con **iframe** (solo publicaciones, ancho completo) configurado desde el panel; el embed oficial del perfil queda descartado y el feed con token de Meta sigue como alternativa | Tienda, panel (Contenido › Instagram) |
| D12 | Alcance del panel móvil | Drawer/bottom-nav en admin | Trabajo transversal |
| D13 | Protección del panel de administración | **RESUELTA E IMPLEMENTADA** (ver §1.2): sesión server-side en cookie httpOnly + `proxy.ts` por rol admin; login por correo/contraseña + Google | Arquitectura + seguridad |
| D14 | Confirmación de cuenta | **RESUELTA E IMPLEMENTADA** (ver §1.4): código temporal de 6 dígitos por correo (Resend) | Schema `profiles`, auth, `/login` |
| D15 | Referencia de diseño | **RESUELTA** (ver §1.4): https://simplysweet.cl para la ficha de producto y el checkout | Ficha, checkout |
| D16 | Entrega | **RESUELTA E IMPLEMENTADA** (ver §1.5): no hay despacho a domicilio; solo retiro presencial y puntos de encuentro (San Javier / Talca) con ubicación y horario, en una ventana de 2 semanas | Schema `shipping_zones`, checkout, admin |
| D17 | Nota del pedido | **RESUELTA E IMPLEMENTADA** (ver §1.5): eliminada del checkout, del admin y del schema | Checkout, admin, `orders.notes` |
| D18 | Franjas horarias | **RESUELTA E IMPLEMENTADA** (ver §1.6): cada franja pertenece a un **punto** y declara los **días de la semana** en que atiende; el punto ya no tiene un horario en texto libre | Schema `time_slots`, checkout, agenda del admin |
| D19 | Días cerrados | **RESUELTA E IMPLEMENTADA** (ver §1.6): cierres **semanales recurrentes** (p. ej. lunes de producción; domingo por defecto) **y** fechas puntuales | Nueva tabla `closed_weekdays`, checkout, agenda del admin |
| D20 | Modo sin conexión con la API | **RESUELTA E IMPLEMENTADA** (ver §1.7): **última versión conocida** guardada en el navegador (`localStorage` con clave versionada, 7 días) como respaldo de la **vidriera**; sin service worker ni PWA, **sin aplicarse al panel** y sin respaldar la agenda del checkout (ahí se avisa y se bloquea la confirmación) | Tienda, ficha de producto (y ajustes del header en `/cuenta`) |
| D21 | Reportes del negocio | **RESUELTA E IMPLEMENTADA** (ver §1.7): métricas aprobadas por el dueño (ventas + ticket promedio, más/menos vendidos, sin ventas, puntos de retiro, día y franja, categorías y reposición) con **rango personalizado por meses enteros hasta un año** en reemplazo del filtro «Este mes»; la comparación con el período anterior queda solo en los presets de 7 y 30 días | Sección **Reportes** del panel |
| D22 | Alcance del modelo de datos | **RESUELTA E IMPLEMENTADA** (ver §1.8): el producto es **uno por publicación** —sin variantes, sin SKU y sin campos SEO propios— y **no hay páginas editables**; el contenido editable vive en `store_settings` (F2.5). Se retiraron `product_variants` (y `order_items.variant_id`), `products.sku`/`seo_title`/`seo_description`, `pages` y `POST /api/pages` | `backend/app/models.py`, `schemas.py`, `main.py`, panel |
| D23 | Feed de Instagram | **RETIRADA en v16 (§1.15)**: reemplazada por el **feed propio** de **D30**; el widget de terceros, su campo en el panel y la columna `instagram_embed_url` se eliminaron (v15, §1.14). **Original:** **RESUELTA E IMPLEMENTADA** (ver §1.9): sección al final de la página principal que pinta **solo el iframe de un widget de terceros** (solo publicaciones, **de borde a borde**) con el código/URL guardado en `store_settings.instagram_embed_url` (widget de **SociableKIT** ya configurado). Evita el token de Meta y el scrapeo (429). Actualiza D11 | `store_settings.instagram_embed_url`, `components/instagram-feed.tsx`, `components/storefront.tsx`, panel (Contenido) |
| D24 | Identidad visual (paleta) | **RESUELTA E IMPLEMENTADA** (ver §1.9): paleta **#D7CDC1 / #D9B391 / #846851 / #401A04 / #808C6D** (más blanco/negro de apoyo) aplicada **solo a la página principal y la ficha de producto**; `/checkout` y `/cuenta` conservan la identidad anterior. Se implementa con la clase `theme-bosque` y la prop `warm` del header (el **footer** pasó a ser cálido en todas las páginas en v13, **§1.12 / D28**; y los **cinco tonos se editan desde el panel** en v14, **§1.13 / D29**) | `app/globals.css`, `storefront.tsx`, `product-detail.tsx`, `store-shell.tsx`, `cart-drawer.tsx` |
| D25 | Paginado del catálogo | **RESUELTA E IMPLEMENTADA** (ver §1.10): **8 productos por página** con **flechas de página** a la derecha de los filtros y **transición animada** al filtrar, en lugar de mostrar todo el catálogo de una vez. **Ajustada en v12 (§1.11 / D26): la cantidad queda fija** | `components/storefront.tsx` |
| D26 | Productos por página | **RESUELTA E IMPLEMENTADA** (ver §1.11): **8 por página, fijos** (4 columnas × 2 filas). Deja de ser configurable desde el panel y la columna `store_settings.products_per_page` se retira de la API | `components/storefront.tsx`, `backend/app/*`, panel (Contenido) |
| D27 | Footer de la tienda | **RESUELTA E IMPLEMENTADA** (ver §1.11): footer **profesional** compartido por carta, ficha y cuenta —marca, **datos de contacto** (correo, teléfono, WhatsApp e Instagram), navegación y **copyright con el año**—; el footer mínimo del checkout se mantiene (D15) | `components/store-shell.tsx`, `lib/store-config.ts` |
| D28 | Footer cálido único | **RESUELTA E IMPLEMENTADA** (ver §1.12): **un solo footer, siempre en la paleta cálida**, en carta, ficha y cuenta (pierde la prop `warm` y con ella la variante verde). Ajusta D24 en el pie; el **header** mantiene `warm` y el checkout su footer mínimo (D15) | `components/store-shell.tsx`, `storefront.tsx`, `product-detail.tsx`, `app/globals.css` |
| D29 | Paleta de marca editable | **RESUELTA E IMPLEMENTADA** (ver §1.13): los **cinco tonos** de la identidad cálida se editan desde el panel (Contenido › Colores) y se guardan en `store_settings.theme_colors` (JSON validado: solo esos tonos y hex de seis dígitos). La tienda los aplica con variables CSS `--brand-*` y deriva el resto con `color-mix`; el panel, el checkout y el contenido/header de la cuenta conservan sus colores. Ajusta D24 | `lib/theme.ts`, `app/globals.css`, `storefront.tsx`, `product-detail.tsx`, `store-shell.tsx`, `cart-drawer.tsx`, `app/cuenta/page.tsx`, `admin-dashboard.tsx`, `backend/app/*` |
| D30 | Feed de Instagram propio | **RESUELTA E IMPLEMENTADA** (ver §1.14): **feed propio** con la **API de Instagram** (Instagram Login) en lugar del widget de terceros —token de larga duración **solo en el servidor** (`INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID`) y un **route handler** de Next que entrega las publicaciones normalizadas—: las **15 últimas en 3 filas de 5 columnas** (configurables **solo en el código**, `lib/instagram.ts`) con **likes, comentarios y descripción al pasar el mouse**. El dueño **confirmó el reemplazo** en la v16 (§1.15), así que **D23 quedó retirada**; la **renovación del token** queda documentada como **tarea programada en el mismo stack**. Ajusta y retira D23 | `lib/instagram.ts`, `app/api/instagram/feed/route.ts`, `components/instagram-grid.tsx`, `components/storefront.tsx`, `.env` |

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
| `app/page.tsx` / `components/storefront.tsx` | Tienda pública (hero, catálogo «Productos destacados», carrito, beneficios, historia, Instagram, footer) |
| `components/instagram-grid.tsx` | **Feed de Instagram propio** (D30): grilla de las 15 últimas publicaciones en 3 filas de 5 columnas, con **likes, comentarios y descripción al pasar el mouse**; lee `GET /api/instagram/feed` |
| `app/api/instagram/feed/route.ts` | Route handler **de servidor** que consulta la API de Instagram con `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID` y entrega las publicaciones normalizadas (caché 15 min); el token nunca llega al navegador (D30) |
| `lib/instagram.ts` | Tipos y **configuración única** del feed propio (`INSTAGRAM_POST_COUNT = 15`, `INSTAGRAM_COLUMNS = 5`): se edita **solo en el código**, no hay ajuste en el panel (D30) |
| `components/store-shell.tsx` | Header/footer compartidos. El footer trae marca, contacto (correo, teléfono, WhatsApp e Instagram), navegación y **copyright** (D27) y usa siempre la paleta cálida en carta, ficha y cuenta (D28); la prop `warm` del **header** aplica esa paleta solo en página principal y ficha (D24) |
| `components/admin-dashboard.tsx` | Panel admin completo (productos, stock, pedidos, secciones placeholder) |
| `app/admin/page.tsx`, `app/login/page.tsx` | Rutas admin y login magic-link |
| `lib/products.ts` | Productos demo + `formatPrice` |
| `lib/store-config.ts` | Textos de identidad hardcodeados |
| `lib/api.ts` | Cliente HTTP de la API dockerizada (JWT de sesión `Bearer`; respaldo `X-Admin-Token`) |
| `lib/session.ts` | Verificación del JWT de sesión (jose) + nombre de la cookie httpOnly |
| `proxy.ts` | Protege `/admin` (rol admin) y redirige a logueados fuera de `/login` |
| `app/api/auth/*` | Route handlers: login/registro, callback de Google, `/me`, logout (cookie httpOnly) |
| `app/cuenta` | Página de cuenta dentro del layout de la tienda (header/footer): datos, teléfono por defecto, historial de pedidos, cerrar sesión |
| `lib/theme.ts` | Paleta de marca editable: los cinco tonos con sus etiquetas, la normalización de lo que guarda la API y las variables CSS que aplican las vistas cálidas (D29) |
| `store_settings.theme_colors` | Paleta guardada como JSON (`accent`, `ink`, `surface`, `muted`, `detail`), editable en Contenido › Colores; sin valores guardados manda la paleta del código (D29) |
| `backend/app/*` | **Única fuente de verdad**: modelos, schemas y endpoints (crea las tablas al arrancar); auth por correo/contraseña + Google |
| `docker-compose.backend.yml` | Stack local de prueba: PostgreSQL 16 + API (GOOGLE_*, ADMIN_EMAILS, AUTH_JWT_SECRET) |
| `backend/tests/*` | Tests de la API local (40 pruebas: catálogo, órdenes, agenda, auth y correo) |
| `backend/app/emails.py` | Correo transaccional con **Resend** y plantilla del código de confirmación (D14, PLAN F2.9) |
| `components/checkout-shell.tsx` | Header/footer mínimos del checkout según simplysweet.cl (D15, PLAN §9 / F2.1) |
| `lib/cart.ts`, `lib/account.ts` | Carrito único compartido y hooks de sesión/enlace de cuenta del header (`useSession`, `useAccountLink`) |
| `lib/session-client.ts` | Sesión del navegador como **promesa compartida**: una sola lectura de `/api/auth/me` para toda la app (§1.7, PLAN §0.9) |
| `lib/offline-cache.ts` | Última versión conocida de la **vidriera** en `localStorage` (claves `bosque-cache:v1:`), usada solo si la API falla (**D20**); expone `loadCached()` (lectura con respaldo y señal `fromCache`) que usan tienda, ficha y checkout (PLAN §0.9–§0.10) |
| `lib/use-store-settings.ts` | Hook único de **ajustes de tienda** (fetch + `mergeSettings` + respaldo) que comparten tienda, ficha, cuenta y checkout (PLAN §0.10, A20) |
| `lib/agenda.ts` | Tipos compartidos de **punto de retiro y franja** (`Zone`, `Slot`, `ZoneType`) y `zoneTypeOf`, antes declarados en cada pantalla (PLAN §0.10, A20) |
| `components/admin-reports.tsx` | Sección **Reportes** del panel con las métricas de negocio y el selector de período (**D21**, PLAN §0.9) |
| `lib/months.ts` | Claves de mes `YYYY-MM`, etiquetas y rango por meses enteros con tope de un año (`moveRange`) que usa Reportes (PLAN §0.9, A18) |
| `components/store-shell.tsx` | Header y footer compartidos por carta, ficha y checkout (sin accesos de cuenta en el footer) |
| `https://simplysweet.cl` | **Referencia de diseño/UX** para la ficha de producto y el checkout (D15, PLAN §9) |
| `backend/app/models.py` › `ShippingZone` | Puntos de retiro y encuentro con `location`; sus franjas cuelgan de él (D16/D18, PLAN §0.7–§0.8) |
| `components/admin-agenda.tsx` | Agenda didáctica del panel: una tarjeta por punto con sus franjas, más los cierres semanales y por fecha (D18/D19, PLAN §0.8) |
| `lib/schedule.ts` | Días de la semana compartidos y formato compacto de franjas (D18) |