# Plan de Implementación — BOSQUE

**Proyecto:** Tienda BOSQUE (repostería)
**Basado en:** `RPD.md` (decisiones D1–D51; D5, D6, D11 y D23 quedaron retiradas)
**Fecha:** 2026-09-30 · **Estado:** documento vivo — despliegue y pendientes

---

## 0. Cómo usar este documento

- **Qué queda acá:** lo que **falta hacer** y cómo **desplegar**. El **estado actual del código** y las
  **decisiones** (D1–D51, con D5, D6, D11 y D23 retiradas) viven en `RPD.md`.
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
   ECR y redesplegar (ECS/EC2). Los **índices** de A61 se crean también al arrancar: sin reconstruir la
   imagen, la base queda sin ellos.
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

### 3.1 Primera tanda (2026-09-25)

**Implementado y verificado** (`pytest` 54/54; `tsc`, `lint` y `build` sin errores). Trece puntos, con ocho
decisiones nuevas (**D32** a **D39**):

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
| **A48** | Poder editar los textos de la tienda **haciendo clic sobre ellos** | **D38:** nueva ruta **`/admin/editor`** que reutiliza el storefront real; `components/editable-content.tsx` (`EditableText`) vuelve editable un texto —nombre, anuncio, hero e historia— **solo** cuando el editor lo envuelve, y `components/storefront-editor.tsx` junta los cambios y los guarda con el botón **«Guardar cambios»** (`PUT /api/settings`). En el editor la página se ve **oscurecida** (un velo) y los textos editables quedan por encima **en blanco**, con un **borde inferior** que aparece **solo al pasar el mouse** y que no altera el layout (los detalles del marcador se ajustaron después: ver **A49**, **A50** y **A51**); **Contenido** deja solo el contacto, los colores y el botón «Editar en la página». Extiende el pedido del primer mensaje sobre los campos de contenido. |
| **A49** | En el editor, el título y la descripción del hero deben verse como en la página; en la ficha, las fotos cambian sin transición | **D38/D39:** el marcador de los textos editables deja de alterar el layout —se retiran `display`, `max-width` y `padding`—, así que el **título y la descripción del hero conservan su posición exacta** (antes el `padding` de `.15em` los corría, más en el título de 7xl). En la vista de edición **todos los textos editables se ven blancos** y el **borde inferior** blanco aparece **solo al pasar el mouse** (un `box-shadow` interno: ni recuadro completo, ni parpadeo, ni cambio de alto). El **nombre del header** deja de ser la excepción: su centrado pasa de `-translate-x-1/2` a `inset-x-0 + mx-auto + w-fit`, así ya no crea un contexto de apilado que lo dejara debajo del velo (por eso antes no se veía ni el texto ni el borde) y se ve igual que el resto. En la ficha (**D39**) la galería cambia de foto con un **slide** direccional y la flecha de cada costado aparece al pasar el mouse por la **orilla** de la foto (en táctil queda visible). |
| **A50** | Quitar «Plantilla demo» del anuncio y que el texto en edición conserve fuente, tamaño y posición | **D38:** se retira el sufijo fijo **«· Plantilla demo»** que se agregaba al anuncio. En el editor, al hacer clic el texto **ya no se cambia por un `<input>`/`<textarea>`**: el **mismo elemento** pasa a `contentEditable`, con su misma clase, así que conserva **fuente, tamaño y posición** y nada de lo que lo rodea se mueve (antes el campo traía ancho, padding y borde propios y saltaba el layout, sobre todo en el título del hero, que ocupa varias líneas). Se retira la clase `.editable-field`; el fondo blanco con texto oscuro queda como la única señal de que se está editando. |
| **A51** | Al editar, que el cursor quede en el punto donde se hizo clic (sin seleccionar todo) y que se vea la línea del cursor | **D38/A50:** al hacer clic se guarda el **punto** y, al entrar en edición, se traduce a la posición del texto con `caretRangeFromPoint` (respaldo `caretPositionFromPoint` en Firefox); antes se seleccionaba todo, así que la **selección tapaba la línea del cursor**. Además el cursor se pinta oscuro (`caret-color`) sobre el fondo blanco y la colocación se **repite en el próximo cuadro** (`requestAnimationFrame`), porque al terminar el clic el navegador reacomoda la selección. Los dos textos que van **en una línea** en el header —el **nombre** y el **anuncio**— reciben una **caja propia** mientras se editan (`span… { display: inline-block; min-width: 1ch }`): sin eso el navegador no dibujaba la línea del cursor ahí, y un texto vacío tampoco se veía. |

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

**Decisión D38 (nueva):** la edición **visual** de la página vive en la ruta **`/admin/editor`** (bajo
`/admin`, así que `proxy.ts` ya exige sesión de rol admin). Ahí se muestra el **storefront real** y cada
texto que vive en `store_settings` —**nombre, anuncio, hero y historia**— se resalta y, al hacer clic, se
vuelve editable **en el mismo lugar** (el elemento pasa a `contentEditable`, sin cambiar de etiqueta, así
conserva fuente, tamaño y posición). El resto de la copy («Catálogo», «Productos destacados», beneficios) **no** es editable:
sigue fija en el código. Los cambios se juntan en un borrador y se confirman con **«Guardar cambios»**, que
hace un solo `PUT /api/settings` con el objeto completo; el contacto y la paleta siguen editándose en
**Contenido**, que además deja de mostrar esos textos en formularios y se queda solo con el contacto, los
colores y el botón **«Editar en la página»**. Durante la edición la tienda se ve **oscurecida** por un
velo y los textos editables quedan por encima **en blanco**, con un **borde inferior** que aparece **solo
al pasar el mouse**. Todos se comportan igual, **incluido el nombre del header**: su centrado no usa
`translate` (que creaba un contexto de apilado y lo dejaba debajo del velo). El marcador **no toca el layout** (el borde es un `box-shadow` interno, no un
`border`): los textos conservan la posición exacta de la página. El componente `EditableText` no cambia la
tienda pública: sin el provider del editor se comporta como texto normal.

**Decisión D39 (nueva):** la **galería de la ficha** (`components/product-detail.tsx`) cambia de foto con
un **slide direccional** (framer-motion): al avanzar, la foto nueva entra desde un costado y la que sale se
va hacia el otro, y al retroceder —con las flechas o eligiendo una miniatura a la izquierda— el movimiento
se invierte. Las fotos se apilan en absoluto dentro del mismo marco (`aspect-[.95]`), así que la animación
no salta de alto y el marco mantiene su tamaño mientras se desliza. Al pasar el mouse por la **orilla** de
la foto aparece la flecha con un degradado suave que indica hacia dónde se mueve (en táctil la flecha queda
siempre visible, porque ahí no hay hover).

### 3.2 Panel: filtros y agenda (2026-09-28)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores). Cuatro puntos que refinan el panel de
**Productos** y **Pedidos** (A47) y la **Agenda** (D18/D32), con una decisión nueva (**D40**):

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A52** | En Productos, poder filtrar entre productos **activos e inactivos** | **D40:** el **estado** se suma a la barra de filtros que ya traía categoría, precio y stock, con las mismas opciones que la columna «Estado» (Todos / Activos / Inactivos). El panel sigue pidiendo `?include_inactive=true`, así que «Todos los estados» muestra ambos. |
| **A53** | En Pedidos, filtros de **fecha** y **precio total** como los de Productos, y proponer algún filtro útil | **D40:** la barra de Pedidos suma filtros; el dueño los redefinió el mismo día (**A55**), así que **hoy** son **búsqueda**, **estado** y **punto de retiro**, y las fechas se ordenan desde la propia tabla. De los filtros que se propusieron —punto de retiro, franja agendada, pago registrado, producto o categoría vendida y antigüedad sin gestionar— el que quedó fue el **punto de retiro**. |
| **A55** | En Pedidos, que las fechas sean filtros **ascendente/descendente** dentro de la tabla —agregando la fecha que faltaba— y cambiar el filtro de **total** por uno de **puntos de retiro** | **D40:** se retiran los campos «desde/hasta» y el selector de fecha de la barra. La **fecha del pedido** (`created_at`) se agrega como **columna** —la tabla solo mostraba la agendada— y las **dos** fechas se ordenan haciendo clic en su encabezado: de la **más antigua a la más nueva** y al revés, con el mismo control que las columnas de Productos (abre con lo más reciente primero y los pedidos sin esa fecha quedan al final). El rango de **total** desaparece y en su lugar queda el filtro de **punto de retiro**, con las opciones tomadas de los propios pedidos listados. |
| **A54** | En Agenda, «Agregar punto» y «Cerrar día» a la derecha del encabezado abriendo un **modal**; en ubicación, un icono para buscar la dirección en **Google Maps** conservando la escritura directa; y bloquear las fechas cerradas anteriores a hoy | **D40:** los dos botones pasan al **extremo derecho del encabezado** de su sección y cada uno abre un **modal** (antes el formulario estaba desplegado en la página). El campo de **ubicación** —compartido por el alta y la edición del punto— conserva el texto libre y suma un botón que abre un buscador con el **mapa de Google incrustado**; al confirmar, la dirección buscada queda en el campo. Como la plantilla no tiene credenciales de Maps, el embed es el **público** (`output=embed`): sirve para confirmar la dirección, y un enlace a Google Maps permite afinarla. La fecha por cerrar **no acepta días anteriores a hoy** (el campo los bloquea y el formulario los rechaza). |

**Decisión D40 (nueva):** los **filtros del panel** quedan en una sola barra por tabla y con los mismos
controles: **Productos** suma el **estado** (activos / inactivos / todos) junto a categoría, precio y stock, y
**Pedidos** filtra por **estado** y **punto de retiro** (las opciones salen de los pedidos listados, sin pedir
la agenda a la API, e incluyen «Sin punto definido» si hay pedidos sin punto). Las **dos fechas de un pedido**
—la de creación (`created_at`) y la agendada (`scheduled_date`)— son **columnas de la tabla** y se ordenan
haciendo clic en su encabezado: de la **más antigua a la más nueva** y al revés, con el mismo control que las
columnas de Productos (antes había un rango «desde/hasta», que se retiró). En **Agenda** las altas
(«Agregar punto», «Cerrar día») viven en el **encabezado** de su sección y se hacen en un **modal**, la
**ubicación** del punto se escribe a mano o se busca en **Google Maps** (embed público, sin credenciales: el
buscador solo confirma la dirección y el texto sigue siendo libre) y las **fechas cerradas** no aceptan días
anteriores a hoy.

### 3.3 Editor visual: más textos editables (2026-09-28 · ampliado 2026-09-29)

**Implementado y verificado** (`pytest` 55/55; `tsc`, `lint` y `build` sin errores). Extiende **D38** (y su
**A48**): el editor de la página suma los textos que faltaban, sin pantallas nuevas.

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A56** | Que en el editor de la página también se puedan cambiar «Tu colección, tu estilo», las tres tarjetas de beneficios, «Una plantilla que crece contigo» y «San Javier y Talca, Chile»; y destacar que el título del pie y el copyright siguen al primer título de la página | **D38 ampliada:** los nueve textos nuevos son **columnas de `store_settings`** —`hero_eyebrow`, `story_eyebrow`, `benefit_1_title`/`benefit_1_text` … `benefit_3_text`, `footer_tagline` y `footer_location`—, así que se editan con un clic en la página y se guardan con el mismo `PUT /api/settings`; `ALTER TABLE … ADD COLUMN IF NOT EXISTS` los agrega al arrancar sobre una base ya creada. Los **tres beneficios** ya no están en el código: salen de los ajustes, con los textos de la plantilla como valor por defecto (`lib/store-config.ts`). El **nombre** de la tienda es **un solo campo** (`name`) que se dibuja en el título del header, en el del pie y en el **copyright**, pero **solo se edita en el título de arriba**: los otros dos lo siguen (el año del copyright se calcula solo) y la barra del editor lo aclara. Se suma una prueba de API del guardado de estos textos (y de que un campo desconocido siga devolviendo 422). |

**Decisión D38 (ampliada):** el editor visual puede cambiar **todo texto que viva en `store_settings`**; la
regla no cambia (lo que no es un ajuste guardado se queda en el código: «Catálogo», «Productos destacados»,
«Contacto», «Tienda»). El **nombre** es un campo compartido por el título de arriba, el del pie y el
copyright, pero se cambia **solo desde el título de arriba** (el del pie no se marca como editable): la marca
se edita en un solo lugar.

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A57** | Que en el editor de la página se pueda cambiar también la bajada del pie («Repostería artesanal de San Javier y Talca. Pedidos programados con retiro presencial.») y que la ubicación del pie («San Javier y Talca, Chile») muestre de verdad lo guardado | **D38 ampliada + corrección:** la bajada del pie pasa a ser la columna **`footer_tagline`** (editable con un clic, con el texto de la plantilla como valor por defecto en `lib/store-config.ts`). Y la **ubicación del pie se veía vacía** —antes y después de guardar— porque el contrato del header/footer (`ShellConfig`) la declaraba como `footer_location`, mientras los ajustes de tienda (`StoreConfig`) la llevan como **`footerLocation`**: el pie recibía `undefined` y dibujaba la línea en blanco. Se alinea el nombre del campo, así el pie muestra y guarda el valor; **no hay migración de datos** (la columna de la API sigue igual). El contrato del header/footer (`ShellConfig`) pasa a **derivarse de `StoreConfig`** con `Pick`, así que un campo que exista de un solo lado ya no compila y el desajuste no puede repetirse. |

**Fix del pie (A57):** la ubicación del pie tenía **dos nombres** para el mismo dato —`footer_location` en
`ShellConfig` y `footerLocation` en `StoreConfig`—, así que `StoreFooter` siempre recibía `undefined` y esa
línea salía vacía, con o sin cambios guardados. Ahora ambos usan `footerLocation`.

**Al desplegar:** **reconstruir la imagen de la API** (hay `ALTER TABLE`/`DROP TABLE` e **índices** al arrancar;
ver §1). El
`DROP TABLE IF EXISTS closed_weekdays` deja de cerrar los días que estuvieran marcados semanalmente: los que
deban seguir cerrados se ajustan en los **días de cada franja** desde Agenda.

### 3.4 Rendimiento: lecturas compartidas y consultas (2026-09-29)

**Implementado y verificado** (`pytest` 61/61; `tsc`, `lint` y `build` sin errores). Sale del análisis de
las llamadas a la API pedido el mismo día; hay tres decisiones nuevas (**D41**, **D42** y **D43**).

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A58** | Evitar llamadas repetidas a la API y sumar un hook para el catálogo | **D41:** `lib/resource.ts` comparte la lectura **en vuelo** por clave (una sola petición aunque la pidan varios componentes) y se suman `useCatalog` (`lib/use-catalog.ts`), `useAgenda` (`lib/use-agenda.ts`) y `loadSettings` (`lib/use-store-settings.ts`). La **ficha** toma el producto del catálogo compartido en vez de repetir `/api/products`, `/api/categories` y el endpoint por slug, y pide **solo los comentarios de su producto** (`?product_id=`, antes traía todos y filtraba en el cliente). El **checkout** y la **Agenda** del panel (y el modal de pedido) comparten una única lectura de la agenda, y `/admin/editor` hace **una** petición a `/api/settings` en lugar de dos. |
| **A59** | Que las lecturas no paguen un viaje extra | `apiFetch` manda `Content-Type: application/json` **solo cuando hay cuerpo**: en los GET sin cuerpo esa cabecera no aporta nada y, al estar la API en otro origen, obligaba al navegador a un **preflight OPTIONS** en cada lectura. |
| **A60** | Menos trabajo por consulta en la API | `create_order` valida los productos del pedido en **una** consulta (antes un `db.get` por ítem), `delete_category` anula la categoría de sus productos con un **solo `UPDATE`** y `PATCH /api/orders/{id}/status` devuelve el pedido por `order_out`, así que la respuesta trae la **franja** y el **punto de retiro** resueltos (antes volvían en `null`). Se suman dos pruebas: el `PATCH` con sus etiquetas y el rechazo de un pedido con un producto inexistente. |
| **A61** | Que las consultas no recorran la tabla completa | **Índices** de las columnas por las que más se consulta, creados al arrancar con `CREATE INDEX IF NOT EXISTS` (idempotente, igual que los `ALTER TABLE`): `order_items.order_id` (los listados de pedidos cargan sus ítems con `selectinload` y era la tabla que más crecía), `reviews (product_id, status, created_at DESC)` (los comentarios de una ficha) más `reviews (status, created_at DESC)` (moderación y listado sin producto) y `orders (created_at DESC)` (todos los listados ordenan por esa fecha). PostgreSQL solo indexa la PRIMARY KEY y los `UNIQUE`: declarar una `ForeignKey` en SQLAlchemy **no** crea índice en la columna hija. Una prueba verifica que las sentencias sean válidas e idempotentes. |
| **A62** | Que Reportes no obligue a bajar todo el historial de pedidos | **Nuevo `GET /api/reports`** (solo admin) que agrega el período **en la API**: totales (pedidos, pedidos que vendieron, unidades e ingresos), pendientes de retirar, el tramo anterior de igual largo para comparar, ranking por producto, ventas por punto de retiro y pedidos por día y franja, más `oldest_order_at` para el selector de meses. La sección **Reportes** y la tarjeta **«Ventas del último mes»** de Inicio lo leen con `lib/use-reports.ts` (lectura compartida por clave, **sin** respaldo offline: un reporte viejo no sirve para decidir) y el cálculo local desaparece de `components/admin-reports.tsx`, que se queda con la presentación y con lo que aporta el catálogo (categoría de cada producto vendido, los sin ventas y la reposición). Al cambiar un pedido, Inicio vuelve a pedir los reportes para no mostrar ventas viejas. Se suma una prueba con tres pedidos del período, uno cancelado y uno del tramo anterior. |

**Decisión D41 (nueva):** las lecturas de la API que **más de una pantalla** necesita —catálogo, ajustes
de tienda y agenda— viven en una **lectura compartida por clave** (`lib/resource.ts`), con `useCatalog`,
`useAgenda` y `loadSettings` como única puerta de entrada. La lectura en vuelo se comparte (una petición,
no dos) y **no se cancela** al desmontar un consumidor, porque otros pueden estar esperándola; el respaldo
de la última versión conocida (D20) se mantiene donde corresponde y se **desactiva expresamente** en la
agenda, que no debe operar con datos viejos (checkout y panel).

| **A63** | Que la tabla de Pedidos no baje todo el historial en el día a día | **Alcance por defecto en `/api/orders`:** el panel pide solo los pedidos **abiertos** (`pending`/`shipped`), que son los que se gestionan y nunca se vuelven cientos; el historial (`delivered`/`cancelled`/`refunded`) entra con `?include_closed=true`, que es lo que dispara el filtro de la tabla al elegir **«Todos los estados»**, **«Entregado»** o **«Cancelado»** (y «Limpiar filtros» vuelve a «Pedidos activos», o sea a la carga liviana). Un pedido que se cierra con la lista en modo activos **sale** de la tabla, porque ya no pertenece a esa vista. La tabla **«Pedidos recientes» de Inicio** usa esa misma lista, así que muestra lo que queda por gestionar. **No hay paginación**: con este corte el listado deja de crecer. Prueba nueva del default y de `include_closed=true`. |

### 3.5 Envíos a domicilio y moderación de comentarios (2026-09-30)

**Implementado y verificado** (`pytest` 62/62; `tsc`, `lint` y `build` sin errores). Dos puntos del dueño
con dos decisiones nuevas (**D44** y **D45**).

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A64** | Agregar **envíos** a la Agenda: (a) la zona se elige de forma **local** por país > región > ciudad, (b) puede haber **varias zonas**, cada una con su **tarifa**, (c) si no hay ninguna zona activa **no se menciona en el carrito** y (d) se puede fijar un **límite de cobro** desde el cual el envío es gratis | **D44:** nueva tabla `delivery_zones` (país/región/ciudad + `fee` + `free_threshold` + `active`) con CRUD en `/api/delivery-zones`; la Agenda del panel suma la sección **Envíos** con un modal que usa la cascada región > comuna (`lib/chile.ts`, 16 regiones y 346 comunas). En el **checkout** el cliente elige retiro o **envío**, deja su **dirección** —precargada desde Mi cuenta— y la API **recalcula la tarifa** con la zona que cubre su comuna (gratis sobre el umbral, rechaza la comuna sin cobertura); el **carrito** solo menciona el envío si hay zonas activas. |
| **A65** | En **Comentarios** mostrar solo los pendientes; al aceptarlos o rechazarlos dejan de aparecer ahí y quedan en la tienda, donde un admin puede borrarlos con la papelera | **D45:** `GET /api/reviews/admin` devuelve solo `pending`; **rechazar borra** el comentario (`PATCH …/status` con `rejected`) y aprobar lo publica en la ficha. En la ficha, si quien mira tiene rol admin, cada comentario publicado muestra la **papelera** (`DELETE /api/reviews/{id}`). |

**Decisión D44 (nueva):** el **envío a domicilio** entra como método de entrega **aparte del retiro
presencial** (D16/D33). Cada zona cubre una **comuna** de forma **local** (país > región > ciudad, solo
Chile) con tarifa y **límite de cobro** propios (por zona); el checkout resuelve la tarifa con la
**dirección** del cliente y el `total` del pedido la incluye. Sin ninguna zona activa, la tienda **no
menciona el envío**: ni el carrito ni el checkout lo ofrecen.

**Decisión D45 (nueva):** la moderación de comentarios trabaja **solo con los pendientes**: aprobar
publica y **rechazar borra**. Los publicados viven en la ficha del producto y el admin los puede borrar
desde ahí (papelera), sin volver a la sección Comentarios.

### 3.6 Hero con foto de fondo (2026-10-01)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores). Un punto del dueño con una decisión
nueva (**D46**):

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A66** | En la sección justo debajo del header, que una foto ocupe **todo el espacio** de la sección, con un fondo `bg-linear-to-r` del color de la página para que la foto se mimetice, el texto del lado izquierdo y la foto de fondo mostrando **solo su lado derecho**; y quitar la caja «Destacado · Colección destacada» | **D46:** el hero deja de ser una grilla de dos columnas con un visual de relleno y pasa a una **sección de ancho completo** (`relative`) con la foto `public/hero-bosque.png` en **absoluto cubriendo todo** (`inset-0 h-full w-full object-cover object-right`, así se ve el costado derecho) y, encima, un **degradado hacia la derecha del color de la página** (`bg-linear-to-r` con `from-[var(--cream)] to-transparent`) que la funde con el fondo y deja el texto a la izquierda sobre un bloque liso. La **caja «Destacado · Colección destacada»** se retira y, con ella, el campo `featuredCollection` de `StoreConfig` y el CSS `.theme-bosque .hero-visual` (ya no se usa). El texto sigue dentro de `max-w-7xl` —alineado con el resto de la página— para que sus ediciones del editor visual (D38) no cambien de lugar. |

**Decisión D46 (nueva):** el **hero** lleva una **foto de fondo a todo el ancho** con un **degradado lateral
del color de la página** en lugar del visual de relleno: la imagen cubre la sección completa, el degradado
la mimetiza con el fondo y el texto queda a la izquierda, así que de la foto solo se ve el costado derecho.
La foto quedó como **asset estático** de la plantilla (`public/hero-bosque.png`); **D47** (§3.7) la vuelve
un ajuste y **D48** (§3.8) la hace editable desde el editor de la página, que sigue siendo el valor por
defecto. Se retiran `featuredCollection` de `lib/store-config.ts` y el `background` de
`.theme-bosque .hero-visual` en `app/globals.css`.

### 3.7 Foto del hero editable (2026-10-01)

**Implementado y verificado** (`pytest` 63/63; `tsc`, `lint` y `build` sin errores). Un punto del dueño con
una decisión nueva (**D47**) que amplía **D46**:

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A67** | Poder **cambiar la foto del hero** | **D47:** la foto deja de ser solo el asset de la plantilla y pasa a ser el ajuste **`hero_image`** de `store_settings` (columna `VARCHAR(500)`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar). Guarda la **URL** que devuelve `/api/upload` —la misma que usan las fotos de producto— o una externa; la tienda dibuja `config.heroImage` y, **sin valor guardado**, cae a `public/hero-bosque.png`, así que una tienda sin la foto cargada se ve igual que antes. **Desde dónde se cambia** lo define **D48** (§3.8). |

**Decisión D47 (nueva):** la **foto del hero** vive en `store_settings.hero_image`; es una columna propia
(no un JSON) y la API la valida como texto de hasta 500 caracteres. Guarda la **URL** que devuelve
`/api/upload` —igual que las fotos de producto— o una externa, y **sin valor** la tienda usa la foto de la
plantilla (`public/hero-bosque.png`), así que una tienda sin la foto cargada se ve igual que antes. Ajusta
**D46**, que la había dejado como asset estático.

### 3.8 Foto del hero desde el editor de la página (2026-10-01)

**Implementado y verificado** (`pytest` 63/63; `tsc`, `lint` y `build` sin errores). Un punto del dueño con
una decisión nueva (**D48**) que amplía **D47**:

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A68** | Poder cambiar la foto del hero **dentro de «Editar en la página»**, pulsando un **ícono de imagen** que aparezca **encima del hero**; y sacar el bloque de Contenido | **D48:** nuevo **`EditableImage`** en `components/editable-content.tsx`, hermano de `EditableText`: fuera del editor es solo la foto y, con el editor abierto, dibuja encima un **botón redondo con un ícono de imagen** (`absolute z-50`, por encima del velo) que abre el selector de archivos, sube la foto con el mismo `uploadImage` del panel y deja la URL en el **borrador**, así que la foto nueva se ve al instante y se publica con **«Guardar cambios»**. Si hay una foto propia, al lado aparece el botón de **volver a la de la plantilla**, que vacía el ajuste. `hero_image` entra en `editableFields`, así que se guarda junto con los demás textos, y el **bloque «Foto del hero» sale de Contenido**: Contenido queda con el contacto y la paleta, como pedía D38. La barra del editor recibe un `notify` para contar que la subida terminó y su texto guía menciona el botón de la foto. |

**Decisión D48 (nueva):** la **foto del hero** se cambia **en la misma página** (`/admin/editor`) con un
botón sobre la foto, no desde un formulario de Contenido: el editor suma **`EditableImage`**, que sube el
archivo a la API y deja la URL en el borrador (se publica con «Guardar cambios», D38) y ofrece **volver a la
foto de la plantilla**. `hero_image` pasa a formar parte de `editableFields` y el bloque «Foto del hero» sale
de **Contenido**, que se queda con el contacto y la paleta. Fuera del editor nada cambia: `EditableImage` es
solo la imagen. Amplía **D47**.

### 3.9 Logo opcional en el hero (2026-10-01)

**Implementado y verificado** (`pytest` 64/64; `tsc`, `lint` y `build` sin errores). Un punto del dueño con
una decisión nueva (**D49**) que amplía **D48**:

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A69** | Poner **otra foto** en la **esquina inferior del hero**, dentro de un **círculo**, para que sea el **logo** de la tienda. **Totalmente opcional** | **D49:** nueva columna `store_settings.hero_logo` (`VARCHAR(500)`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar) y el logo entra en `EditableField`/`editableFields`, así que se sube con el **mismo botón del editor de la página** (D48) y se guarda con «Guardar cambios». En el hero se dibuja como un **círculo** (`rounded-full` con borde blanco) en la **esquina inferior derecha**, **después** del texto para quedar por encima. Sin logo **no se dibuja nada**: en la tienda la esquina queda vacía y en el editor aparece el botón con borde punteado para subirlo, más el de **quitarlo**. `EditableImage` pasa a agrupar la imagen y sus botones en un contenedor (`containerClassName`), cambia de ícono según haya foto o no y solo dibuja el `<img>` cuando hay valor, así que un campo **opcional** vacío no deja una imagen rota. |

**Decisión D49 (nueva):** el **logo** de la tienda es un ajuste **opcional** (`store_settings.hero_logo`)
que se dibuja como un **círculo en la esquina inferior derecha del hero**; **sin valor no hay logo** y la
sección se ve igual que antes. Se edita desde el **editor de la página**, con el mismo botón que la foto
(D48) más el de quitarlo, que vacía el ajuste. Amplía **D48**: `EditableImage` sirve para las dos imágenes y
el campo admite quedar en blanco. El logo va de un **tamaño fijo** en el código (un círculo de 80 px, 96 en
pantallas medianas); para agrandarlo o correrlo de los bordes se cambian sus clases en `components/storefront.tsx`.

### 3.10 Limpieza del arranque de la API (2026-10-01)

**Implementado y verificado** (`pytest` 64/64). Un ajuste de **mantenimiento** (A70), sin decisión de
producto: el mantenimiento de la base al arrancar (`backend/app/main.py`) ejecutaba **once bucles
idénticos** —uno por cada bloque de declaraciones (`ALTER`, `DROP`, `UPDATE` e índices)—. Ahora los bloques
se concatenan en **`STARTUP_STATEMENTS`**, una sola lista **ordenada** (el orden importa: primero la columna
que apunta a una tabla que se va a eliminar), y `lifespan` la recorre con **un único bucle**. Mismo
comportamiento, unas 20 líneas menos.

### 3.11 Un solo `slugify` en el panel (2026-10-01)

**Implementado y verificado** (`tsc`, `lint` sin errores y `build`). Un ajuste de **mantenimiento** (A71),
sin decisión de producto: el panel convertía un nombre en slug (`«Plátano manjar»` → `platano-manjar`) con
**dos copias** del mismo código en `components/admin-dashboard.tsx` —la función `slugify` que usan las
categorías y la lógica reinlinada dentro de `createProduct`—. `createProduct` pasa a llamar a `slugify` y
se queda con su respaldo `|| "producto"` para un nombre sin caracteres válidos. Mismo resultado (la
función, además, recorta a 140 caracteres), una sola definición.

### 3.12 Forma del logo y encuadre de la foto del hero (2026-10-06)

**Implementado y verificado** (`pytest` 66/66; `tsc`, `lint` y `build` sin errores). Dos puntos del dueño,
los dos sobre el hero y editados desde el **editor de la página** (D38), con dos decisiones nuevas
(**D50** y **D51**) y un ajuste del mismo día (**A74**):

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A72** | Poder cambiar la **forma del logo** que se puso en el hero: redonda (la de siempre) o con forma de **flor** —ampliado el mismo día a **tres** formas, con un botón que abre una ventana de siluetas— | **D50:** nueva columna `store_settings.hero_logo_shape` (`VARCHAR(20)`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar) con tres valores, `circle` (por defecto), `soft` (**bordes difuminados**) y `flower`; la API los valida con un `Literal`, así que cualquier otro valor devuelve **422**. `hero_logo_shape` entra en `EditableField`/`editableFields` y se guarda con el mismo `PUT /api/settings` del editor. En el hero, `EditableImage` recibe `tools`: **un botón** (ícono de formas) que abre una **pequeña ventana** con las tres siluetas y su miniatura, solo **en el editor y solo si hay logo**; al elegir una el marco del logo se **redibuja al instante** en la página, queda en el borrador y la ventana se cierra (un botón invisible a pantalla completa la cierra al hacer clic afuera). La forma vive en `app/globals.css`: el círculo sigue siendo `rounded-full`, la flor es una **máscara SVG** de **veinte pétalos** (un `mask-image` con un círculo central y veinte alrededor, con el fondo blanco como marco, porque la máscara recorta también el `border`) y los bordes difuminados son un **degradado radial** que desvanece el borde. Sin logo no se dibuja nada y la tienda pública no cambia. |
| **A74** | Cambiar «volver a la foto de la plantilla» por **«quitar foto»** (el estado por defecto del hero es **sin foto**) y sacar el botón de volver al encuadre original | **Ajusta D47/D48 y D51:** el botón de la foto del hero se llama **«Quitar foto»** y **vacía el ajuste**; `hero_image` vacío ya **no** cae a `public/hero-bosque.png`, así que el hero queda **sin foto** y el asset de la plantilla deja de usarse. En `EditableImage` el `resetTo=""` sigue mostrando el botón **solo cuando hay foto**. Además se retira el botón **«Volver al encuadre original»** del hero: el encuadre se ajusta **solo arrastrando** la foto (D51). |
| **A73** | Poder **ajustar la foto del hero** —moverla con el ratón— porque puede quedar **fuera de encuadre** | **D51:** nueva columna `store_settings.hero_image_position` (`VARCHAR(20)`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar) que guarda el **`object-position`** de CSS («100% 50%» es el borde derecho, el recorte original de la plantilla); la API lo valida con una **expresión regular** de dos porcentajes 0–100 y cualquier otra cosa devuelve **422**. `EditableImage` recibe `position` (el encuadre guardado, que aplica también a la tienda pública) y `panField`: con `panField`, dentro del editor la foto se **arrastra con el mouse** (`pointerdown`/`pointermove` con captura de puntero) y el porcentaje sale del gesto —mover la foto hacia la derecha muestra más de su lado izquierdo—, redondeado y acotado a 0–100. Para que el gesto llegue a la foto, el **degradado** del hero y el **bloque de texto** quedan `pointer-events-none` mientras se edita (cada texto editable recupera sus clics con `pointer-events: auto`). |

**Decisión D50 (nueva):** el **logo del hero** (D49) tiene tres formas de marco —`circle` (la de siempre),
`soft` (**bordes difuminados**) y `flower`— guardadas en `store_settings.hero_logo_shape`; se eligen en el
**editor de la página** con **un botón que abre una ventana con las tres siluetas y su miniatura**, y se
publican con «Guardar cambios». La forma es solo el **recorte** de la imagen (un `mask-image` en
`app/globals.css`: veinte pétalos para la flor y un degradado radial para los bordes difuminados), y la **silueta de cada forma vive una sola vez** (una variable `--logo-mask` que `var()` sustituye en `-webkit-mask-image` y en `mask-image`), así que
sin logo no se dibuja nada y la tienda pública no cambia. **Amplía D49.**

**Decisión D51 (nueva):** el **encuadre de la foto del hero** es un ajuste propio,
`store_settings.hero_image_position`, que guarda el **`object-position`** de CSS; el editor lo cambia
**arrastrando la foto** con el mouse (o el dedo). El valor vale para la tienda y para el editor y, **sin
valor guardado**, rige el recorte original («100% 50%», el borde derecho). **Amplía D47/D48.**

**Ajuste del mismo día (A74):** el hero **sin foto guardada queda sin foto**: `hero_image` vacío ya no cae
al asset de la plantilla (`public/hero-bosque.png` deja de usarse) y el botón de la foto pasa de «volver a
la de la plantilla» a **«Quitar foto»**. También sale el botón de **volver al encuadre original**: el
encuadre se mueve **solo arrastrando**. Ajusta **D47/D48** y **D51**.

---

### 3.13 Carrito: el ítem huérfano se limpia solo (2026-10-06)

**Implementado y verificado** (`tsc`, `lint` y `build` sin errores; la limpieza se probó aparte con un arnés
que simula `localStorage`, porque el carrito no tiene pruebas automatizadas en el repo). Un punto del dueño:
se le quedó en el carrito un ítem que **no podía ver ni eliminar**.

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A75** | El carrito quedó con un **ítem borrado** —un producto que ya no existe— que **no se podía mostrar ni eliminar**, y que además sumaba al contador del header | **D52:** nuevo **`pruneCart(validIds)`** en `lib/cart.ts`, que descarta del carrito los ids que no están en el catálogo **real** y lo persiste **una sola vez** (idempotente: sin nada que sacar no escribe). Lo llama la **puerta única del catálogo** (`lib/use-catalog.ts`) en cuanto llega la lectura compartida: `useCatalog` (tienda y checkout) y `loadCatalog` (la **ficha**, que entra directo sin pasar por la tienda), así que el ítem huérfano se limpia en cualquier pantalla que conozca el catálogo —la API **o la última versión conocida del respaldo** si no respondió—, que es la única señal de que esa lista es la de la tienda; **sin datos** (primera visita con la API caída) no se toca nada, porque ahí manda la lista **demo** de la plantilla y borraría ítems válidos. Una tienda **sin productos activos** deja la vitrina como está pero vacía el carrito: todos sus ítems son de productos que ya no existen. El **carrito lateral** deja de contar «productos que faltan» (`missing`) y muestra un solo aviso mientras el catálogo no carga. |

**Decisión D52 (nueva):** el carrito solo puede tener **productos que existen**. Cuando una pantalla conoce su
catálogo real (`useCatalog` / `loadCatalog`), los ids que ya no están —un producto **eliminado** o pasado a **inactivo**—
se **borran del carrito** (`pruneCart`), porque el carrito solo dibuja lo que resuelve del catálogo: un id
huérfano no se ve *y tampoco tiene botón para sacarlo*, y encima sumaba al contador del header. La limpieza
es **idempotente**, no escribe si no hay nada que sacar y **no se aplica con la lista demo** ni cuando la
API no respondió y no hay respaldo. Amplía **D20/D41**.

**Ajuste de paso (limpieza de código nuevo):** la lista de formas del logo y sus nombres viven en
`lib/store-config.ts` (`logoShapes` + `logoShapeLabels`, un `Record` de todas las formas, así que sumar una
nueva obliga a darle su nombre) y el selector del editor las usa en vez de repetirlas; `EditableImage`
declara el `<img>` **una sola vez** con las manijas del arrastre en un objeto (`panProps`, vacío fuera del
editor) en lugar de dos ramas con los mismos atributos repetidos; la **ficha de producto** pide el catálogo
por esa misma puerta (`loadCatalog`) en vez de llamar a la lectura compartida por su cuenta, así comparte
la regla de limpieza del carrito (D52) en lugar de repetirla. La **silueta de cada forma del logo** queda
también en un solo lugar: una variable (`--logo-mask`) que `var()` sustituye en `-webkit-mask-image` y en
`mask-image`, así que el SVG de veinte pétalos ya no está **dos veces** en `app/globals.css` ni hay que
acordarse de cambiar las dos (olvidar una dejaba la flor sin recorte en el navegador de la propiedad
perdida). De paso baja de **7 a 6** los avisos de `<img>` de `lint`.

---

## 3.14 Sección de historia con foto: «about us» (2026-10-06)

**Implementado y verificado** (`pytest` 67/67; `tsc`, `lint` y `build` sin errores; contra la API en vivo los
dos ajustes nuevos se guardan, vuelven por el `GET` y un lado inválido responde `422`). Un punto del dueño:
la sección de historia —«Una plantilla que crece contigo · Haz que tu marca se sienta única.»— tiene que
poder llevar **una foto** para funcionar como un «about us».

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A76** | Poder **agregar una foto** a la sección de historia, **encuadrada**, para que la sección funcione como un «about us»; **sin foto** el texto sigue **centrado** como ahora y, **con foto**, la sección se reparte en **dos mitades** con la foto a la **izquierda** | **D53:** nueva columna `store_settings.story_image` (`VARCHAR(500)`: la URL de `/api/upload` o una externa), agregada con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar. En la tienda la sección se parte en **dos mitades iguales** (`md:grid-cols-2`, **sin** separación entre ellas: cada mitad se queda con la mitad del ancho y el alto completo de la sección), la **izquierda** con la **foto** y la **derecha** con los **textos**. El encuadre es un bloque del **detalle cálido** de la paleta (`bg-[var(--brand-detail)]`, distinto del color base de la sección, que no cambia) y la foto va adentro como una **copia más pequeña y centrada del propio bloque** (un margen parejo, `inset-8` / `md:inset-14`), **sin** esquinas redondeadas ni borde: el bloque hace de marco; **sin foto** queda el texto **centrado** de siempre. Los tres textos se declaran **una sola vez** y se reusan en las dos formas de la sección. En el **editor de la página** la foto se sube con el mismo `EditableImage` del hero —y se quita con «Quitar foto», que vacía el ajuste—, todo viaja en el `PUT /api/settings` de siempre. Los botones —el de **agregar/cambiar la foto** y los demás— van con `relative z-50`, **por encima del velo** del editor, así no quedan debajo de la capa oscurecida y se ven igual que los del hero. |

**Decisión D53 (nueva):** la **historia** de la tienda es un «about us» **opcional**: con `story_image` la
sección se dibuja en **dos mitades** —la foto encuadrada a la **izquierda** y el texto a la derecha—, y
**sin** foto queda el **texto centrado**, así que una tienda sin foto se ve igual que antes. Amplía **D38/D48** (los textos y las fotos que edita el editor visual).

**Ajuste del mismo día (A76):** la foto pasó a ser una **copia más pequeña y centrada del bloque** que la
contiene (antes era un rectángulo propio —`aspect-[4/5]`— que no coincidía con la forma del bloque); la
**sección de historia se movió arriba de «Beneficios»** (se intercambiaron, así la historia queda pegada al
catálogo); y se **retiró el ajuste de lado**: la foto va siempre a la **izquierda**, así que se fueron el
botón con las dos miniaturas, `story_image_side` del frontend y de la API, y la columna —que se **elimina al
arrancar** desde `RETIRED_STORE_SETTINGS_COLUMNS`, para que una base ya creada quede igual que una nueva—.
La foto que ya estuviera cargada no se toca: queda del lado izquierdo, que era justamente el valor por
defecto.

**Trampa real que salió al verificar (y su arreglo):** en un `className` con plantilla, una clase **pegada**
al `${…}` condicional **no se genera**: Tailwind no la reconoce como candidata y la clase **no aparece en el
CSS**, así el estilo se pierde en silencio. Se detectó revisando el CSS emitido —faltaba el `padding` de
escritorio de la mitad de la foto—, se separó con un espacio y se corrigió el mismo patrón en el hero
(`md:px-10 ${…}`), que se salvaba solo porque esa clase se usa también sin plantilla.

---

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
4. **Desplegar en AWS** (§1): reconstruir la imagen de la API y cargar las variables de entorno.

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

