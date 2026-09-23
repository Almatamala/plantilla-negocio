# Plan de Implementación — BOSQUE

**Basado en:** RPD.md v1.2
**Fecha:** 2026-09-08 · **Actualizado:** 2026-09-21 (ajustes del dueño: ver §0.6, §0.7, §0.8, §0.9, §0.10, §0.11 y §9)
**Estado:** Propuesta para aprobación del dueño

---

## 0. Cómo usar este plan

- El plan está ordenado en **fases y tareas con ID** (`F0.1`, `F1.1`, …). Cada tarea indica: objetivo,
  archivos principales, pasos, dependencias, decisiones bloqueantes (referidas a las D1–D12 del RPD),
  criterio de aceptación y estimación.
- **Defaults recomendados** para las decisiones abiertas del RPD (aprobables por el dueño, ajustables):

| Decisión | Default recomendado |
|---|---|
| D1 Ficha de producto | Página propia `/producto/[slug]` (mejor SEO y escalable) |
| D2 Alérgenos | Por producto: array de códigos (`gluten`, `lacteos`, `frutos-secos`, `huevo`, …) + íconos |
| D3 Regla de stock | Híbrido: estado manual + auto `sold_out` cuando `inventory = 0` (salvo `allow_backorder`) |
| D4 "Bajo pedido" | `allow_backorder` sin días de anticipación (ver §0.4) |
| D5 Slots horarios | **RESUELTA (D18, §0.8):** franjas fijas configurables, **colgando de cada punto de retiro**, y cada una declara los **días de la semana** en que atiende |
| D6 Puntos de retiro | **RESUELTA (D16, §0.7):** no hay despacho a domicilio. Retiro presencial y puntos de encuentro (San Javier / Talca), cada uno con **ubicación y horario**; el cliente elige cuál y cuándo, en un plazo de **2 semanas**; sin tarifa por ahora |
| D7 Fuente de verdad | **RESUELTA: API FastAPI dockerizada en AWS como única fuente de verdad** (ver actualización abajo) |
| D8 Orden de pagos | Transferencia primero (confirmación manual); Webpay en fase posterior |
| D9 WhatsApp | v1: enlace `wa.me` (botón flotante); notificación automática se evalúa aparte |
| D10 Comentarios | Anónimos, con moderación del admin antes de publicar |
| D11 Instagram | **RESUELTA (§0.11, D23):** sección al final de la página principal con el **iframe de un widget de terceros** (solo publicaciones, ancho completo) configurable desde el panel; el footer conserva su enlace |
| D12 Panel móvil | Drawer de navegación en el admin para pantallas pequeñas |

- ⚠️ **Regla del proyecto (AGENTS.md):** antes de escribir cualquier código, el implementador debe leer
  la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js tiene breaking
  changes respecto a lo conocido).
- Cada fase termina con un **gate**: verificación (typecheck, lint, build) + revisión del dueño antes de
  seguir.

---

## 0.1 Actualización — Migración a API dockerizada (AWS), fuera Supabase

D7 quedó resuelta a favor de la **API FastAPI dockerizada en AWS** como única fuente de verdad.
Consecuencias sobre este plan:

- **F0.3 cambia:** ya no es una migración SQL de Supabase; el schema vive en `backend/app/models.py`
  (SQLAlchemy) y las tablas se crean al arrancar la API. El trabajo equivalente (nuevas columnas y
  tablas de productos, agenda, zonas, reviews, órdenes y settings) ya se implementó en el backend y se
  valida con `pytest`.
- El frontend usa `lib/api.ts` (cliente HTTP) en lugar de Supabase; el login usa `API_ADMIN_TOKEN`.
- Las imágenes se suben a `POST /api/upload` (volumen persistente en AWS) en lugar de Storage.
- El decremento de stock y la auto-desactivación se hacen server-side en `POST /api/orders`.
- La implementación completa (F0–F3) ya está realizada y refactorizada a esta arquitectura; después se
  implementó el **login de usuarios** (correo/contraseña + Google, roles cliente/admin, sesión server-side,
  página de cuenta) — ver §0.3. Los únicos pendientes son externos: credenciales TBK para Webpay, webhook
  de WhatsApp, seed de agenda/zonas y las credenciales `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

---

## 0.2 Protección del panel de administración (seguridad)

**Requisito (aprobado por el dueño):** un usuario normal no debe poder acceder al panel de admin, ni
siquiera llegar a la página de verificación (`/login`). El admin debe poder entrar desde **celular,
tablet y PC** (IPs dinámicas → descarta allowlists de IP como método principal).

**Riesgos del estado actual:**

1. `/admin` renderiza el panel sin ningún chequeo: cualquiera ve la interfaz (las mutaciones fallan sin
token, pero ya está “dentro”).
2. El token `API_ADMIN_TOKEN` vive en `localStorage` del navegador: visible y robable con devtools;
quien lo tenga puede mutar vía curl directo a la API.

**Opciones evaluadas:**

| # | Opción | Compatible multi-dispositivo | Nivel |
|---|---|---|---|
| 1 | Gate client-side (chequear token antes de renderizar y redirigir) | ✅ | Débil — solo disuade, se salta con devtools |
| 2 | **Sesión server-side + `proxy.ts`** (elegida) | ✅✅ | Fuerte a nivel de app |
| 3 | Ocultar rutas (URL secreta + sin enlaces) | ✅ | Complemento — seguridad por oscuridad |
| 4 | Capa de red: AWS WAF/ALB con HTTP Basic Auth sobre `/admin*` y `/login*` | ✅ (Basic Auth, no IPs) | Muy fuerte a nivel de red |
| 5 | Allowlist de IPs (WAF) | ❌ — IPs móviles cambian | Fuerte pero inviable como método principal |

**Decisión (D13, aprobada):** **sesión server-side + `proxy.ts`** como protección principal a nivel de
app. La capa de red (opción 4) queda documentada como refuerzo futuro opcional.

### Tareas de implementación

**T1 — Sesión y login server-side (token nunca en el navegador)**
- Route Handler `app/api/auth/login/route.ts`: recibe la clave, la valida contra la API (FastAPI) desde
  el servidor y, si es correcta, establece una **cookie de sesión httpOnly, Secure y SameSite=Strict**
  (sesión con ID aleatorio; sin secretos en el cliente).
- `app/login/page.tsx` deja de guardar el token en `localStorage`; solo llama al Route Handler.
- `app/api/auth/logout/route.ts` para cerrar sesión (borrar cookie).

**T2 — Gate en `proxy.ts` (Next 16)**
- Crear `proxy.ts` en la raíz (equivalente del antiguo middleware; ver guía en
  `node_modules/next/dist/docs/`): si la ruta es `/admin` o `/login` y **no** hay cookie de sesión
  válida → redirigir a la tienda (o 404). El usuario normal ni llega a la verificación.

**T3 — Llamadas admin sin exponer el token**
- Route Handlers `app/api/admin/*` (proxy BFF): reciben la petición del panel, inyectan
  `API_ADMIN_TOKEN` desde el entorno del servidor y llaman a la API; el navegador nunca conoce el token.
- `lib/api.ts` usa estos endpoints para mutaciones admin (sin header `X-Admin-Token` en el cliente).

**T4 — Ocultar rutas públicas**
- Quitar enlaces a `/admin` y `/login` del storefront (footer y header).

**Criterio de aceptación:** sin cookie de sesión, `/admin` y `/login` redirigen a la tienda; el token
admin no aparece en `localStorage` ni en el código que llega al navegador; el panel funciona en
celular, tablet y PC.

**Refuerzo futuro (opcional):** agregar HTTP Basic Auth en AWS WAL/ALB sobre `/admin*` y `/login*` como
capa de red (paso a paso pendiente de documentar).

### Estado: IMPLEMENTADO (2026-09-10)

El método de login cambió: en lugar de la clave `API_ADMIN_TOKEN`, la autenticación es por
**correo/contraseña + Google OAuth** (ver §0.3). T1–T4 quedaron cubiertos:

- **T1 (sesión server-side):** la sesión es un JWT firmado por la API y guardado en **cookie httpOnly,
  SameSite=Strict, Secure** vía route handlers `app/api/auth/*`; el token nunca vive en `localStorage`.
- **T2 (proxy.ts):** `proxy.ts` en la raíz redirige a la tienda a quien no tenga sesión `role=admin`
  intentando entrar a `/admin`, y a los logueados fuera de `/login`.
- **T3 (llamadas admin):** las mutaciones del panel envían el JWT de sesión como `Authorization: Bearer`
  (obtenido por `/api/auth/me`); la API lo acepta cuando `role=admin`. `X-Admin-Token` queda solo como
  respaldo para acceso directo a la API.
- **T4 (ocultar rutas):** se quitaron los enlaces públicos a `/admin` del footer y de la sección historia.

El refuerzo de red (WAF/ALB Basic Auth) sigue pendiente como opcional.

---

## 0.3 Actualización — Login de usuarios (clientes y admins), sesión y roles

**Implementado (2026-09-10) y probado:** `pytest` 28/28, `tsc`/lint/build OK, API dockerizada local
verificada de punta a punta.

- **Backend (FastAPI):** registro y login por **correo/contraseña** (`bcrypt`) y **Google OAuth2** con
  `authlib` (flujo Authorization Code). Ambos emiten un **JWT de sesión** (HS256, 30 días, firmado con
  `AUTH_JWT_SECRET`). Endpoints: `POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/google/authorize`, `GET /api/auth/google/callback`, `GET|PATCH /api/auth/me`,
  `GET /api/orders/me`. El rol vive en `profiles.role` (`customer` por defecto; `admin` si el correo
  está en `ADMIN_EMAILS`). Las órdenes se vinculan al perfil (`customer_id`) cuando `customer_email`
  coincide, sin obligar al cliente a loguearse.
- **Frontend (Next.js):** `proxy.ts` protege `/admin` por rol y `/login`; sesión en cookie httpOnly
  (route handlers `app/api/auth/*`); página **`/cuenta`** con datos, **teléfono por defecto** (precargado
  en el checkout), historial de pedidos y cierre de sesión; `/login` con correo/contraseña (+ registro)
  y botón de Google debajo; el storefront refleja la sesión en header/footer.
- **Env vars nuevas:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `ADMIN_EMAILS` (default `alvaro.dario09@gmail.com`), `AUTH_JWT_SECRET` (**mismo valor en Next y API**).
- **Pendiente externo:** crear el OAuth Client en Google Cloud Console y definir `GOOGLE_CLIENT_ID`/
  `GOOGLE_CLIENT_SECRET` para activar el login de Google (hasta entonces responde 503 con aviso amigable).
  El login por correo/contraseña funciona sin credenciales de Google.

---

## 0.4 Actualización — Ajustes de alcance (repostería)

**Aplicado al código y a la documentación (2026-09-11).** La tienda es una **repostería**, así que se
recortó lo que no aplica al rubro y se simplificó el panel:

- **Alérgenos:** se quitaron `pescado` y `mariscos` de `lib/allergens.ts`; quedan gluten, lácteos,
  frutos secos, huevo, maní, soja y sésamo (D2 resuelta por producto, como estaba).
- **Acceso del admin:** el admin ya no usa `/cuenta`. El botón «Mi cuenta» del storefront lo lleva a
  `/admin` cuando `role=admin`, y `proxy.ts` lo redirige si intenta abrir `/cuenta`.
- **Header del panel:** ya no muestra el correo ni el estado de la API, y el botón dice «Cerrar sesión»
  (antes «Salir»).
- **Secciones eliminadas:** **Clientes** (se derivará del historial de órdenes) y **Configuración**
  (duplicaba lo que ya edita **Contenido**; el `API_ADMIN_TOKEN` dejó de ser el método de login).
- **Sellos:** se eliminaron `artisan_seal` y `sustainable` del schema de la API, del editor del admin y
  del storefront.
- **Bajo pedido (D4):** se eliminó `lead_time_days` («días de anticipación»). «Bajo pedido» depende solo
  de `allow_backorder`; el cliente ve la etiqueta sin prometer plazos por producto.
- **Pedidos en el admin:** «Nueva orden» abre un formulario real que persiste en la API
  (`POST /api/orders`): cliente, productos, entrega, agenda y pago. Un pedido mal ingresado se **edita**
  (`PUT /api/orders/{id}`) desde el botón de edición de la tabla; **no hay borrado** de pedidos. El
  selector de estado se mantiene porque es el flujo de confirmación de pago (transferencia). La edición
  no recalcula stock: si cambian las cantidades, el stock se ajusta con «Agregar stock» en Productos.

---

## 0.5 Transición a AWS — qué considerar al desplegar

Hoy la tienda corre en local (Next + API dockerizada con `docker-compose.backend.yml`). Al pasar a AWS:

1. **Reconstruir y redesplegar la imagen de la API (obligatorio).** El `Dockerfile` copia el código
   (`COPY . .`) y arranca `uvicorn` **sin `--reload`**, así que un contenedor viejo sirve código viejo.
   Mientras no se reconstruya, el panel recibe `404` al editar un pedido porque falta
   `PUT /api/orders/{id}`. En local basta `docker compose -f docker-compose.backend.yml up --build -d`;
   en AWS, subir la imagen a ECR y redesplegar (ECS/EC2).
2. **Schema sin Alembic.** Las tablas se crean al arrancar con `Base.metadata.create_all`, que **no**
   altera tablas existentes. Para retirar `products.artisan_seal`, `products.sustainable`,
   `products.lead_time_days`, `shipping_zones.areas`, `shipping_zones.schedule` y `orders.notes`, y para
   agregar `shipping_zones.location`, `time_slots.zone_id` y `time_slots.weekdays`, la API ejecuta al
   arrancar `ALTER TABLE … ADD/DROP COLUMN IF EXISTS …` **solo en PostgreSQL** (idempotente); las tablas
   nuevas (`closed_weekdays`) las crea `create_all`. El usuario de la base debe tener permiso DDL; en RDS,
   verificar que no esté restringido. En una base nueva no hace nada.
3. **Variables de entorno.** `AUTH_JWT_SECRET` debe ser **el mismo** en Next.js y en la API (si difiere,
   las sesiones dejan de validar); `CORS_ORIGINS` debe incluir el dominio de producción;
   `ADMIN_EMAILS` define quién obtiene rol `admin`; `NEXT_PUBLIC_API_URL` apunta al dominio/balanceador
   de la API.
4. **Imágenes (`/api/upload`).** Montar un volumen persistente (EFS/EBS) en `UPLOAD_DIR` o migrar a S3
   para no perder fotos al reiniciar contenedores.
5. **Health check** del target group: `/health`.

> Regla práctica: **cada cambio en `backend/` exige reconstruir la imagen** antes de probar en el
> frontend; si no, aparecerán `404`/`405` por rutas que en el código ya existen.

---

## 0.6 Actualización — Ajustes del dueño (2026-09-14)

**Estado: IMPLEMENTADO Y VERIFICADO** (detalle al final de esta sección). Puntos pedidos sobre el código
actual, con las dos decisiones nuevas que traen (**D14** y **D15**):

| # | Ajuste pedido | Análisis del código actual | Implementación |
|---|---|---|---|
| **A1** | El botón de WhatsApp debe ser **redondo y solo con el ícono** | `components/storefront.tsx` lo dibujaba con texto: `rounded-full … px-4 py-3 … <MessageCircle/>WhatsApp` | `components/whatsapp-button.tsx` (nuevo): `h-14 w-14 rounded-full grid place-items-center` + ícono oficial de WhatsApp, con `aria-label`. Se usa en la tienda, la ficha y el checkout |
| **A2** | Ir a la ficha, agregar al carrito y elegir **«seguir comprando» reinicia el carrito** | El carrito tenía **dos dueños** del mismo `localStorage["store-cart"]`: la ficha escribía el storage a mano y el storefront persistía su estado vacío en el primer render antes de restaurar lo guardado dentro de un `setTimeout` que el cleanup podía cancelar | `lib/cart.ts` (nuevo): carrito como store externo (`useSyncExternalStore`) con una única clave; lo usan la carta, la ficha y el checkout. Se elimina el fallback silencioso a demo en la ficha |
| **A3** | En **Productos**, botón **«Categorías»** junto a «Nuevo producto» con listar / agregar / editar / quitar | El panel ya traía la lista de categorías (solo lectura) y la API solo tenía `GET` y `POST /api/categories`. **Faltaban `PUT` y `DELETE`** | Backend: `PUT`/`DELETE /api/categories/{id}` (al borrar, los productos quedan «Sin categoría»). Panel: botón «Categorías» + modal con alta, edición en línea y borrado con confirmación |
| **A4** | Falta **confirmación por correo** al crear cuenta, con **correo personalizado y código temporal de 6 dígitos** | `POST /api/auth/register` creaba la cuenta y **devolvía sesión de inmediato**; `profiles` no tenía `email_verified` ni código, y la API no tenía proveedor de correo (Google sí exigía `email_verified`) | **D14** + `backend/app/emails.py` (Resend), columnas en `profiles` con migración automática, `POST /api/auth/verify-email` y `POST /api/auth/resend-code`, `403` al iniciar sesión sin confirmar y paso de código en `/login` | **F2.9** |
| **A5** | El botón de panel admin funciona bien, así que el **acceso a cuenta/panel del footer es innecesario: eliminarlo** | El storefront exponía la cuenta dos veces: el ícono del header y el enlace del footer (abajo a la derecha), con «Cuenta»/«Mi cuenta»/«Panel admin» | Se quita **solo el del footer**; el **botón del header se mantiene** (`components/store-shell.tsx` + `lib/account.ts`). El footer conserva Instagram | **F2.10** |
| **A6** | Usar **https://simplysweet.cl** como referencia: la ficha **ya no tiene «Volver a la tienda»** y mantiene **header y footer**; el **checkout mantiene la misma estructura** conservando los datos que se piden hoy; dejar la referencia en el plan | La ficha era un `<main>` propio (sin header/footer) con enlace «Volver a la tienda»; el checkout era una página suelta con los mismos campos del negocio. **La referencia es una tienda Shopify**, así que su checkout es el **estándar de Shopify** (header mínimo con el logo, formulario en columna izquierda, resumen fijo al costado, secciones separadas por líneas finas) | **D15** y **§9**. Ficha: `components/store-shell.tsx` + `components/cart-drawer.tsx`. Checkout: `components/checkout-shell.tsx` (header/footer mínimos) y `app/checkout/page.tsx` reestructurado como la referencia, **con los mismos campos** y resumen plegable en móvil | **F1.9 / F2.1** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D14** | Confirmación de cuenta | **Confirmación por correo obligatoria** con **código temporal de 6 dígitos** (vence a los 15 min; máx. 3 reenvíos, espera de 60 s entre envíos y 5 intentos por código). El código se guarda **hasheado**. Las cuentas de **Google entran confirmadas** y las ya existentes también (migración). Proveedor: **Resend** | Schema `profiles`, endpoints de auth, `/login`, `.env` |
| **D15** | Referencia de diseño | **https://simplysweet.cl** como referencia de estructura/UX para **ficha de producto** (header/footer, sin «Volver a la tienda»), **checkout** (misma estructura, mismos campos) y —desde §0.11— su apartado de **productos destacados** en el catálogo de la página principal. **https://www.studiopasacademy.com** es la referencia de la sección de **Instagram**. No se copia contenido ni marca | Ficha de producto, checkout, catálogo |

### Proveedor de correo para D14

- **Recomendado: Resend** (`RESEND_API_KEY`, `RESEND_EMAIL_FROM`; se envía desde la API con `requests`,
  sin SDK extra). Sin dominio verificado solo se puede enviar desde `onboarding@resend.dev` (pruebas).
- Alternativa si más adelante se quieren notificaciones multicanal (WhatsApp/SMS/push): Knock.
- **Pendiente externo del dueño:** crear la cuenta y **verificar el dominio** del negocio en Resend.
  Mientras no existan esas credenciales, la confirmación por correo queda **desactivada** y las cuentas
  nuevas entran activas, para no dejar la tienda sin acceso.

### Estado: IMPLEMENTADO (2026-09-14)

Verificado con `pytest` (36/36), `npx tsc --noEmit`, `npm run lint`, `npm run build` y una prueba de humo
sobre la API real (registro con confirmación activa, login bloqueado sin confirmar, CRUD de categorías).

- **A1:** `components/whatsapp-button.tsx` (redondo, solo ícono; tienda, ficha y checkout).
- **A2:** `lib/cart.ts` + `components/cart-drawer.tsx`; la ficha ya no escribe `localStorage` a mano.
- **A3:** `PUT`/`DELETE /api/categories/{id}` + botón y modal «Categorías» en Productos.
- **A4:** `backend/app/emails.py`, columnas `profiles.email_verified` / `verification_*` con `ALTER TABLE`
  idempotente al arrancar, `verify-email` / `resend-code`, `403` en el login sin confirmar y el paso del
  código en `/login` (route handlers `app/api/auth/verify` y `.../resend`).
- **A5:** footer sin enlaces de cuenta/panel; el botón del header sigue resolviendo `/admin`,
  `/cuenta` o `/login` según la sesión (`lib/account.ts`).
- **A6:** `components/store-shell.tsx` extrae `StoreHeader`/`StoreFooter` (carta y ficha) y la ficha ya no
  muestra «Volver a la tienda» (tampoco en el estado «no encontrado»). El **checkout** pasa a
  `components/checkout-shell.tsx` + `app/checkout/page.tsx`: header mínimo con el logo, dos columnas con
  **resumen del pedido fijo** (plegable en móvil), secciones con etiquetas por campo, opciones tipo radio
  para entrega y pago, footer de contacto y pantalla de confirmación con el resumen — **mismos datos**
  (nombre, teléfono, correo, dirección, notas, día, franja, zona y pago).

**Pendientes de esta tanda:**

1. **Credenciales de Resend** (cuenta + dominio verificado) para activar la confirmación por correo.
2. **Revisión visual contra simplysweet.cl:** ya se aplicó la estructura de su checkout (Shopify: header
   mínimo, resumen fijo al costado, secciones con líneas finas y radios, footer de contacto). El contenido
   del sitio renderiza en el cliente y no se puede extraer automáticamente, así que conviene abrirlo en el
   navegador (móvil y escritorio) y anotar en **§9** los ajustes finos que falten.
3. El header conserva el texto «· Plantilla demo» del anuncio (no era parte de los ajustes): conviene
   quitarlo al personalizar la tienda.

---

## 0.7 Actualización — Ajustes del dueño (2026-09-15)

**Estado: IMPLEMENTADO Y VERIFICADO** (`pytest` 36/36, `tsc`, `lint`, `build`). Tres puntos sobre el código
actual, con las dos decisiones nuevas que traen (**D16** y **D17**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A7** | El **envío a domicilio no existe** (no es un servicio del negocio). Lo que sí hay es **retiro presencial** y **puntos de encuentro** en Talca y San Javier, cada uno **definido por ubicación y horario**; el cliente elige **cuál** y **cuándo** ir a buscarlo, dentro de un plazo de **2 semanas** | `shipping_zones` tenía `type` (`retiro` \| `domicilio`) y `areas[]` (cobertura); el checkout obligaba a elegir primero *Retiro presencial* o *A domicilio*, pedía **dirección** en el caso domicilio y **no mostraba** ubicación ni horario del punto. La ventana de días ya era de 14 días | **D16.** Schema: `type` pasa a `retiro` \| `encuentro`, `areas` se retira y entran **`location`** y **`schedule`**. El checkout queda con **una sola lista de puntos** (tipo + ubicación + horario); la dirección desaparece y `fulfillment` se deriva del punto elegido. La ventana de 2 semanas se hace explícita | **F1.8 / F2.1** |
| **A8** | **Eliminar la «5 · Nota del pedido»** del checkout: no se piensa usar a futuro | El checkout pedía una nota libre y la guardaba en `orders.notes`; el admin la mostraba y editaba en el formulario de pedidos | **D17.** Se elimina la sección 5 (quedan Contacto, Retiro, Fecha y horario, Pago); la nota sale del payload, del formulario del admin y del schema (`OrderIn`/`OrderOut`), y la columna `orders.notes` se retira con la migración idempotente | **F2.1** |
| **A9** | En **celular** el checkout se desborda: inputs, botones y el selector de días se salen del cuadro y la página gana scroll horizontal (en tablet se ve bien) | Las columnas del formulario son ítems de grid con `min-width: auto`; la fila de 14 días, que se desplaza con `overflow-x-auto`, **ensancha su columna** y con ella todos los `w-full` del formulario | Se agrega `min-w-0` a la columna del formulario y a la del resumen (más `min-w-0`/`shrink-0`/`break-words` en las tarjetas de punto y `truncate` en el nombre de la tienda del header), de modo que la fila de días scrollee **dentro** de su caja | **F2.1** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D16** | Entrega | **No hay despacho a domicilio.** Solo **retiro presencial** y **puntos de encuentro** en San Javier y Talca; cada punto tiene **ubicación** y **horario**, y el cliente elige cuál y qué día/franja ir a buscarlo, con una **ventana de 2 semanas** | Schema `shipping_zones` (`location`, `schedule`, sin `areas`), checkout, Agenda del admin |
| **D17** | Nota del pedido | **Eliminada**: no se usará a futuro (sale del checkout, del admin y del schema) | Checkout, admin, columna `orders.notes` |

### Estado: IMPLEMENTADO (2026-09-15)

- **Backend:** `shipping_zones` con `location` + `schedule` (sin `areas`); `FulfillmentType = retiro | encuentro`;
  `orders.notes` retirada. Todo con migración idempotente al arrancar (PostgreSQL) y `pytest` 36/36 —
  incluye que `fulfillment: "domicilio"` responde `422`.
- **Checkout (`app/checkout/page.tsx`):** «2 · Retiro» lista todos los puntos con su tipo, ubicación y
  horario (sin dirección); «3 · Fecha y horario» anuncia la ventana de 2 semanas; se elimina la sección de
  nota; el desborde horizontal en celular se corrige con `min-w-0` en las columnas del grid.
- **Admin (`components/admin-dashboard.tsx`):** Agenda › «Puntos de retiro y encuentro» (nombre, tipo,
  ubicación, horario; activar/eliminar); Pedidos: filtro por tipo de retiro, columna «Retira en…» y el
  formulario elige el punto con `optgroup` (sin dirección ni notas).
- **Cuenta (`app/cuenta/page.tsx`):** el historial muestra «Retiro presencial» / «Punto de encuentro».

**Pendientes de esta tanda:**

1. **Seed de puntos reales:** cargar en Agenda el retiro presencial y los puntos de encuentro con su
   ubicación y horario exactos (si la API no responde, el checkout cae a datos demo de referencia).
2. **Reconstruir la imagen de la API** antes de probar en AWS: el retiro de `areas`/`notes` es un
   `ALTER TABLE` que corre al arrancar (ver §0.5).

---

## 0.8 Actualización — Agenda por punto y cierres cómodos (2026-09-15)

**Estado: IMPLEMENTADO Y VERIFICADO** (`pytest` 40/40, `tsc`, `lint`, `build`). El dueño pidió que el panel
administre los puntos «de forma didáctica y precisa»: **fusionar la franja horaria con el punto** y hacer
**más cómodos los días cerrados**. Trae **D18** y **D19**:

| # | Ajuste pedido | Análisis del código anterior | Implementación | Tareas |
|---|---|---|---|---|
| **A10** | **Fusionar la franja horaria con el punto de retiro/encuentro** | Las franjas eran **globales** (`time_slots` sin dueño) y el punto tenía su horario como **texto libre** (`shipping_zones.schedule`, de §0.7): dos fuentes de verdad y sin control real — el cliente podía pedir el sábado 11:00–13:00 en un punto que solo atiende los sábados, o ese mismo punto un miércoles | **D18.** `time_slots` pasa a colgar del punto (`zone_id`, con cascada) y gana **`weekdays`** (0 domingo … 6 sábado): cada franja declara sus días. Se retira `shipping_zones.schedule` (el horario se deriva de las franjas). El checkout pasa a **punto → día → franja**: solo ofrece los días en que ese punto atiende y, para el día elegido, sus franjas. La API valida punto/franja/día al crear el pedido | **F1.6 / F1.7 / F1.8** |
| **A11** | **Días cerrados más cómodos**: cerrar «el lunes de todas las semanas» porque es día de producción fijo | Solo existía `closed_days` (una fila por fecha): cerrar todos los lunes obligaba a cargar cada fecha a mano | **D19.** Nueva tabla **`closed_weekdays`** (día de la semana + motivo, único) junto a las fechas puntuales. En una instalación nueva **el domingo queda cerrado por defecto** (editable). El checkout deshabilita ambas cosas | **F1.7** |
| **A12** | Panel **didáctico**: administrar todo desde un solo lugar | La agenda eran tres tarjetas planas (franjas / días cerrados / puntos) sin relación visible, y un punto **no se podía editar** (solo activar o eliminar) | `components/admin-agenda.tsx` (nuevo): una **tarjeta por punto** con su ubicación y sus **franjas** (agregar, editar, habilitar, eliminar, con chips de días) y las acciones del punto (editar, activar, eliminar); debajo, **cierres semanales** como chips de Lunes a Domingo y **fechas puntuales**. `PATCH` de punto y de franja ahora son parciales | **F1.7 / F2.4** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D18** | Franjas horarias | Cada **franja pertenece a un punto de retiro** y declara los **días de la semana** en que se atiende; el punto ya no guarda un horario en texto libre. El cliente elige punto → día → franja | Schema `time_slots` (`zone_id`, `weekdays`), checkout, agenda del admin |
| **D19** | Días cerrados | **Dos formas**: **recurrentes** por día de la semana (p. ej. lunes de producción; domingo por defecto) y **fechas puntuales** (feriados, vacaciones) | Nueva tabla `closed_weekdays`, checkout, agenda del admin |

### Estado: IMPLEMENTADO (2026-09-15)

- **Backend:** `time_slots.zone_id` (FK en cascada, la franja siempre cuelga de un punto) + `time_slots.weekdays`;
  `shipping_zones.schedule` eliminada; nueva tabla `closed_weekdays` con **domingo sembrado** en
  instalación nueva. Endpoints: `GET /api/time-slots?zone_id=&include_disabled=`, `PATCH`/`DELETE` de
  franja, `GET|POST|DELETE /api/closed-weekdays` y `PATCH` parcial de punto (nombre, tipo, ubicación).
  `POST /api/orders` valida que la franja exista, esté habilitada, sea del punto elegido y **aplique a ese
  día de la semana** (los cierres son regla de disponibilidad de la tienda: el admin puede registrar una
  excepción). `pytest` 40/40.
- **Checkout (`app/checkout/page.tsx`):** «2 · Punto de retiro» muestra cada punto con su ubicación y sus
  franjas («Atiende: Lu–Sá · 10:00–13:00»); «3 · Día y franja» solo habilita los días en que ese punto
  atiende y que no estén cerrados, y luego ofrece las franjas de ese día.
- **Admin (`components/admin-agenda.tsx`):** agenda didáctica (una tarjeta por punto con sus franjas y
  chips de días; cierres semanales y por fecha). `components/admin-dashboard.tsx` la importa y el formulario
  de pedidos filtra las franjas por punto y por día.
- **`lib/schedule.ts` (nuevo):** días de la semana compartidos y formato compacto («Lu–Sá · 10:00–13:00»).

**Migración (importante al desplegar):**

1. `time_slots.zone_id` y `weekdays` se agregan con `ALTER TABLE` idempotente y **las franjas globales
   antiguas se eliminan** (`DELETE FROM time_slots WHERE zone_id IS NULL`): ya no pertenecen a ningún punto,
   así que se vuelven a crear dentro de cada punto desde Agenda.
2. `shipping_zones.schedule` se retira; el horario del punto ahora son sus franjas.
3. Reconstruir la imagen de la API antes de probar (ver §0.5): un contenedor viejo no conoce estos campos.

---

## 0.9 Actualización — Ajustes del dueño (2026-09-16)

**Estado: IMPLEMENTADO Y VERIFICADO** (`npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores; la API no se tocó, así que no hace falta reconstruir la imagen). Cinco puntos sobre el código actual, con dos decisiones nuevas (**D20** y **D21**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A13** | Al arrancar (`npm run dev`) la app hace **dos `GET /api/auth/me`** | El header (`useAccountLink`), el checkout, la cuenta y el panel pedían la sesión **cada uno por su cuenta**, y en desarrollo React monta los efectos dos veces: se veía la petición duplicada al arrancar y otra más en cada navegación | `lib/session-client.ts` (nuevo): la sesión es una **promesa compartida** con store externo; `lib/account.ts` expone `useSession()` / `useAccountLink()` y `lib/api.ts` toma el token de ahí. **Una sola lectura por carga de página**, pida quien pida | **F2.11** |
| **A14** | La vista `/cuenta` debe mostrar **header y footer** | Era un `<main>` propio con un enlace «Volver a la tienda», justo lo que se corrigió en la ficha (A6 / D15) | `app/cuenta/page.tsx` usa `StoreHeader`/`StoreFooter` y el botón de WhatsApp; se quitan el enlace «Volver a la tienda» y el nombre de tienda suelto del final | **F2.12** |
| **A15** | Con la API y la base de datos caídas la página carga **valores por defecto**; se pide mostrar **los últimos valores guardados**, de forma poco costosa | El catálogo, los ajustes, los puntos de retiro, las franjas y los cierres caían a datos demo/plantilla (el RPD §1.1 lo registraba como riesgo asumido) | **D20.** `lib/offline-cache.ts` (nuevo): cada lectura pública guarda su última respuesta buena en `localStorage` (vence a los 7 días, claves con versión) y **solo se usa si la petición falla**; cuando la API responde, manda la API. **Alcance recortado tras el análisis de costo/beneficio (ver abajo):** vidriera (tienda y ficha) y ajustes; en el **checkout** se avisa explícitamente en vez de disimular. **El panel no lo usa**: un stock o un pedido viejos inducirían a editar sobre datos desactualizados | **F2.13** |
| **A16** | Analizar y agregar los datos con **más valor para el negocio** (ventas por período, más y menos vendidos, etc.) y **consultar antes** de agregarlos | La sección Reportes mostraba tres métricas y un ranking simple calculado al vuelo. La API **ya entregaba todo lo necesario** (`GET /api/orders` con `created_at`, líneas, punto de retiro, día y franja) | **D21.** `components/admin-reports.tsx` (nuevo) con el **selector de período** que pidió el dueño (ver **A18**) y las métricas aprobadas: ventas + ticket promedio, más/menos vendidos, puntos de retiro, día y franja, categorías + reposición. Pagos pendientes y clientes recurrentes quedaron **fuera** por decisión del dueño | **F3.4 (ampliada)** |
| **A18** | En Reportes, reemplazar el filtro «Este mes» por uno **más completo**: elegir períodos de **un mes, varios meses, hasta un año** | El filtro tenía un preset fijo «Este mes» (mes calendario en curso) sin forma de mirar, por ejemplo, mayo–julio. El dueño aclaró que el rango no busca comparar: **es el tramo de datos que alimentan las tablas** del reporte | Dos `select` de mes/año (**desde → hasta**, meses enteros) que aparecen al elegir «Personalizado»; el rango parte en el mes en curso (lo que hacía «Este mes»), se recorta solo para **no pasar de 12 meses ni invertirse**, y **no muestra comparación** (el % vs. período anterior queda solo en los presets de 7 y 30 días). La lógica de meses vive en `lib/months.ts` (nuevo) | **F3.4 (ampliada)** |
| **A17** | Los **selects del panel** brillan en azul al pasar el mouse y ese brillo se sale de las esquinas redondeadas | Eran `<select>` nativos: Chrome dibuja su propia flecha y la resalta al pasar el mouse, fuera del `border-radius` | `app/globals.css` gana la clase `select-field` (`appearance: none` + flecha propia de la marca) y los campos del panel usan `SELECT_FIELD`, con **hover/focus marcados en el borde** como el botón del filtro de precio. También el select de estrellas de la ficha | **F2.14** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D20** | Modo sin conexión con la API | **Última versión conocida en el navegador:** caché en `localStorage` (sin service worker, sin PWA, sin copia en el servidor) que respalda la **vidriera** cuando la API o su base de datos no responden. La API siempre gana cuando responde y lo guardado vence a los 7 días. **No se aplica al panel ni al formulario del checkout** (ahí se avisa que no se pueden registrar pedidos) | Tienda, ficha de producto (y los ajustes del header en `/cuenta`) |
| **D21** | Reportes del negocio | Métricas aprobadas por el dueño: **ventas + ticket promedio; productos más y menos vendidos (unidades e ingresos) y los sin ventas; ventas por punto de retiro; pedidos por día y franja; ingresos por categoría y alerta de reposición**, más el **rango personalizado por meses enteros (hasta un año)** que define el tramo de datos de las tablas. Nada de esto requiere cambios de schema | Sección **Reportes** del panel |

### Estado: IMPLEMENTADO (2026-09-16)

- **A13 (F2.11):** `lib/session-client.ts` (promesa compartida + snapshot estable), `lib/account.ts` (`useSession`, `useAccountLink`), `lib/api.ts` (`getSessionToken` reusa la misma lectura; `endSession` reinicia la caché) y `app/login/page.tsx` (refresca la sesión al entrar). Ya no queda ningún `fetch("/api/auth/me")` suelto en componentes.
- **A14 (F2.12):** `app/cuenta/page.tsx` con `StoreHeader`/`StoreFooter` (ajustes desde `/api/settings`, con respaldo cacheado), contador del carrito y botón de WhatsApp.
- **A15 (F2.13):** `lib/offline-cache.ts` + uso en `components/storefront.tsx` (catálogo y ajustes), `components/product-detail.tsx` (ficha por slug, sin duplicar el catálogo) y `app/cuenta/page.tsx` (ajustes del header). Cada lectura guarda lo bueno y, **solo si falla**, restaura lo último guardado en vez del demo.
- **A16 (F3.4):** `components/admin-reports.tsx`, montado desde `components/admin-dashboard.tsx`; el tipo de orden del panel ahora conserva `createdAt` (`orders.created_at`, que la API ya devolvía).
- **A18 (F3.4):** `lib/months.ts` (nuevo: claves `YYYY-MM`, etiquetas y `moveRange` con el tope de un año) y el bloque «Personalizado» en Reportes con los dos `select` de mes/año.
- **A17 (F2.14):** `select-field` en `app/globals.css`; `SELECT_FIELD`/`SELECT_FIELD_SM` en el panel (productos, pedidos, agenda, formulario de pedido) y el select de estrellas de la ficha.

### Recorte del caché tras el análisis de costo/beneficio (2026-09-16)

Se midió el alcance real y se ajustó lo implementado primero (el costo sigue anotado en **D20**):

- **Se queda en la vidriera** (tienda, ficha y ajustes del header): con la API caída el cliente ve **su**
  catálogo, precios, fotos y textos en vez de «Producto Uno / Producto Dos» y los textos de plantilla.
  Costo medido: **2,7 KB** con los datos actuales y ~53 KB con un catálogo de 120 productos (~1 % de los
  5 MB de `localStorage`), ~50 líneas de módulo y ningún proceso que mantener.
- **Se retira del checkout:** con la API caída `POST /api/orders` falla igual, así que el caché no salvaba
  ninguna venta: solo hacía que el formulario se viera normal hasta el último clic. Ahora el checkout
  muestra un **aviso explícito** («no es posible registrar pedidos ahora mismo», con enlace a WhatsApp),
  oculta los puntos y horarios que podrían no existir y deshabilita la confirmación. Solo el catálogo y
  los ajustes conservan respaldo, para que el carrito no muestre precios falsos.
- **Ficha sin duplicar:** la clave `product:<slug>` guarda la ficha y sus comentarios; el catálogo vive en
  su propia clave, compartida con la tienda (antes cada ficha visitada duplicaba el catálogo completo).
- **Claves con versión (`bosque-cache:v1:`):** si cambia la forma de los datos de la API, subir la versión
  invalida todo lo guardado; las entradas de versiones anteriores se borran en la primera lectura.
- **Límite reconocido:** el respaldo **solo cubre a quien ya visitó la tienda** antes de la caída; una
  primera visita durante la caída sigue viendo los valores por defecto.

**Pendientes de esta tanda:**

1. **Mirar los Reportes con datos reales** (hoy el panel local tiene pocos pedidos): al cargar pedidos de prueba conviene revisar que los períodos y la comparación se lean como espera el dueño, y ajustar qué métrica va arriba.
2. El caché público se llena solo al navegar: la primera visita sin API sigue mostrando los valores demo (no hay nada guardado todavía). Es esperable y queda documentado en D20.

---

## 0.10 Actualización — Limpieza del código y del modelo (2026-09-16)

**Estado: IMPLEMENTADO Y VERIFICADO** (`pytest`: 40 pruebas en verde; `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores; la migración de limpieza se ensayó contra el PostgreSQL del contenedor dentro de una transacción revertida). Tres puntos sobre el código actual, con una decisión nueva (**D22**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A19** | Revisar si hay **código duplicado o que ya no se use** (con permiso de arreglar lo que aparezca) | Apareció **un bug real**: `lib/api.ts › uploadImage` mandaba solo `X-Admin-Token`, y desde D13 ese token ya no se guarda en la UI, así que **subir fotos desde el panel fallaba con 401** con login por sesión. Además: `DEMO_ZONES`/`DEMO_SLOTS` (inalcanzables desde el recorte de A15), `payment_method` en el tipo `MyOrder` sin pintarse nunca y helpers exportados que solo se usaban dentro de su propio módulo | `uploadImage` pasa a usar el **Bearer de la sesión** (verificado: 401 sin cabeceras, 422 «autorizado, falta el archivo» con el Bearer). Se retiran los datos demo del checkout, el campo sin uso y los `export` internos (`absoluteUrl`, `getAdminToken`, `clearAdminToken`, `getSessionToken`, `WhatsAppIcon`, `formatWeekdays`, `WEEKDAY_SHORT`, `productTones`, `MONTHS_ES`) | **F2.15** |
| **A20** | Hay **componentes que se repiten mucho**: convertirlos en piezas compartidas | Cuatro pantallas repetían el mismo efecto de ajustes (fetch + `mergeSettings` + caché) y seis bloques `fetch`+`writeCache`+`readCache`; el checkout, la agenda y el formulario de pedidos declaraban **sus propios tipos** de punto y franja (con `zoneTypeOf` metido en un componente del panel); los nombres de meses y días estaban copiados en el checkout; el panel tenía su propia copia del tipo `ApiProduct` | `lib/use-store-settings.ts` (nuevo: hook único de ajustes con respaldo), `loadCached()` en `lib/offline-cache.ts` (lectura con respaldo en un paso, con la señal `fromCache` que usa el checkout para avisar), `lib/agenda.ts` (nuevo: `Zone`, `Slot`, `ZoneType` y `zoneTypeOf`), `MONTHS_SHORT` en `lib/months.ts` y el `ApiProduct` de `lib/products.ts`. La ficha conserva su caché propia: guarda `{ product, reviews }` bajo `product:<slug>` **sin** duplicar el catálogo | **F2.16** |
| **A21** | Borrar del backend lo que **ya no se va a utilizar definitivamente** (avisando de lo que pueda tener uso futuro) | Se revisó cada caso con consumidores, pruebas y plan: `pages` + `POST /api/pages` (sin GET, sin pantalla, sin pruebas; el «contenido editable» de F2.5 es `store_settings`), las **variantes** (`product_variants`, `variants` en los schemas, `variant_id` en `order_items` y el `variants: []` que enviaba el panel) y las columnas `products.sku` / `seo_title` / `seo_description` (nadie las lee ni hay editor). El dueño pidió retirar los tres bloques | Se quitan del modelo, de los schemas y de la API, y **una lista idempotente** (`RETIRED_CATALOG_OBJECTS`) los borra al arrancar en PostgreSQL (`DROP COLUMN` de `order_items.variant_id` antes de `DROP TABLE product_variants`, más `pages`), para que una base ya creada quede igual que una nueva. El panel deja de enviar `variants`; la prueba de variantes pasa a cubrir **producto + catálogo público** | **F0.5** |

### Decisión nueva

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D22** | Alcance del modelo de datos | El producto es **uno solo por publicación**: sin variantes, sin SKU y sin campos SEO propios, y la tienda **no tiene páginas editables**. El contenido editable vive en `store_settings` (F2.5) y la ficha de producto (`/producto/[slug]`, D1) existe por su URL propia. Retirar estos bloques fue aprobado por el dueño al revisar qué no se usará | `backend/app/models.py`, `schemas.py` y `main.py`; panel (payload del producto) |

### Estado: IMPLEMENTADO (2026-09-16)

- **A19 (F2.15):** `lib/api.ts › uploadImage` con Bearer de sesión; `app/checkout/page.tsx` sin datos demo de agenda ni tipo `Zone.schedule`; `app/cuenta/page.tsx` sin el campo `payment_method` que no se pintaba; exports internos recortados en `lib/api.ts`, `lib/schedule.ts`, `lib/products.ts`, `lib/months.ts` y `components/whatsapp-button.tsx`.
- **A20 (F2.16):** `lib/use-store-settings.ts` y `lib/agenda.ts` (nuevos); `loadCached()` en `lib/offline-cache.ts`; tienda, ficha, cuenta y checkout usan el hook y ya no repiten el efecto de ajustes; el checkout importa `Zone`/`Slot`/`zoneTypeOf` y `MONTHS_SHORT` en vez de declararlos; `components/admin-dashboard.tsx` importa el `ApiProduct` compartido y `zoneTypeOf` desde `lib/agenda.ts`.
- **A21 (F0.5):** `backend/app/models.py` (fuera `Page`, `ProductVariant`, `variant_id`, `variants`, `sku`, `seo_*`), `backend/app/schemas.py` (fuera `VariantIn`/`VariantOut`/`PageIn` y los campos), `backend/app/main.py` (fuera el endpoint `/api/pages`, el manejo de variantes y `selectinload(Product.variants)`, más `RETIRED_CATALOG_OBJECTS`), `components/admin-dashboard.tsx` (deja de mandar `variants`), `backend/tests/test_api.py` y `backend/README.md`.

### Verificación de la limpieza del backend

- `pytest` (SQLite en memoria): **40 pruebas en verde** después de retirar los tres bloques.
- **Ensayado contra la base real** (PostgreSQL del contenedor, `BEGIN … ROLLBACK`): las seis sentencias de `RETIRED_CATALOG_OBJECTS` corren sin error en ese orden y la base queda intacta tras revertir.
- **Sin pérdida de datos:** al momento de la limpieza, `pages`, `product_variants`, `order_items.variant_id`, `products.sku` y los campos SEO estaban **vacíos** (0 filas).
- ⚠️ **Requiere reconstruir la imagen de la API** (el Dockerfile copia el código; no hay volumen montado). El frontend no necesita nada del backend retirado: nunca leyó esos campos.

---

## 0.11 Actualización — Ajustes del dueño (2026-09-21)

**Estado: IMPLEMENTADO Y VERIFICADO** (`npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores;
`pytest` **41/41**; y probado **de punta a punta contra la API dockerizada** — `docker compose -f
docker-compose.backend.yml up --build -d`, `ALTER TABLE` de la columna nueva aplicado, `PUT /api/settings`
con `X-Admin-Token` guardando la URL del widget y el `GET` público devolviéndola). Cuatro puntos sobre el
código actual, con dos decisiones nuevas (**D23** y **D24**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A22** | Con **más de una foto** en la ficha, poder moverse entre imágenes con **dos botones** (izquierda y derecha) sobre la foto principal | La ficha ya mostraba una **fila de miniaturas** (`components/product-detail.tsx`) para cambiar de foto, pero con varias imágenes obligaba a apuntar a cada miniatura | Se agregan **flechas** superpuestas a la foto principal (`ChevronLeft`/`ChevronRight`) que avanzan y **dan la vuelta** al llegar al final, además de las miniaturas. El índice visible se deriva de la galería, así que las flechas y las miniaturas quedan sincronizadas | **F1.1** |
| **A23** | Agregar las **últimas historias de Instagram** al final del body, como en https://www.studiopasacademy.com, **a ancho completo** y mostrando **solo las publicaciones** | El plan solo contemplaba la sección v1 de **D11** (enlace oficial en el footer); RPD §3.5 registraba «Feed de Instagram: no existe». El **embed oficial del perfil** muestra un encabezado con el avatar y no se puede ensanchar más allá de su tarjeta (~540 px), y la API pública de Instagram responde **429** al consultarla desde el servidor (probado): el embed oficial no cumple el pedido | **D23.** `components/instagram-feed.tsx` (nuevo): sección al final de la página principal que pinta **solo** el **iframe de un widget de terceros** (solo publicaciones, **de borde a borde** de la pantalla) con el código o la URL que se pega en el panel (Contenido › «Instagram — código o URL del widget»). **Sin encabezado ni enlace al perfil** (el propio widget ya lleva a Instagram). Acepta la URL pelada o el fragmento `<iframe src="…" height="…">` del proveedor y **respeta la altura sugerida** (acotada entre 400 y 1600 px). Sin widget, la sección no se dibuja | **F3.2** |
| **A24** | Copiar el apartado de **productos destacados/más vendidos** de https://simplysweet.cl al catálogo de la página principal, **manteniendo los filtros arriba** y **quitando** la categoría debajo de la carta y la descripción debajo del `<h3>` | La tarjeta mostraba categoría, nombre, descripción y precio en un bloque; la referencia usa tarjetas limpias (foto, nombre y precio) bajo el título «Productos Destacados» | **D15** (referencia ampliada a la carta). `components/storefront.tsx`: el catálogo pasa a titularse «Productos destacados», los **filtros de categoría se mantienen arriba** del grid y la tarjeta queda **solo con foto, nombre y precio**, sin categoría ni descripción. **Ajuste de espaciado y forma (misma fecha):** más aire entre tarjetas (`gap-x-8 gap-y-10`), foto con **esquinas redondeadas** (`rounded-2xl`) y **precio bajo el nombre**, alineado a la izquierda, en lugar del bloque lateral | **F1.10** |
| **A25** | Aplicar la **paleta** `#D7CDC1`, `#D9B391`, `#846851`, `#401A04`, `#808C6D` (con blanco/negro de apoyo) a la página para que se vea elegante y armónica, **solo en la página principal y la ficha**, con **#808C6D como color principal de la marca** | La identidad era verde/moss (`--ink #243128`, `--moss #56745c`, `--cream #faf7f0`) y el header/footer (`components/store-shell.tsx`) se **comparten** con `/checkout` y `/cuenta`, que deben quedar fuera del cambio | **D24.** `app/globals.css` gana la clase `theme-bosque` (variables + visuales cálidos de hero/producto, que **no** tocan panel ni checkout). El `<main>` de la tienda y la ficha la usan; `StoreHeader`/`StoreFooter` reciben la prop **`warm`** y `components/cart-drawer.tsx` se retematiza (solo se usa en esas dos vistas). **El verde salvia `#808C6D` es el acento protagónico:** anuncio, botones y enlaces principales, filtros, botón de agregar al carrito, sección de historia y el botón de Instagram; el marrón `#401A04` queda como tinta y bloques oscuros. Los indicadores de stock conservan su semántica verde/ámbar/rojo por ser funcionales | **F2.17** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D23** | Feed de Instagram | **Widget de terceros con iframe** (SociableKIT, SnapWidget, EmbedSocial…) para mostrar **solo las publicaciones de borde a borde**, con el código o la URL del iframe pegada en el panel (Contenido). Evita el token de Meta y también el scrapeo desde el servidor (la API pública devuelve 429). Actualiza **D11**: el embed oficial del perfil queda descartado (no se puede ensanchar ni ocultar su encabezado) y el feed con token de Meta sigue disponible como alternativa | `store_settings.instagram_embed_url`, `components/instagram-feed.tsx`, `storefront.tsx`, panel (Contenido) |
| **D24** | Identidad visual (paleta) | La paleta cálida (**#D7CDC1 / #D9B391 / #846851 / #401A04 / #808C6D**, más blanco y negro de apoyo) viste **solo la página principal y la ficha de producto**. Como el header/footer se comparten con `/checkout` y `/cuenta`, se aplica con la clase `theme-bosque` sobre el `<main>` de esas dos vistas y la prop `warm` del header/footer, de modo que el checkout y la cuenta **no** cambian. **Ajustada en §0.14 (D28): el footer queda cálido en todas las páginas**; **y en §0.15 (D29): los cinco tonos se editan desde el panel** | `globals.css`, `storefront.tsx`, `product-detail.tsx`, `store-shell.tsx`, `cart-drawer.tsx` |

### Estado: IMPLEMENTADO (2026-09-21)

- **A22 (F1.1):** `components/product-detail.tsx` con flechas anterior/siguiente sobre la foto principal (`goTo` con vuelta al inicio) además de las miniaturas.
- **A23 (F3.2):** `store_settings.instagram_embed_url` (nueva columna, con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al arrancar en PostgreSQL), campo en Contenido y `components/instagram-feed.tsx` montado antes del footer de la tienda. La sección muestra **solo el iframe del widget** (se quitaron el encabezado y el enlace al perfil que se habían agregado primero, por ser redundantes con el propio widget) y es **puramente el widget**: sin fondo, sin padding y sin contenedores intermedios, para que la grilla llegue de borde a borde.
- **A24 (F1.10):** `components/storefront.tsx` con el catálogo «Productos destacados»: filtros arriba y tarjeta de foto + nombre + precio.
- **A25 (F2.17):** `app/globals.css` (`theme-bosque`), `components/store-shell.tsx` (prop `warm`), `components/storefront.tsx`, `components/product-detail.tsx` y `components/cart-drawer.tsx` con la paleta cálida y el salvia como acento principal.
- **Bug encontrado al probar el campo nuevo (GET `/api/settings`):** en una instalación nueva la fila de `store_settings` no existe y el endpoint devolvía `StoreSettings(id=True)` sin `name` ni `updated_at`, así que **el GET fallaba con 500** hasta que alguien guardara desde el panel. Ahora la primera lectura **crea la fila con sus valores por defecto** (patrón singleton). Cubierto con una prueba en `backend/tests/test_api.py`.

**Nota de mantenimiento (fuera del tema visual):** los `.pyc` de `backend/**/__pycache__` estaban **versionados** en git, así que correr `pytest` ensuciaba el diff. Ya estaban cubiertos por `.gitignore`; se les quitó el seguimiento con `git rm -r --cached` (los archivos siguen en disco).

**Pendientes de esta tanda:**

1. **Widget de Instagram configurado (2026-09-21):** el dueño creó el widget en **SociableKIT** (plan gratis) y su iframe (`instagram-feed/iframe/25715804`, altura sugerida 1000 px) quedó cargado en `store_settings.instagram_embed_url`. Verificado de punta a punta: la API lo devuelve, la sección lo renderiza **de borde a borde** (`block w-full`, sin `max-w-7xl`) y el iframe del proveedor responde 200.
2. **Reconstruir la imagen de la API antes de desplegar** (ver §0.5): la columna `instagram_embed_url` se agrega con `ALTER TABLE` al arrancar; sin rebuild, guardar el contenido desde el panel falla con 404/422.
3. **Revisar la paleta contra la referencia** en móvil y escritorio: los tonos cálidos se aplican a la tienda y la ficha, mientras `/checkout` y `/cuenta` conservan el verde anterior; si el dueño prefiere uniformar, es un cambio de una línea por pantalla (**el footer ya se uniformó en §0.14 / D28**; queda pendiente el header de `/cuenta`).

> **Widget de Instagram — costo de los planes gratis:** los planes gratuitos limitan las vistas mensuales (Elfsight 200, Taggbox 500, SociableKIT/CollectSocials 2.000); al agotarlas el widget deja de mostrarse. Si la tienda crece, el salto es a un plan pago (SociableKIT desde ~$10/mes con vistas ilimitadas).

---

## 0.12 Actualización — Ajuste del dueño (2026-09-21): catálogo paginado

**Estado: IMPLEMENTADO Y VERIFICADO** (`pytest` **42/42**; `npx tsc --noEmit`, `npm run lint` y
`npm run build` sin errores). Un punto sobre el código actual, con una decisión nueva (**D25**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A26** | En **Productos destacados**: **8 por página** con un botón a la derecha para avanzar, y al filtrar que los productos que no coinciden **se desvanezcan** y los que quedan **se vayan juntando** | El catálogo pintaba **todos** los productos filtrados de una vez y el filtro los hacía desaparecer de golpe (salto seco, sin transición) | **D25.** `components/storefront.tsx`: **8 por página** (4 columnas × 2 filas) con flechas ‹ › y contador «n / N» a la derecha de los filtros (aparecen cuando hay más de una página) y vuelta a la primera página al filtrar o buscar. La animación usa `framer-motion` (`layout` + `AnimatePresence mode="popLayout"`): los que salen se desvanecen y los que quedan se reacomodan | **F1.10** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D25** | Paginado del catálogo | **8 productos por página** (~~ajustable en Contenido~~; **ajustado en §0.13 / D26: la cantidad queda fija**) con flechas de página a la derecha de los filtros y transición animada al filtrar, en lugar de mostrar todo el catálogo de una vez | `storefront.tsx` |

### Estado: IMPLEMENTADO (2026-09-21)

- **A26 (F1.10):** `store_settings.products_per_page` (default 8) con `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS` al arrancar, campo nuevo en Contenido y `components/storefront.tsx` con la paginación y la
  animación del filtro.

> **Ajustado el 2026-09-22 (§0.13 / A27):** el dueño dejó los **8 productos por página como valor
> fijo**, así que el ajuste salió del panel y de la API (la columna se retira al arrancar). La
> paginación con flechas, contador y animación se mantiene igual.
- **Sin dependencias nuevas:** `framer-motion` ya estaba en el proyecto (lo usa el carrito desde §0.11).

**Al desplegar:** **reconstruir la imagen de la API** por la columna nueva de `store_settings` (ver §0.5).

---

## 0.13 Actualización — Ajustes del dueño (2026-09-22)

**Estado: IMPLEMENTADO Y VERIFICADO** (`npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores;
`pytest` **42/42**). Dos puntos sobre el código actual, con dos decisiones nuevas (**D26** y **D27**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A27** | En **Productos destacados** los **8 productos por página son fijos**: quitar del panel la opción para cambiarlos | §0.12 los había dejado como ajuste editable: columna `store_settings.products_per_page` (con `ALTER TABLE` al arrancar), campo en `SettingsIn`, campo «Productos por página en la vitrina» en Contenido, `products_per_page` en `StoreConfig`/`ApiSettings` y lectura en `storefront.tsx` con default 8 | **D26.** La carta pagina siempre **8** desde una constante (`PRODUCTS_PER_PAGE`, 4 columnas × 2 filas). Se retira el campo del panel, las propiedades del frontend, el campo del schema y **la columna** (`DROP` idempotente al arrancar, como en D22). Las flechas, el contador y la animación del filtro quedan igual | **F1.10** |
| **A28** | Actualizar el **footer** para que sea profesional (**copyright**, número y correo de contacto, etc.) | `StoreFooter` mostraba solo el nombre de la tienda y una línea de plantilla («Una base para crear marcas con vida.»). La API **ya guardaba** `contact_email`/`contact_phone`/`whatsapp_phone`, pero `lib/store-config.ts` **no declaraba `contact_email`**, así que ese dato nunca llegaba al frontend | **D27.** Footer en tres bloques —**marca** (nombre + una línea del negocio), **Contacto** (correo `mailto:`, teléfono `tel:`, WhatsApp e Instagram, cada fila solo si está configurada) y **Tienda** (anclas de Productos, Beneficios y Nosotros)— más una franja inferior con **© año + nombre** y la ubicación. `contact_email` se agrega a los ajustes del frontend (tipo, `mergeSettings` y default) para que el valor guardado en Contenido llegue a la vista | **F2.18** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D26** | Paginado del catálogo | **8 productos por página, fijos** (4 columnas × 2 filas): deja de ser configurable desde el panel. Ajusta **D25** | `components/storefront.tsx`; `store_settings.products_per_page` (retirada) |
| **D27** | Footer de la tienda | Footer **profesional** compartido por carta, ficha y cuenta: marca, **datos de contacto** (correo, teléfono, WhatsApp e Instagram), navegación y **copyright con el año**. El footer mínimo del checkout se mantiene como la referencia Shopify (**D15**) | `components/store-shell.tsx`, `lib/store-config.ts` |

### Estado: IMPLEMENTADO (2026-09-22)

- **A27 (F1.10):** `components/storefront.tsx` con `PRODUCTS_PER_PAGE = 8`; `lib/store-config.ts` sin
  `products_per_page` (tipo, `ApiSettings`, `mergeSettings` y default); `components/admin-dashboard.tsx` sin
  el campo ni el helper `numberField`; `backend/app/models.py` y `backend/app/schemas.py` sin la
  columna/campo, y **`RETIRED_STORE_SETTINGS_COLUMNS`** la elimina al arrancar en PostgreSQL;
  `backend/tests/test_api.py` verifica que el ajuste **ya no se expone** en `GET/PUT /api/settings`.
- **A28 (F2.18):** `components/store-shell.tsx` con el footer de tres bloques y la franja de copyright;
  `ShellConfig` expone `contact_email`/`contact_phone`/`whatsapp_phone`; `lib/store-config.ts` agrega
  `contact_email` (era el único dato de contacto que no llegaba al frontend); `components/checkout-shell.tsx`
  reutiliza el `ShellConfig` completo (ya no redeclara `whatsapp_phone`).

**Al desplegar:** **reconstruir la imagen de la API** (se retira una columna de `store_settings`; ver §0.5).

---

## 0.14 Actualización — Ajuste del dueño (2026-09-22): footer cálido en todas las páginas

**Estado: IMPLEMENTADO Y VERIFICADO** (`npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores).
Un punto sobre el código actual, con una decisión nueva (**D28**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A29** | **Uniformar el footer de `/cuenta` con la paleta cálida de la tienda** | **D24** dejó el footer **compartido** por carta, ficha y cuenta, pero con prop `warm`: cálido solo en las dos primeras, verde anterior en `/cuenta`. Al pasar el footer a cálido en todas las páginas, la variante verde **queda sin uso** (el checkout tiene su propio footer mínimo, D15) | **D28.** `StoreFooter` **pierde la prop `warm`** y usa siempre la paleta cálida (`#401A04` de fondo, `#D7CDC1`/`#D9B391` para texto y enlaces, `#846851` en la línea divisoria), así que la cuenta queda uniformada sin tocar `app/cuenta/page.tsx`. Se retiran las ramas de color sin uso y las llamadas `warm` de `storefront.tsx` y `product-detail.tsx` (D22: lo que no se usa se elimina). El **header** conserva `warm` porque `/cuenta` mantiene ahí la identidad anterior | **F2.19** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D28** | Footer de la tienda | **Un solo footer, siempre en la paleta cálida** (carta, ficha y cuenta): el pie es el mismo en todo el sitio y deja de depender de la vista. Ajusta **D24** (el header mantiene la prop `warm`; el checkout mantiene su footer mínimo, D15) | `components/store-shell.tsx`, `storefront.tsx`, `product-detail.tsx`, `app/globals.css` (comentario) |

### Estado: IMPLEMENTADO (2026-09-22)

- **A29 (F2.19):** `components/store-shell.tsx` con `StoreFooter({ config })` (sin variante verde),
  `components/storefront.tsx` y `components/product-detail.tsx` sin la prop `warm` en el footer y el
  comentario de `app/globals.css` ajustado. `app/cuenta/page.tsx` **no se toca**: al ser el footer único,
  hereda la paleta cálida.

**Sin pendientes de despliegue:** el cambio es solo de frontend (no toca API ni base de datos).

---

## 0.15 Actualización — Ajuste del dueño (2026-09-22): colores editables desde el panel

**Estado: IMPLEMENTADO Y VERIFICADO** (`npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores;
`pytest` **43/43**). Un punto sobre el código actual, con una decisión nueva (**D29**):

| # | Ajuste pedido | Análisis del código actual | Implementación | Tareas |
|---|---|---|---|---|
| **A30** | Poder **editar los colores de la página desde el panel**, para probar las configuraciones que el cliente quiera | La paleta cálida estaba **hardcodeada** en dos lugares: la clase `theme-bosque` (`app/globals.css`, con los visuales de relleno) y ~70 valores hex sueltos en `storefront.tsx`, `product-detail.tsx`, `store-shell.tsx` y `cart-drawer.tsx`. Sin variables no había nada que el panel pudiera cambiar | **D29.** Los cinco tonos pasan a **variables CSS** (`--brand-accent`, `--brand-ink`, `--brand-surface`, `--brand-muted`, `--brand-detail`) con la paleta actual como valor por defecto, y el panel los edita en **Contenido › Colores de la tienda** (selector de color, hex y ~~«Restablecer paleta»~~ **«Intercambiar con…»**, que cambia dos tonos de lugar — ajustado el mismo día a pedido del dueño). Se guardan en `store_settings.theme_colors` (columna **JSON** nueva, validada por la API: solo esos cinco tonos y hex de seis dígitos) y cada vista cálida los escribe **en línea** sobre su `<main>`, así que carta, ficha, carrito lateral y footer los heredan sin props. Los matices que no se editan (texto claro sobre la tinta, fondos y rellenos de los visuales) se derivan con `color-mix` para que la tienda siga legible con cualquier combinación | **F2.20** |

### Decisiones nuevas

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| **D29** | Paleta de marca | Los **cinco tonos de la identidad cálida se editan desde el panel** (Contenido › Colores) y se guardan en `store_settings.theme_colors` como JSON; la tienda los aplica con variables CSS y deriva el resto con `color-mix`. El panel, el checkout y el contenido/header de la cuenta conservan sus colores. **Decidido con el dueño:** cinco tonos nombrados por su uso (acento, tinta, bloque suave, texto secundario y detalle cálido), alcance **carta + ficha + footer** y **sin vista previa** en el panel (guardar y refrescar) | `lib/theme.ts`, `app/globals.css`, `storefront.tsx`, `product-detail.tsx`, `store-shell.tsx`, `cart-drawer.tsx`, `app/cuenta/page.tsx`, `admin-dashboard.tsx`, `backend/app/*` |

### Estado: IMPLEMENTADO (2026-09-22)

- **A30 (F2.20):** `lib/theme.ts` (nuevo) con los cinco tonos, sus etiquetas para el panel, la
  normalización de lo que devuelve la API (`normalizeThemeColors`) y el helper `themeVars`;
  `app/globals.css` con las variables `--brand-*` y los derivados `color-mix`; `components/storefront.tsx`,
  `components/product-detail.tsx` y `app/cuenta/page.tsx` escribiendo la paleta en línea en su `<main>`;
  los hex sueltos de esos componentes, del footer y del carrito lateral reemplazados por variables;
  `backend/app/models.py` con la columna `theme_colors`, `backend/app/schemas.py` con la validación
  (tonos conocidos y hex de seis dígitos, normalizado a minúsculas) y `backend/app/main.py` con el
  `ADD COLUMN IF NOT EXISTS` idempotente; `backend/tests/test_api.py` con la prueba de guardado y de
  rechazo.
- **Sin vista previa en el panel** (decisión del dueño): el propio selector de color del navegador hace
  de muestra y al guardar la tienda toma los colores al refrescar. El borrador del campo de texto no
  vuelca un hex a medio escribir, así que la API nunca recibe un valor inválido.
- **Sin dependencias nuevas** y sin tocar la paleta base (`--ink`/`--moss`/`--cream`) del panel, el
  checkout y la cuenta: sus pantallas siguen con los colores de siempre.
- **«Restablecer paleta» retirado (mismo día, a pedido del dueño):** volver a los tonos del código se hace
  dejando el ajuste vacío, y en su lugar el panel ofrece **intercambiar dos tonos de lugar**
  («Intercambiar con…» sobre cada tono), que es lo que hacía falta para probar otro reparto sin copiar hex
  a mano ni perder ningún color por el camino.
- **Guardarraíl contra el guardado silencioso:** la paleta se estrenó contra una **imagen vieja de la API**
  y el PUT respondía **200 sin guardar nada**, porque pydantic **descarta los campos que no conoce**.
  `SettingsIn` usa `extra="forbid"`: un campo que la API no reconoce devuelve **422** con su nombre, y una
  prueba cubre el caso. Verificado de punta a punta contra la API **dockerizada reconstruida**: el PUT con
  los cinco tonos se guarda (normalizando el hex a minúsculas), el GET los devuelve, y se rechazan un hex
  inválido, un tono desconocido y un campo de más (422 los tres).

**Al desplegar:** **reconstruir la imagen de la API** (hay una columna nueva en `store_settings`; ver §0.5)
— ya reconstruida y probada en local contra PostgreSQL; el despliegue de AWS sigue pendiente.

---

## 1. Resumen de fases

| Fase | Nombre | Entregable | Estimación | Decisiones requeridas |
|---|---|---|---|---|
| **F0** | Preparación y modelo de datos | Schema migrado, storage de fotos, trabajo previo commiteado, fuente de verdad definida | 2–3 días | D7 (crítica), D2, D4, D5, D6 |
| **F1** | P0 — Catálogo, stock y agenda | Ficha con fotos + alérgenos, etiquetas de stock, checkout con día/franja/zonas | 2–3 semanas | D1, D3 |
| **F2** | P1 — Checkout real, pagos y panel | Órdenes persistidas, transferencia, Webpay, panel móvil, contenido editable, botón WhatsApp | 2–3 semanas | D8, D9 (parcial), D12 |
| **F3** | P2 — Extras | Notificación WhatsApp, Instagram, comentarios, reportes | 1–2 semanas | D9, D10, D11 |

**Total estimado: 6–9 semanas** trabajando de forma continua; más si se intercalan revisiones del dueño.

### Dependencias entre fases (esquema)

```
F0 (datos) ──► F1 (P0: catálogo + stock + agenda) ──► F2 (P1: checkout + pagos + panel) ──► F3 (P2: extras)
```

- La **agenda (F1.6–F1.8)** es el módulo más transversal: depende de F0 (tablas nuevas) y condiciona
  F2 (checkout persistente) — por eso va temprano, aunque la UI completa de compra llegue en F2.
- **F3 es intercambiable internamente** (se puede hacer Instagram antes que comentarios, etc.).

---

## 2. Fase 0 — Preparación y modelo de datos

> Objetivo: dejar la base de datos, el storage y el repo listos para construir sin deudas técnicas.

### F0.1 — Commitear el trabajo pendiente
- **Qué:** `components/admin-dashboard.tsx` tiene cambios sin commitear (modal de ítems, filtros,
  creación de producto, modal de stock).
- **Criterio de aceptación:** `git status` limpio; `npm run lint` y `npx tsc --noEmit` sin errores.
- **Estimación:** 0.5 día.

### F0.2 — Definir la fuente de verdad (D7)
- **Qué:** decidir si se sigue con Supabase + Route Handlers de Next.js (recomendado) o se despliega
  FastAPI.
- **Acción:** congelar `backend/` (no tocar, no desplegar) hasta que se decida; si se elige Supabase,
  el backend pasa a ser referencia histórica y se elimina de la documentación activa.
- **Criterio de aceptación:** decisión registrada en RPD (D7 respondida).
- **Estimación:** 0.5 día (conversación con dueño).

### F0.3 — Migración del schema Supabase
Archivo: `supabase/schema.sql` (nueva migración, no editar el original a ciegas).

**Nuevas columnas en `products`:**
- `images text[]` (galería; `image_url` queda para compatibilidad o se depreca).
- `ingredients text` (descripción de ingredientes principales).
- `allergens text[]` (códigos: `gluten`, `lacteos`, `frutos-secos`, `huevo`, `mani`, `soja`, `sesamo`).
- `allow_backorder boolean default false` (bajo pedido, sin días de anticipación — ver §0.4).
- Ampliar el `CHECK` de `status`: `('draft','active','sold_out','preorder')` (o manejar "bajo pedido"
  vía `allow_backorder` + etiqueta derivada, según D3/D4).

**Nuevas tablas:**
- `time_slots` (id, label, start_time, end_time, enabled) — franjas configurables.
- `closed_days` (id, date, reason) — bloqueo de días.
- `shipping_zones` (id, name, type: `domicilio` | `retiro`, areas text[], active) — San Javier
  domicilio; San Javier + Talca retiro.
- `product_images` *(opcional; si se prefiere tabla sobre array)*.

**Cambios en `orders`:**
- `scheduled_date date`, `time_slot_id uuid references time_slots`, `shipping_zone_id uuid references
  shipping_zones`, `fulfillment text` (`retiro` | `domicilio`).
- `customer_name`, `customer_phone`, `customer_email`, `notes text` (datos que hoy no existen).
- `payment_status` derivado del `status` existente; mantener `payment_method`.

**Cambios en `store_settings`:**
- `whatsapp_phone`, `instagram_url`, `bank_account_info` (para transferencia), `story_*` (textos de
  historia) — para conectar panel ↔ storefront en F2.5.

**Storage:**
- Crear bucket público `product-images` + política RLS (lectura pública, escritura solo admin).

**Criterio de aceptación:** migración aplicada en Supabase; consultas públicas no rompen; RLS sigue
protegiendo escrituras. `npx tsc --noEmit` OK.
**Dependencias:** F0.2 (fuente de verdad afecta dónde vive la migración).
**Estimación:** 1–1.5 días.

### F0.4 — Sincronizar (o congelar) el backend local
- Si se mantiene FastAPI (D7 contraria): replicar las nuevas columnas/tablas en `backend/app/models.py`,
  `schemas.py` y pasar `pytest` en `backend/tests/`.
- Si se descarta: marcar `backend/README.md` como "legacy, no usar".
- **Estimación:** 0.5 día.

---

## 3. Fase 1 — P0: Catálogo con fotos y ficha, stock, agenda

> Objetivo: que un cliente pueda ver el catálogo real con fotos, alérgenos y estados de stock, y
> reservar un pedido con día, franja y zona.

### F1.1 — Ficha de producto (`/producto/[slug]`)
- **Archivos:** `app/producto/[slug]/page.tsx` (nuevo), `components/product-detail.tsx` (nuevo),
  `components/storefront.tsx` (enlaces desde la carta).
- **Pasos:** ruta dinámica que lee el producto por slug (Supabase); galería de imágenes; descripción,
  ingredientes; selector de cantidad + "agregar al carrito"; productos
  relacionados opcional.
- **Decisión:** D1 (default: página propia).
- **Criterio:** la carta enlaza a la ficha; la ficha muestra fotos, ingredientes, sello y alérgenos;
  funciona con el carrito existente.
- **Dependencias:** F0.3 (images, ingredients, allergens).
- **Estimación:** 2–3 días.

### F1.2 — Fotos reales (subida y visualización)
- **Archivos:** `components/admin-dashboard.tsx` (editor de producto: campo de fotos),
  `lib/supabase/browser.ts` (o nuevo helper de storage).
- **Pasos:** en el admin, subir imágenes al bucket y guardar URLs en `products.images`; en el storefront
  y la ficha, reemplazar los gradientes CSS por `<img>` (mantener gradiente como fallback).
- **Criterio:** el admin puede subir/eliminar fotos desde celular, tablet y desktop; el storefront las
  muestra.
- **Dependencias:** F0.3 (bucket + columnas), F1.1.
- **Estimación:** 2–3 días.

### F1.3 — Alérgenos
- **Archivos:** `components/product-detail.tsx`, `components/storefront.tsx` (ícono en la carta opcional),
  constante de códigos + íconos (p. ej. en `lib/allergens.ts`).
- **Pasos:** mapear códigos → íconos/etiquetas (`Frutos secos`, `Lácteos`, `Gluten`, `Huevo`, …);
  mostrarlos en la ficha; incluirlos en el editor del admin.
- **Criterio:** cada producto puede declarar alérgenos y el cliente los ve con íconos claros.
- **Dependencias:** F0.3, F1.1, F1.2 (mismo editor).
- **Estimación:** 1 día.

### F1.4 — Etiquetas de stock en la carta
- **Archivos:** `components/storefront.tsx`, `components/product-detail.tsx`.
- **Pasos:** etiqueta visible por producto: **Disponible** (inventory > 0), **Agotado** (inventory = 0
  sin backorder) o **Bajo Pedido** (allow_backorder, sin días de anticipación); deshabilitar el
  botón "+" en agotados.
- **Decisión:** D3, D4.
- **Criterio:** las tres etiquetas se ven correctamente según stock/backorder; un producto agotado no se
  puede agregar al carrito.
- **Dependencias:** F0.3.
- **Estimación:** 1–1.5 días.

### F1.5 — Auto-desactivación y decremento de stock
- **Archivos:** `lib/supabase/` (o nueva `app/api/` con función RPC), `supabase/schema.sql` (función
  `decrement_stock` o update con guard).
- **Pasos:** al confirmar un pedido, decrementar `inventory` de forma atómica con validación
  (`inventory >= quantity`); si llega a 0 y no tiene `allow_backorder`, pasar a `sold_out`; opcional:
  notificar al admin de stock bajo.
- **Criterio:** dos pedidos simultáneos no pueden agotar más stock del existente; el producto cambia a
  agotado solo.
- **Dependencias:** F1.4 (estados), F2.1 (persistencia de órdenes) — se diseña aquí, se activa en F2.
- **Estimación:** 1.5 días.

### F1.6 — Agenda: día y franja del punto elegido
- **Archivos:** `app/checkout/page.tsx`, `lib/schedule.ts`, consultas a `time_slots`, `closed_days` y
  `closed_weekdays`.
- **Pasos:** tras elegir el punto (F1.8), el cliente elige el **día** —solo los días en que ese punto
  atiende y que no estén cerrados— y después la **franja** de ese día; la selección llega al resumen.
- **Decisión:** D5 / **D18**.
- **Criterio:** no se puede elegir un día sin franjas para ese punto ni una franja que no corresponda al
  día elegido; los cierres semanales y de fecha no aparecen disponibles.
- **Dependencias:** F0.3, F1.8.
- **Estimación:** 2–3 días.
- **Estado:** IMPLEMENTADO (ver §0.8).

### F1.7 — Agenda en el panel: puntos con sus franjas y cierres (A10–A12)
- **Archivos:** `components/admin-agenda.tsx` (nuevo), `components/admin-dashboard.tsx`,
  `backend/app/main.py`, `backend/app/schemas.py`.
- **Pasos:** una **tarjeta por punto** con su ubicación, sus **franjas** (días + horario) y las acciones
  del punto (editar, activar, eliminar); CRUD de franjas dentro del punto; **cierres semanales** como chips
  de Lunes a Domingo y **fechas puntuales**; endpoints `GET/POST/PATCH/DELETE /api/time-slots` (con filtro
  por `zone_id`) y `GET/POST/DELETE /api/closed-weekdays`.
- **Criterio:** desde el panel (celular y escritorio) se agrega un punto, se le cargan franjas con sus
  días, se cierra el lunes de todas las semanas y el checkout lo refleja.
- **Dependencias:** F1.6, F1.8.
- **Estimación:** 1.5–2 días.
- **Estado:** IMPLEMENTADO (ver §0.8).

### F1.8 — Puntos de retiro y encuentro (San Javier / Talca)
- **Archivos:** `app/checkout/page.tsx`, admin (sección Agenda: `shipping_zones`), `backend/app/models.py`.
- **Pasos:** el cliente elige el punto donde retira su pedido —**retiro presencial** o **punto de
  encuentro** (Talca / San Javier)— entre los que el admin tenga activos; cada punto muestra su
  **ubicación** y sus **franjas horarias** (con los días de la semana, D18); se guarda
  `shipping_zone_id` + `fulfillment` (`retiro` | `encuentro`) en la orden.
- **Decisión:** D6 / **D16** (no hay despacho a domicilio).
- **Criterio:** no existe la opción «A domicilio» (la API rechaza ese valor); no se puede confirmar sin
  elegir punto; el admin puede agregar, activar y desactivar puntos desde Agenda.
- **Dependencias:** F0.3, F1.6.
- **Estimación:** 1.5–2 días.
- **Estado:** IMPLEMENTADO (ver §0.7).

### F1.9 — Ficha de producto integrada al layout (A6, D15)
- **Archivos:** `app/producto/[slug]/page.tsx`, `components/product-detail.tsx`,
  `components/store-shell.tsx` (nuevo: `StoreHeader`/`StoreFooter`), `components/cart-drawer.tsx` (nuevo).
- **Pasos:** extraer el header (anuncio, navegación, buscador, cuenta, carrito) y el footer del storefront
  a componentes compartidos y usarlos en la ficha; **quitar el enlace «Volver a la tienda»** (incluido el
  del estado «producto no encontrado»); reusar el carrito lateral. Revisar la referencia **§9** antes de
  maquetar.
- **Criterio:** desde la carta se entra a la ficha y el header/footer se mantienen idénticos; no queda
  ningún «Volver a la tienda»; el carrito y su contador funcionan entre páginas.
- **Ajuste A22 (2026-09-21):** con **más de una foto**, la ficha muestra **flechas izquierda/derecha**
  sobre la foto principal (además de las miniaturas) que avanzan y dan la vuelta al llegar al final.
- **Estado:** IMPLEMENTADO (ver §0.6; flechas de la galería en §0.11).

### F1.10 — Catálogo «Productos destacados» en la página principal (A24, D15)
- **Archivos:** `components/storefront.tsx`.
- **Referencia:** el apartado de **productos destacados/más vendidos** de https://simplysweet.cl (§9).
- **Pasos:** titular el catálogo «Productos destacados», **mantener los filtros de categoría arriba** del
  grid y dejar la tarjeta **solo con foto, nombre y precio**: quitar la **categoría** que iba debajo de la
  carta y la **descripción** que iba debajo del `<h3>`. Es un cambio de presentación, no de datos.- **Criterio:** la carta muestra las tarjetas limpias bajo el título, con los filtros y el buscador funcionando igual que antes.
- **Ajuste A26 (2026-09-21):** el catálogo pagina de a **8 productos** (4 columnas × 2 filas) con flechas,
  contador y transición animada al filtrar (D25, §0.12).
- **Ajuste A27 (2026-09-22):** esa cantidad queda **fija**: se quita del panel el ajuste para cambiarla y
  la columna `store_settings.products_per_page` sale de la API (D26, §0.13).
- **Estado:** IMPLEMENTADO (ver §0.11 y §0.13).

> **Gate F1:** `npx tsc --noEmit`, `npm run lint`, `npm run build` OK + revisión del dueño (flujo
> cliente completo en móvil y desktop).

---

## 4. Fase 2 — P1: Checkout real, pagos y panel

> Objetivo: cobrar (transferencia y luego Webpay), persistir pedidos de verdad, y administrar todo
> desde cualquier dispositivo.

### F2.1 — Checkout completo que persiste la orden

> **Ajuste A6 (2026-09-14):** el checkout **mantiene su estructura de pasos y los datos que ya se piden**
> (nombre, teléfono, correo, punto de retiro, día, franja y método de pago), pero ahora vive dentro del
> layout de la tienda (`StoreHeader`/`StoreFooter`) como en **simplysweet.cl** (§9). Después salieron dos
> campos: la **dirección a domicilio** y la **nota del pedido** (§0.7, **D16** y **D17**).

- **Archivos:** `app/checkout/page.tsx`, admin (leer órdenes reales desde `orders`/`order_items`).
- **Pasos:** formulario con datos de contacto (nombre, teléfono, email), resumen de carrito,
  punto de retiro y día/franja (de F1.6–F1.8), método de pago, y **persistir** en la API (`orders` +
  `order_items`); el admin lee órdenes reales.
- **Criterio:** al confirmar, la orden aparece en el admin con sus ítems, fecha, franja, punto de retiro y
  estado "Pendiente"; el stock decrementa (F1.5) y el carrito se limpia.
- **Dependencias:** F1.6, F1.7, F1.8, F1.5.
- **Estimación:** 3–4 días (incluye reemplazar los datos demo del admin).

### F2.2 — Transferencia bancaria
- **Archivos:** `store_settings` (datos de la cuenta), `components/checkout.tsx` (mostrar datos +
  opción "adjuntar comprobante"), admin (botón "Marcar pagado" al ver el comprobante).
- **Pasos:** el cliente elige "Transferencia", ve los datos de la cuenta, sube comprobante (opcional en
  v1) y queda en "Pendiente"; el admin confirma manualmente → "Pagado".
- **Criterio:** flujo completo transferencia → confirmación manual en admin.
- **Dependencias:** F2.1, F0.3 (campo de cuenta en store_settings).
- **Estimación:** 2 días.

### F2.3 — Webpay Plus (débito/crédito)
- **Archivos:** Route Handlers `app/api/webpay/*` (crear transacción, retorno, confirmación), SDK de
  Transbank a validar (`transbank-sdk` u oficial) — *verificar librería y docs antes de integrar*.
- **Pasos:** crear transacción con el monto, redirigir a Webpay, recibir retorno, confirmar, marcar la
  orden "Pagado"; manejar fallos/cancelación.
- **Decisión:** D8 (puede moverse a F3 si se prioriza transferencia).
- **Criterio:** pago real con tarjeta en ambiente de prueba (TBK) y luego producción; orden pasa a
  "Pagado" solo tras confirmación.
- **Dependencias:** F2.1; credenciales Transbank del dueño.
- **Estimación:** 3–5 días (incluye trámites de credenciales).

### F2.4 — Panel administrable desde el celular (D12)
- **Archivos:** `components/admin-dashboard.tsx` (navegación responsive).
- **Pasos:** en pantallas pequeñas, reemplazar la sidebar oculta por un drawer (botón hamburguesa) o
  bottom-nav; revisar tablas (scroll horizontal) y modales en pantallas táctiles.
- **Criterio:** todas las secciones del panel operativas en celular, tablet y desktop.
- **Estimación:** 1.5–2 días.

### F2.5 — Contenido editable (conectar `store_settings`)
- **Archivos:** `lib/store-config.ts` (leer desde Supabase con fallback a constantes), admin sección
  "Contenido" (editar nombre, hero, historia, WhatsApp, Instagram, datos de transferencia y, desde
  **§0.15 / D29**, la **paleta de la tienda**), storefront.
- **Criterio:** el dueño edita textos/fotos/colores de la home desde el panel y el cambio se ve en la tienda.
- **Dependencias:** F0.3.
- **Estimación:** 2 días.

### F2.6 — Botón flotante de WhatsApp
- **Archivos:** `components/whatsapp-button.tsx` (nuevo), `store_settings`.
- **Ajuste A1 (2026-09-14):** el botón debe ser **redondo y solo con el ícono de WhatsApp** (sin la
  palabra «WhatsApp»): `h-14 w-14 rounded-full grid place-items-center`, ícono centrado y
  `aria-label="Dudas por WhatsApp"`. Mantener el verde `#25d366` y la esquina inferior derecha.
- **Criterio:** el botón abre WhatsApp con el número del negocio desde tienda, ficha y checkout, sin
  mostrar texto visible.
- **Estado:** IMPLEMENTADO (ver §0.6).

### F2.7 — Fix: «seguir comprando» reinicia el carrito (A2)
- **Archivos:** `lib/cart.ts` (nuevo), `components/storefront.tsx`, `components/product-detail.tsx`,
  `app/checkout/page.tsx`.
- **Causa:** el carrito tenía **dos dueños** sobre el mismo `localStorage["store-cart"]`: la ficha
  escribía el storage por fuera del estado de React y el storefront **persistía su estado vacío en el
  primer render**, restaurando lo guardado dentro de un `setTimeout` cuyo cleanup podía cancelar la
  restauración → el carrito se perdía al volver a la tienda.
- **Pasos:** centralizar el carrito en `lib/cart.ts` (una sola clave, store externo con
  `useSyncExternalStore` + `storage` event) y que la carta, la ficha y el checkout usen el mismo store.
- **Criterio:** desde la ficha, agregar al carrito → «seguir comprando» → se conservan ítems y
  cantidades (y el contador del header los refleja); recargar también los conserva.
- **Estado:** IMPLEMENTADO (ver §0.6).

### F2.8 — Admin › Productos: botón y modal «Categorías» (A3)
- **Archivos:** `components/admin-dashboard.tsx`, `backend/app/main.py`, `backend/tests/`.
- **Estado previo de la API:** solo `GET` (público) y `POST` (admin) de categorías.
- **Pasos:** agregar `PUT`/`DELETE /api/categories/{id}` con `require_admin` (al borrar, los productos
  quedan «Sin categoría» porque `products.category_id` es `ON DELETE SET NULL`); botón **«Categorías»**
  junto a «Nuevo producto» que abre un modal con la lista, alta, edición en línea y borrado con
  confirmación; refrescar el nombre de categoría en la tabla de productos tras cada cambio.
- **Criterio:** desde el panel se crea, renombra y elimina una categoría en celular y escritorio; el
  selector de categoría del editor refleja los cambios; `pytest` cubre los endpoints nuevos.
- **Estado:** IMPLEMENTADO (ver §0.6).

### F2.9 — Confirmación de cuenta por correo con código de 6 dígitos (A4, D14)
- **Archivos:** `backend/app/emails.py` (nuevo), `backend/app/models.py`, `backend/app/schemas.py`,
  `backend/app/config.py`, `backend/app/main.py`, `backend/tests/`, `app/api/auth/verify/route.ts`,
  `app/api/auth/resend/route.ts`, `app/api/auth/login/route.ts`, `app/login/page.tsx`, `.env.example`.
- **Pasos:** columnas `profiles.email_verified` + `verification_*` (código hasheado, vencimiento,
  envíos e intentos) con migración idempotente al arrancar (las cuentas existentes quedan confirmadas);
  `register` genera el código, lo envía con la plantilla del negocio y **no** emite sesión;
  `verify-email` confirma y emite la sesión; `resend-code` respeta espera y máximo de reenvíos; el login
  responde `403` si el correo no está confirmado; `/login` gana el paso del código de 6 dígitos.
- **Criterio:** llega un correo personalizado con el código; sin confirmar no se entra; código incorrecto
  o vencido se rechaza con mensaje claro; Google entra confirmado.
- **Estado:** IMPLEMENTADO (ver §0.6). **Pendiente externo:** credenciales y dominio de Resend.

### F2.10 — Quitar del footer el acceso a cuenta / panel (A5)
- **Archivos:** `components/store-shell.tsx`, `lib/account.ts` (nuevo).
- **Pasos:** eliminar del **footer** el enlace «Cuenta»/«Mi cuenta»/«Panel admin»; **mantener el botón del
  header**, que resuelve `/admin` para el admin, `/cuenta` para el cliente y `/login` para el invitado.- **Criterio:** el footer no ofrece accesos de cuenta ni de panel; el botón del header sigue llevando al panel del admin.
- **Estado:** IMPLEMENTADO (ver §0.6).

### F2.11 — Sesión compartida: un solo `GET /api/auth/me` (A13)
- **Archivos:** `lib/session-client.ts` (nuevo), `lib/account.ts`, `lib/api.ts`, `app/login/page.tsx`,
  `app/checkout/page.tsx`, `app/cuenta/page.tsx`, `components/admin-dashboard.tsx`.
- **Causa:** cada pantalla pedía la sesión por su cuenta y, en desarrollo, React monta los efectos dos
  veces → dos llamadas idénticas al arrancar y una nueva en cada navegación.
- **Pasos:** dejar la sesión en una **promesa compartida** con snapshot estable y exponerla con
  `useSyncExternalStore` (`useSession()`); el token sigue viviendo solo en la cookie httpOnly; al iniciar
  sesión se refresca y al cerrarla se reinicia.
- **Criterio:** en cualquier pantalla se ve **una** lectura de `/api/auth/me` por carga, y el header, la
  cuenta, el checkout y el panel comparten la misma sesión.
- **Estado:** IMPLEMENTADO (ver §0.9).

### F2.12 — `/cuenta` dentro del layout de la tienda (A14)
- **Archivos:** `app/cuenta/page.tsx`, `components/store-shell.tsx`.
- **Pasos:** usar `StoreHeader`/`StoreFooter` (mismos que carta, ficha y checkout) con los ajustes de
  `/api/settings`; quitar el «Volver a la tienda» y el nombre de tienda suelto del final; contador del
  carrito y botón de WhatsApp.
- **Criterio:** la cuenta mantiene header y footer idénticos a la tienda y no queda ningún enlace
  redundante de vuelta.
- **Estado:** IMPLEMENTADO (ver §0.9).

### F2.13 — Última versión conocida cuando la API no responde (A15, D20)
- **Archivos:** `lib/offline-cache.ts` (nuevo), `components/storefront.tsx`, `components/product-detail.tsx`,
  `app/cuenta/page.tsx`, `app/checkout/page.tsx`.
- **Pasos:** guardar en `localStorage` la última respuesta buena de la **vidriera** (catálogo, ajustes y
  ficha por slug) con claves versionadas, y usarla **solo cuando la petición falla**. En el **checkout** no
  se respalda la agenda: si la API no responde se muestra un aviso y se deshabilita la confirmación.
- **Criterio:** con la API o la base de datos caídas, el cliente ve la **última** carta y la última ficha
  (no los demo); cuando la API responde, manda la API; en el checkout el cliente sabe que no se pueden
  registrar pedidos en vez de descubrirlo al final. El panel mantiene su error explícito.
- **Dependencias:** ninguna de backend.
- **Estado:** IMPLEMENTADO (ver §0.9).

### F2.14 — Selects del panel sin el brillo nativo (A17)
- **Archivos:** `app/globals.css`, `components/admin-dashboard.tsx`, `components/admin-agenda.tsx`,
  `components/product-detail.tsx`.
- **Pasos:** clase `select-field` (`appearance: none` + flecha propia del mismo verde de la marca) y uso
  en los `<select>` del panel, con el estado marcado en el borde (`hover`/`focus`).
- **Criterio:** ningún select muestra el resaltado azul del navegador al pasar el mouse; el campo se
  comporta como el botón del filtro de precio (borde que se oscurece).
- **Estado:** IMPLEMENTADO (ver §0.9).

### F2.17 — Paleta cálida en página principal y ficha (A25, D24)
- **Archivos:** `app/globals.css`, `components/store-shell.tsx`, `components/storefront.tsx`,
  `components/product-detail.tsx`, `components/cart-drawer.tsx`.
- **Pasos:** definir la paleta **#D7CDC1 / #D9B391 / #846851 / #401A04 / #808C6D** (con blanco y negro de
  apoyo) en la clase `theme-bosque` de `globals.css` —incluidos los visuales de hero y producto— y
  aplicarla al `<main>` de la tienda y la ficha. Como el header/footer se comparten con `/checkout` y
  `/cuenta`, agregar la prop **`warm`** a `StoreHeader` en lugar de cambiar la identidad global (el footer
  pasa a ser cálido en todo el sitio en **§0.14 / D28**). Los indicadores de stock conservan su semántica verde/ámbar/rojo.
- **Criterio:** la página principal y la ficha se ven en la paleta cálida (header, footer, secciones,
  tarjetas y carrito lateral) mientras `/checkout` y `/cuenta` mantienen los tonos anteriores en su
  contenido y su header (el footer es cálido en todas las páginas desde **D28**).
- **Estado:** IMPLEMENTADO (ver §0.11).

### F2.18 — Footer profesional con contacto y copyright (A28, D27)
- **Archivos:** `components/store-shell.tsx`, `lib/store-config.ts`, `components/checkout-shell.tsx`.
- **Pasos:** rehacer `StoreFooter` en tres bloques (marca con una línea del negocio, **Contacto** con correo,
  teléfono, WhatsApp e Instagram, y **Tienda** con las anclas de sección) más una franja inferior con
  **© año + nombre** y la ubicación; cada fila de contacto se dibuja solo si está configurada. Agregar
  `contact_email` a `StoreConfig`/`ApiSettings`/`mergeSettings` (el dato se guardaba en la API pero no
  llegaba al frontend) y exponer los tres teléfonos/correo en `ShellConfig`.
- **Criterio:** carta, ficha y cuenta muestran el mismo footer profesional con los datos de Contenido y el
  año en curso; sin datos de contacto configurados no quedan filas vacías; el footer del checkout sigue
  siendo el mínimo de la referencia (D15).
- **Estado:** IMPLEMENTADO (ver §0.13).

### F2.19 — Footer cálido único en todo el sitio (A29, D28)
- **Archivos:** `components/store-shell.tsx`, `components/storefront.tsx`, `components/product-detail.tsx`,
  `app/globals.css` (comentario del tema).
- **Pasos:** quitar la prop **`warm`** de `StoreFooter` y dejar sus colores fijos en la paleta cálida
  (`#401a04` de fondo, `#d7cdc1` de texto, `#d9b391` en títulos y enlaces, `#846851` en la línea
  divisoria), eliminando la rama verde que queda sin uso (D22). Retirar `warm` de las llamadas en la carta
  y la ficha.
- **Criterio:** el pie de la carta, la ficha y la cuenta es **idéntico** (mismos colores y bloques) sin
  pasar ninguna prop; el header mantiene su prop `warm` (la cuenta conserva ahí la identidad anterior) y el
  footer mínimo del checkout sigue igual (D15).
- **Estado:** IMPLEMENTADO (ver §0.14).

### F2.20 — Colores de la tienda editables (A30, D29)
- **Archivos:** `lib/theme.ts` (nuevo), `app/globals.css`, `components/storefront.tsx`,
  `components/product-detail.tsx`, `components/store-shell.tsx`, `components/cart-drawer.tsx`,
  `app/cuenta/page.tsx`, `components/admin-dashboard.tsx`, `backend/app/*`, `backend/tests/test_api.py`.
- **Pasos:** convertir la paleta cálida en variables CSS (`--brand-*`) con los tonos actuales como valor
  por defecto y derivar con `color-mix` lo que no se edita; guardar los cinco tonos en
  `store_settings.theme_colors` (JSON, validado) y exponerlos en `GET/PUT /api/settings`; editarlos en
  Contenido con selector de color, hex y el **intercambio de tonos** entre sí; escribirlos en línea en el `<main>` de la
  carta, la ficha y la cuenta (de ahí los heredan header, carrito lateral y footer).
- **Criterio:** cambiar un tono en el panel y refrescar la tienda cambia ese tono en la carta, la ficha,
  el carrito y el footer; sin colores guardados la tienda se ve igual que antes; la API rechaza tonos
  desconocidos y valores que no sean hex de seis dígitos; el panel, el checkout y el contenido/header de
  la cuenta no cambian.
- **Estado:** IMPLEMENTADO (ver §0.15).

> **Gate F2:** flujo completo de compra probado (transferencia y, si aplica, Webpay en TBK) + panel en
> celular + `npm run build` OK.

---

## 5. Fase 3 — P2: Extras (dejar para el final)

> Objetivo: mejorar marca y retención. Orden interno intercambiable según prioridad del dueño.

### F3.1 — Notificación automática de WhatsApp al recibir pedido
- **Pasos:** decidir vía (D9): API de Meta (WhatsApp Cloud, requiere cuenta Business y token) vs.
  alternativa. Integración con el evento de nueva orden (F2.1) vía Route Handler o webhook.
- **Criterio:** al crearse una orden, llega notificación al chat del negocio.
- **Dependencias:** F2.1; decisión de proveedor.
- **Estimación:** 2–4 días (depende del proveedor).

### F3.2 — Feed de Instagram
- **Archivos:** `components/instagram-feed.tsx` (nuevo), `components/storefront.tsx`,
  `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/main.py`, `components/admin-dashboard.tsx`.
- **Pasos:** según **D11/D23**: sección al final de la página principal con el **iframe de un widget de
  terceros** (solo publicaciones, ancho completo), configurado con la URL que se pega en Contenido, más un
  botón con el glifo de Instagram al perfil. El footer conserva su enlace y el feed con token de Meta queda
  como alternativa.
- **Criterio:** con la URL del widget configurada, la página principal muestra «Nuestras últimas historias»
  con las publicaciones a ancho completo; sin widget, solo el botón al perfil; sin perfil ni widget, la
  sección no aparece.
- **Estimación:** 0.5–2 días.
- **Estado:** IMPLEMENTADO (2026-09-21, ver §0.11).

### F3.3 — Comentarios de clientes por producto
- **Pasos:** tabla `reviews` (product_id, autor, rating, comentario, status `pending`/`approved`) + RLS;
  UI en la ficha; moderación en el admin.
- **Decisión:** D10.
- **Criterio:** el cliente comenta; el comentario aparece tras aprobación del admin.
- **Dependencias:** F0.3 (tabla nueva — puede crearse aquí mismo), F1.1.
- **Estimación:** 2–3 días.

### F3.4 — Reportes y analítica
- **Archivos:** `components/admin-reports.tsx` (nuevo), `components/admin-dashboard.tsx`.
- **Pasos:** conectar la sección "Reportes" del admin a datos reales (ventas, ticket promedio, más
  vendidos desde `orders`/`order_items`), reemplazando los placeholders actuales. **Ampliada (2026-09-16,
  D21):** las métricas que el dueño aprobó en §0.9 — ventas + ticket promedio, más y menos vendidos, sin
  ventas, ventas por punto de retiro, pedidos por día y franja, ingresos por categoría y alerta de
  reposición — con un **selector de período**: presets de **7 días** y **30 días** (que sí comparan contra
  el período anterior) y **rango personalizado por meses enteros** (A18), más «Todo».
- **Criterio:** el admin muestra métricas reales del período elegido; con el rango personalizado puede
  mirar desde un mes hasta un año de datos y todas las tablas se calculan sobre ese tramo.
- **Dependencias:** F2.1.
- **Estimación:** 2 días.
- **Estado:** IMPLEMENTADO (2026-09-16, ver §0.9).

---

## 6. Verificación y QA transversal

- **Automático (cada tarea):** `npx tsc --noEmit` · `npm run lint` · `npm run build`.
- **Backend (solo si se mantiene FastAPI):** `pytest` en `backend/`.
- **QA manual por fase:**
  - Cliente: carta → ficha → carrito → día/franja/zona → pago → confirmación.
  - Admin: productos (fotos, alérgenos, stock), agenda (bloqueo), pedidos (persistidos), contenido.
  - **Dispositivos:** celular, tablet y desktop (requisito explícito del panel auto-gestionable).
  - Concurrencia: dos clientes comprando el último producto (no debe sobrevenderse).
  - **Carrito (A2/F2.7):** agregar desde la ficha → «seguir comprando» → el carrito y el contador se
    mantienen; recargar la página también.
  - **Cuentas (A4/F2.9):** registro → correo con código → sin confirmar no entra → código correcto entra;
    código vencido/incorrecto y reenvíos fuera de plazo se rechazan con mensaje claro.
  - **Categorías (A3/F2.8):** crear, renombrar y eliminar una categoría; los productos afectados quedan
    «Sin categoría».

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Decisiones D1–D19 sin resolver bloquean fases | Aprobar los defaults de la sección 0 y las decisiones nuevas (D14–D19); reabrir por tarea |
| Al migrar se eliminan las franjas globales antiguas (no pertenecen a ningún punto) | Eran configuración de la etapa demo; el dueño las vuelve a crear dentro de cada punto desde Agenda (§0.8) |
| El correo de confirmación no llega (dominio de Resend sin verificar o spam) | Verificar el dominio del negocio antes de abrir el registro; mientras tanto probar con `onboarding@resend.dev`; el registro avisa si el envío falla |
| Las cuentas existentes quedarían bloqueadas al exigir confirmación | La migración las marca confirmadas (PLAN F2.9) |
| Webpay depende de credenciales/trámites externos | Partir con transferencia (F2.2); Webpay en paralelo |
| Notificación WhatsApp depende de cuenta Business de Meta | Botón `wa.me` cubre el 80% del valor; automatización queda en F3 |
| Token de Instagram caduca | v1 con enlace estático; embed real opcional |
| Migración de schema rompe RLS existente | Probar políticas nuevas en staging antes de producción |
| Backend FastAPI duplica lógica si se mantiene | **Resuelto (D7):** la API FastAPI dockerizada es la única fuente de verdad; Supabase quedó fuera |

## 8. Próximos pasos inmediatos

1. Crear el OAuth Client en Google Cloud Console y definir `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
   (activa el login de Google; mientras tanto funciona el de correo/contraseña).
2. Reiniciar `next dev` con el `.env.local` (`AUTH_JWT_SECRET` igual al backend) y verificar el flujo:
   cliente → `/cuenta`, admin → `/admin`.
3. Webpay Plus (F2.3): solicitar credenciales TBK e integrar el SDK en `app/api/webpay/*`.
4. Seed inicial de agenda desde el panel Agenda: **puntos de retiro y encuentro de San Javier y Talca**
   con su ubicación y **sus franjas** (días + horario, §0.8) y los cierres (semanales y de fecha).
5. Decidir proveedor de la notificación automática de WhatsApp (F3.1).
6. **Ajustes de §0.6 (2026-09-14):** ya implementados (WhatsApp redondo, fix del carrito, categorías,
   confirmación por correo, footer sin accesos de cuenta y ficha/checkout dentro del layout).
7. **Confirmación por correo (D14 / F2.9):** crear la cuenta y verificar el dominio en Resend, y definir
   `RESEND_API_KEY` / `RESEND_EMAIL_FROM` en el entorno de la API para activar el código de 6 dígitos.
8. **Revisar con simplysweet.cl abierto (§9):** comparar ficha y checkout en móvil y escritorio y anotar
   los ajustes finos que falten.
9. **Ajustes de §0.9 (2026-09-16):** ya implementados (sesión compartida, cuenta dentro del layout,
   caché de última versión conocida, reportes del negocio y selects del panel). Falta **cargar pedidos de
   prueba y mirar los Reportes en pantalla** para decidir si el orden de las métricas es el que espera el
   dueño, y confirmar en el navegador que el panel sigue mostrando su error explícito cuando la API se
   cae (D20 no lo cubre a propósito).
10. **Ajustes de §0.13 (2026-09-22):** ya implementados (8 productos por página **fijos** y footer
    profesional con contacto y copyright). Falta **reconstruir la imagen de la API** (se retira
    `store_settings.products_per_page`), **cargar el correo y el teléfono reales** en Contenido para que
    el footer los muestre, y revisar la carta y el footer en móvil y escritorio.
11. **Ajustes de §0.14 (2026-09-22):** ya implementados (el footer es cálido en **carta, ficha y cuenta**
    con una sola definición). Falta revisarlo en móvil y decidir si el **header** de `/cuenta` también pasa
    a la paleta cálida.
12. **Ajustes de §0.15 (2026-09-22):** ya implementados (los cinco tonos de la tienda se editan en
    **Contenido › Colores**). Falta **reconstruir la imagen de la API** (columna nueva
    `store_settings.theme_colors`), **elegir con el dueño la paleta definitiva** y guardarla desde el
    panel, y comprobar en el navegador que el footer y el carrito acompañan el cambio.

---

## 9. Referencia de diseño y UX — https://simplysweet.cl

Referencia pedida por el dueño (2026-09-14), **mantenida aquí** para las tareas de ficha de producto y
checkout. Es **solo referencia de estructura e interacción: no se copia contenido, textos, fotos ni
marca**.

**Qué es la referencia:** una tienda **Shopify** (verificado en su `sitemap.xml`: expone
`sitemap_products_1.xml`, `sitemap_collections_1.xml`, etc.). Por eso su checkout es el **checkout estándar
de Shopify**, y esa es la estructura que se replica.

**Qué se tomó de la referencia (aplicado):**

1. **Ficha de producto (F1.9, A6):** la página de producto **no rompe el layout de la tienda** — conserva
   el **header principal y el footer** — y **no incluye un enlace «Volver a la tienda»**. Implementado con
   `components/store-shell.tsx` (`StoreHeader`/`StoreFooter`).
2. **Checkout (F2.1, A6):** `components/checkout-shell.tsx` + `app/checkout/page.tsx`:
   - **Header mínimo:** solo el logo de la tienda y «Seguir comprando», sin la navegación completa.
   - **Dos columnas:** formulario a la izquierda y **resumen del pedido fijo** a la derecha, con el botón
     de confirmación dentro del resumen (equivalente al «Pagar ahora» de la referencia).
   - **Resumen plegable en móvil** (`<details>`) arriba del formulario, como hace la referencia.
   - **Secciones separadas por líneas finas** (sin tarjetas), con **etiqueta sobre cada campo** y
     **opciones tipo radio** para entrega y pago (así se ven los métodos de envío y pago en Shopify).
   - **Administración del espacio del resumen (arreglado 2026-09-14):** la columna del resumen se ancla
     con `sticky top-6` y se limita a `max-h-[calc(100vh-3rem)]` (24 px de margen arriba y abajo), como el
     resumen fijo de la referencia. Dentro, es una **columna flex**: la **lista de ítems** es lo único que
     se desplaza (`flex-1 min-h-0 overflow-y-auto`) y **totales, botón «Confirmar pedido» y avisos** son
     bloques `shrink-0`. Con eso el botón nunca queda fuera de la pantalla, **por largo que sea el pedido**
     (antes, al ser el resumen fijo más alto que el viewport, su parte baja quedaba recortada e
     inalcanzable porque el `sticky` la mantenía fuera del scroll de la página).
   - **Footer de contacto:** en la referencia son enlaces a políticas; aquí son los enlaces del negocio
     (WhatsApp, Instagram, sobre el negocio, productos) más «Compra segura».
   - **Pantalla de confirmación** con el resumen del pedido (número, entrega, fecha, pago y total).
3. **Datos del checkout** (los únicos que se piden): nombre, teléfono, correo, **punto de retiro**
   (retiro presencial o punto de encuentro, con su ubicación y sus franjas), **día y franja horaria**
   (hasta **2 semanas** de anticipación; el día se limita a los que ese punto atiende, §0.8) y **método de
   pago**. La dirección (despacho a domicilio) y la nota del
   pedido se retiraron en **§0.7 (D16 y D17)**.
4. **Cómo seguir usándola:** abrirla en el navegador (móvil y escritorio) antes de tocar estas pantallas y
   anotar aquí cualquier ajuste fino que falte (orden de los pasos, textos del resumen, tratamiento de las
   fotos en la ficha).
5. **Catálogo de productos destacados (A24, §0.11):** se adopta su apartado de **productos
   destacados/más vendidos**: título sobre el grid, **filtros de categoría arriba** y tarjetas **solo con
   foto, nombre y precio** (sin categoría ni descripción).
6. **Instagram (A23, §0.11):** la referencia para esa sección es **https://www.studiopasacademy.com**:
   las últimas publicaciones al final del body, de borde a borde y sin encabezado de perfil, resueltas con
   el **iframe de un widget de terceros** (D23). **Qué usa la referencia:** sus widgets son de **Elfsight**
   (`phosphor.utils.elfsightcdn.com` en las imágenes de los posts y en el widget de reseñas de Google); el
   sitio está hecho en WordPress (Elementor + WooCommerce). Ojo con el plan gratis de Elfsight: tope de
   ~200 vistas/mes, frente a las ~2.000 de SociableKIT.

> El contenido del sitio se renderiza en el cliente, así que no se puede extraer con herramientas
> automáticas: lo verificable fue su plataforma (Shopify) y, con eso, la estructura de su checkout.