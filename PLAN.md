# Plan de Implementación — BOSQUE

**Basado en:** RPD.md v1.0
**Fecha:** 2026-09-08
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
| D4 "Bajo pedido" | `allow_backorder` + `lead_time_days` (días de anticipación mostrados al cliente) |
| D5 Slots horarios | Franjas fijas configurables en admin (tabla `time_slots`) |
| D6 Zonas de entrega | Domicilio solo San Javier; retiro presencial San Javier + Talca; sin tarifa por ahora |
| D7 Fuente de verdad | **RESUELTA: API FastAPI dockerizada en AWS como única fuente de verdad** (ver actualización abajo) |
| D8 Orden de pagos | Transferencia primero (confirmación manual); Webpay en fase posterior |
| D9 WhatsApp | v1: enlace `wa.me` (botón flotante); notificación automática se evalúa aparte |
| D10 Comentarios | Anónimos, con moderación del admin antes de publicar |
| D11 Instagram | v1: sección con enlace oficial; embed real queda como mejora |
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
- La implementación completa (F0–F3) ya está realizada y refactorizada a esta arquitectura; los únicos
  pendientes son externos (credenciales TBK para Webpay, webhook de WhatsApp, seed de agenda/zonas).

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
- `artisan_seal boolean` / `sustainable boolean` (sello artesanal/sustentable).
- `allergens text[]` (códigos: `gluten`, `lacteos`, `frutos-secos`, `huevo`, `mani`, `soja`, `sesamo`, …).
- `allow_backorder boolean default false` + `lead_time_days integer default 0` (bajo pedido con
  anticipación).
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
  ingredientes, sello artesanal/sustentable; selector de cantidad + "agregar al carrito"; productos
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
  sin backorder) o **Bajo Pedido** (allow_backorder, con "X días de anticipación"); deshabilitar el
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

### F1.6 — Agenda: selección de día y franja horaria
- **Archivos:** nuevo paso en el carrito/checkout (`components/checkout.tsx` o `app/checkout/page.tsx`),
  consultas a `time_slots` y `closed_days`.
- **Pasos:** el cliente elige fecha (calendario que **deshabilita días cerrados** y días sin producción)
  y luego la franja; validar que la franja quede disponible.
- **Decisión:** D5.
- **Criterio:** no se puede elegir un día cerrado ni una franja no configurada; la selección llega al
  resumen del pedido.
- **Dependencias:** F0.3.
- **Estimación:** 2–3 días.

### F1.7 — Bloqueo de días (admin)
- **Archivos:** `components/admin-dashboard.tsx` (nueva sección "Agenda" dentro de Configuración o
  Pedidos), gestión de `closed_days` y de `time_slots`.
- **Pasos:** CRUD de franjas (habilitar/deshabilitar) y de días cerrados (fecha + motivo).
- **Criterio:** desde el panel se cierra un día o se ajusta una franja y el checkout lo refleja al
  instante.
- **Dependencias:** F1.6.
- **Estimación:** 1.5 días.

### F1.8 — Zonas de entrega (San Javier / Talca)
- **Archivos:** `components/checkout.tsx`, admin (`shipping_zones` CRUD), `lib/store-config.ts` o
  `store_settings`.
- **Pasos:** opciones de despacho: **Retiro presencial** (San Javier o Talca) y **A domicilio** (solo
  San Javier); el cliente elige zona al reservar; guardar `shipping_zone_id` + `fulfillment` en la
  orden.
- **Decisión:** D6.
- **Criterio:** no se puede pedir domicilio fuera de San Javier; el admin puede activar/desactivar zonas.
- **Dependencias:** F0.3, F1.6.
- **Estimación:** 1.5–2 días.

> **Gate F1:** `npx tsc --noEmit`, `npm run lint`, `npm run build` OK + revisión del dueño (flujo
> cliente completo en móvil y desktop).

---

## 4. Fase 2 — P1: Checkout real, pagos y panel

> Objetivo: cobrar (transferencia y luego Webpay), persistir pedidos de verdad, y administrar todo
> desde cualquier dispositivo.

### F2.1 — Checkout completo que persiste la orden
- **Archivos:** `app/checkout/page.tsx` (o flujo en el drawer), `lib/supabase/`, admin (leer órdenes
  reales desde `orders`/`order_items`).
- **Pasos:** formulario con datos de contacto (nombre, teléfono, email, dirección si es domicilio),
  resumen de carrito, día/franja/zona (de F1.6–F1.8), método de pago, y **persistir** en Supabase
  `orders` + `order_items`; el admin pasa a leer órdenes reales (hoy son datos demo en memoria).
- **Criterio:** al confirmar, la orden aparece en el admin con sus ítems, fecha, franja, zona y estado
  "Pendiente"; el stock decrementa (F1.5) y el carrito se limpia.
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
  "Contenido" (editar nombre, hero, historia, WhatsApp, Instagram, datos de transferencia), storefront.
- **Criterio:** el dueño edita textos/fotos de la home desde el panel y el cambio se ve en la tienda.
- **Dependencias:** F0.3.
- **Estimación:** 2 días.

### F2.6 — Botón flotante de WhatsApp
- **Archivos:** `components/storefront.tsx` (o componente `whatsapp-button.tsx` nuevo), `store_settings`.
- **Pasos:** botón flotante con enlace `wa.me/<teléfono>` + mensaje prefabricado; teléfono
  configurable.
- **Criterio:** el botón abre WhatsApp con el número del negocio desde cualquier página.
- **Dependencias:** F0.3 (campo teléfono), F2.5 (config).
- **Estimación:** 0.5–1 día.

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
- **Pasos:** según D11: v1 sección estática/enlace en el footer; mejora: embed con token de Meta
  (considerar caducidad del token).
- **Criterio:** el footer muestra el enlace oficial (y el embed si se aprueba).
- **Estimación:** 0.5–2 días.

### F3.3 — Comentarios de clientes por producto
- **Pasos:** tabla `reviews` (product_id, autor, rating, comentario, status `pending`/`approved`) + RLS;
  UI en la ficha; moderación en el admin.
- **Decisión:** D10.
- **Criterio:** el cliente comenta; el comentario aparece tras aprobación del admin.
- **Dependencias:** F0.3 (tabla nueva — puede crearse aquí mismo), F1.1.
- **Estimación:** 2–3 días.

### F3.4 — Reportes y analítica
- **Pasos:** conectar la sección "Reportes" del admin a datos reales (ventas, ticket promedio, más
  vendidos desde `orders`/`order_items`), reemplazando los placeholders actuales.
- **Criterio:** el admin muestra métricas reales del período.
- **Dependencias:** F2.1.
- **Estimación:** 2 días.

---

## 6. Verificación y QA transversal

- **Automático (cada tarea):** `npx tsc --noEmit` · `npm run lint` · `npm run build`.
- **Backend (solo si se mantiene FastAPI):** `pytest` en `backend/`.
- **QA manual por fase:**
  - Cliente: carta → ficha → carrito → día/franja/zona → pago → confirmación.
  - Admin: productos (fotos, alérgenos, stock), agenda (bloqueo), pedidos (persistidos), contenido.
  - **Dispositivos:** celular, tablet y desktop (requisito explícito del panel auto-gestionable).
  - Concurrencia: dos clientes comprando el último producto (no debe sobrevenderse).

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Decisiones D1–D12 sin resolver bloquean fases | Aprobar los defaults de la sección 0; reabrir por tarea |
| Webpay depende de credenciales/trámites externos | Partir con transferencia (F2.2); Webpay en paralelo |
| Notificación WhatsApp depende de cuenta Business de Meta | Botón `wa.me` cubre el 80% del valor; automatización queda en F3 |
| Token de Instagram caduca | v1 con enlace estático; embed real opcional |
| Migración de schema rompe RLS existente | Probar políticas nuevas en staging antes de producción |
| Backend FastAPI duplica lógica si se mantiene | D7: una sola fuente de verdad (recomendado Supabase) |

## 8. Próximos pasos inmediatos

1. Aprobar los defaults de decisiones (sección 0) o marcarlos en el RPD.
2. Ejecutar **F0.1** (commit del trabajo pendiente) y **F0.2** (decisión D7).
3. Programar la migración **F0.3** del schema.
4. Iniciar **F1.1 + F1.2** (ficha con fotos) — el bloque que desbloquea la percepción del producto.