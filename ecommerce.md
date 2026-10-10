# Análisis competitivo — Tienda BOSQUE vs. Shopify / Jumpseller / WooCommerce

**Producto:** Tienda BOSQUE — software a medida para la tienda Bosque **y** plantilla de e-commerce
reutilizable (Next.js 16 + FastAPI/PostgreSQL)
**Fecha:** Octubre 2026
**Alcance:** comparación de **precios de mercado**, **características** y **mejoras a la plantilla**.
**Base:** características reales tomadas de `RPD.md` (D1–D54) y `PLAN.md` (pendientes §4 y Webpay §5).

> **Idea clave:** BOSQUE se hizo a la medida de la tienda Bosque, pero **no es un desarrollo de un
> solo uso**: su **base es estilosa y funcional**, y está pensada para **modificarse y reutilizarse**
> en otros negocios (rebranding por paleta + editor visual). Esto cambia el modelo de negocio: no solo
> se venden desarrollos a medida, también **adaptaciones rápidas de la plantilla**.

> **Nota de conversión:** dólar referencial **1 USD ≈ 950 CLP** (variable). Los precios de las
> plataformas SaaS se publican en USD o CLP según la plataforma; acá se normalizan a CLP para comparar.

---

## 1. Resumen ejecutivo

1. **El mercado se cobra de dos formas:** un **SaaS mensual** (Shopify, Jumpseller) que incluye hosting
   y soporte pero **no es del cliente** y suele cobrar **comisión por venta**; o **software libre +
   infraestructura y mantención** (WooCommerce), más barato de licencia pero **exige soporte técnico
   permanente**.
2. **BOSQUE rompe el esquema:** es un **activo propio del cliente** (el código es de la tienda), **sin
   comisión de plataforma**, con flujo **a medida** para repostería (bajo pedido, retiro por punto,
   envío por comuna, alérgenos, Instagram propio, editor visual).
3. **El costo de infraestructura es bajo** (~14.000–30.000 CLP/mes bien optimizado; ~50.000–85.000 CLP
   si se usa AWS "completo"). Ese es el piso real de cualquier plan de mantención.
4. **La brecha principal frente a los SaaS** está en funciones de **crecimiento/ventas**: variantes de
   producto, cupones, recuperación de carrito, email marketing, buscador, favoritos, gift cards,
   multi-idioma y sincronización con Mercado Libre / Google Shopping.
5. **No es solo software de un cliente: es una plantilla reutilizable.** La base ya es genérica y
   sirve tal cual (catálogo, carrito, checkout, Webpay, panel admin, comentarios, Instagram, offline);
   lo específico del rubro vive en la **configuración** (paleta de 5 colores + editor visual), no en el
   código. Cambiar de cliente es cambiar paleta, contenido y catálogo → **adaptaciones rápidas y
   baratas**, no desarrollos desde cero.
6. **Recomendación de trato:** vender **implementación (pago único) + mantención mensual sin comisión
   por venta**, posicionada entre Jumpseller BASIC y PRO, destacando que **no se cobra un % de cada
   venta** como sí hace Shopify en Chile, y ofreciendo una **tarifa de adaptación de plantilla** para
   clientes nuevos (ver §7.4).

---

## 2. Qué es BOSQUE (estado real del producto)

Según `RPD.md`, hoy la tienda **ya tiene**:

- **Catálogo** con fotos, categorías, ingredientes y **alérgenos**, ficha propia `/producto/[slug]` (SEO).
- **Carrito** en `localStorage` con limpieza de ítems huérfanos (D52).
- **Checkout** con **retiro presencial** (puntos + franjas + días cerrados, D18/D19/D32) y **envío por
  comuna** con tarifa y envío gratis sobre un umbral (D44).
- **Bajo pedido** (no bloquea por stock) con **días de preparación** por producto (D35).
- **Destacados** automáticos: 4 más recientes + 4 más vendidos (D54).
- **Cuenta de cliente** con dirección predeterminada, historial de pedidos y **login por correo/Google**.
- **Pago Webpay** (el único medio, D8/D34 — *pendiente de credenciales TBK*, `PLAN.md` §4).
- **Correo transaccional** al cliente y aviso a la tienda al registrar el pedido (Resend).
- **WhatsApp** flotante y coordinación del pago (notificación automática aún pendiente, D9).
- **Feed de Instagram propio** con renovación automática del token (D30/D31).
- **Editor visual** de la página: textos, foto del hero, logo (3 formas), encuadre y fotos (D38/D48–D53).
- **Paleta de marca editable** con 5 colores (D29).
- **Panel admin** completo: Productos, Pedidos, Agenda, Comentarios, Contenido y **Reportes** (D21/D42).
- **Comentarios moderados** por producto (D10/D45).
- **Modo sin conexión** (respaldo de la última versión conocida, D20).
- **SEO base**: App Router con SSR y ficha propia (pero **sin** campos meta propios ni datos
  estructurados, D22).

### 2.1 No es solo software a medida: también es una plantilla reutilizable

Aunque BOSQUE se construyó para la tienda Bosque (repostería, bajo pedido, Webpay, retiro/envío), la
base **no es un desarrollo desechable**: es una **plantilla completa, estilosa y funcional**, pensada
para **rebrandearse y reutilizarse** en otros negocios con muy poco trabajo.

- **La base ya es genérica y sirve tal cual:** catálogo con ficha propia, carrito, checkout, cuenta de
  cliente, Webpay, correo transaccional, panel admin (productos / pedidos / agenda / contenido /
  reportes), comentarios moderados, destacados, Instagram y modo offline. Nada de eso es exclusivo de
  la repostería.
- **Lo específico del rubro vive en la configuración, no en el código:** alérgenos, días de preparación,
  puntos de retiro, comunas y tarifas de envío son **datos** (panel + editor visual), no lógica rígida.
- **Rebranding casi sin código:** el color de marca son **5 variables de paleta editables** (D29), y el
  **editor visual** cambia textos, foto del hero, logo (3 formas) y encuadre en vivo (D38/D47–D53).
  Cambiar de cliente es cambiar **paleta + contenido + catálogo**.
- **El mismo código sirve para varios negocios:** con multi-tienda (ver §6) un solo despliegue puede
  atender varias marcas; sin multi-tienda, sigue siendo una **base de partida reutilizable** por cliente.
- **Implicación comercial:** la primera tienda es **desarrollo**; las siguientes son **adaptación de
  plantilla**, mucho más rápidas de cotizar, vender y entregar (ver §7.4).

---

## 3. Precios de mercado (octubre 2026)

### 3.1 Shopify

| Plan | Mensual (USD) | Anual (USD/mes) | ≈ CLP/mes (mensual) | Comisión pasarela 3ros |
|---|---|---|---|---|
| Starter | $5 | — | ~$4.750 | 2% |
| **Basic** | **$25** | **$19** | **~$23.750** | **2%** |
| Grow | $65 | $49 | ~$61.750 | 1% |
| Advanced | $399 | $299 | ~$379.050 | 0,6% |
| Plus | desde $2.300 | — | ~$2.185.000 | 0,2% |

- En **Chile no opera "Shopify Payments"**, así que se usa una **pasarela de terceros** (Webpay vía app)
  y **se aplica la comisión extra** de la tabla sobre cada venta.
- La mensualidad **no incluye** apps (la mayoría cobra aparte), tema premium, ni el costo de configurar
  Webpay.
- **Add-on POS Pro:** +$89 USD/mes por local.

### 3.2 Jumpseller (Chile)

| Plan | CLP/mes | Anual (−20%) | Comisión por venta |
|---|---|---|---|
| **BASIC** | **$7.200** | ~$5.760 | **0%** |
| PLUS | $14.400 | ~$11.520 | 0% |
| **PRO** | **$28.800** | ~$23.040 | 0% (suscripciones: 0,5%) |
| PREMIUM | $57.600 | ~$46.080 | 0% |
| ADVANCED | $176.000 | — | 0% |

- **0% de cargos de transacción** (la pasarela sí cobra su comisión).
- Integración **nativa de Webpay**, Instagram, Facebook, WhatsApp, Google Commerce, Mercado Libre
  (PRO en adelante), reservas, suscripciones, POS, gift cards, multi-idioma.
- Dominio gratis el primer año (planes anuales). Soporte por correo (respuesta 24 h estándar).
- **Es el competidor directo más barato y más parecido** al segmento PYME chilena.

### 3.3 WooCommerce

- **El plugin es gratis** (open source). El costo real es **infraestructura + plugins + mantención**.
- Hosting: **$3,99–$350 USD/mes** según calidad (compartido → managed).
- **Costo total realista (TCO):**
  - Tienda DIY básica: **~$500–$1.500 USD/año** (~$40.000–$120.000 CLP/año).
  - Tienda "seria": **$12.000–$65.000+ USD/año** con plugins premium, mantención y desarrollo.
  - El software no cobra comisión, pero **alguien tiene que mantenerlo** (seguridad, actualizaciones,
    respaldos): es un costo humano recurrente.

### 3.4 Costo de las transacciones (Webpay / Transbank)

Aplica a **todas** las opciones (incluidos BOSQUE, Jumpseller y WooCommerce con Webpay):

| Tarjeta | Comisión |
|---|---|
| Crédito | **2,35% + IVA** (nuevos comercios desde sept. 2026: **2,29%**) |
| Débito / Prepago | **1,75% + IVA** |

- No hay mensualidad por la pasarela en sí; el cargo es **por venta**.
- En ventas pequeñas el **cargo fijo mínimo** por transacción puede elevar el costo efectivo.

---

## 4. Costo real de BOSQUE (infraestructura)

BOSQUE no paga licencia mensual: se paga **infraestructura + operación**. Estimaciones:

| Componente | Opción ajustada (VPS) | Opción AWS "completa" |
|---|---|---|
| Cómputo (Next + API) | VPS $6–24 USD | ECS/EC2 + ALB ~$35–60 USD |
| Base de datos PostgreSQL | en el mismo VPS $0 | RDS ~$15–25 USD |
| Imágenes | volumen $1–3 USD | S3/EFS ~$1–5 USD |
| Dominio | ~$1 USD | ~$1 USD |
| Correo (Resend) | $0 (hasta 3.000/mes) | $0–20 USD |
| Instagram API | $0 | $0 |
| **Total estimado** | **~$8–30 USD** (≈$7.600–28.500 CLP) | **~$50–90 USD** (≈$47.500–85.500 CLP) |

> **Conclusión:** el piso del negocio mensual es **≈14.000–28.000 CLP** en su versión optimizada.
> Cualquier plan de mantención debe cubrir eso **con margen**.

---

## 5. Matriz comparativa de características

| Característica | **BOSQUE** | Shopify | Jumpseller | WooCommerce |
|---|---|---|---|---|
| Naturaleza | Activo propio (código del cliente) | SaaS | SaaS | Open source + infra |
| **Plantilla reutilizable / rebrand** | **Sí (código propio + paleta y editor visual)** | Sí (temas) | Sí (temas) | Sí (temas) |
| Costo mensual | Infra ~$8–90 USD | $5–2.300 USD | $7.200–176.000 CLP | Hosting $4–350 USD |
| **Comisión de plataforma** | **0%** | 2%–0,6% (3ros) | 0% | 0% |
| Catálogo ilimitado | Sí | Sí | Sí | Sí |
| **Variantes / SKU** | **No** (D22) | Sí | Sí | Sí |
| **Cupones / descuentos** | **No** | Sí | Sí | Sí |
| Gift cards | No | Sí | PRO+ | Plugin |
| Multi-idioma | No | Sí | 2–ilimitado | Plugin |
| **Recuperación de carrito** | **No** (base ya lista: Resend) | Sí | PLUS+ | Plugin |
| Email marketing | No (solo transaccional) | Sí | PLUS+ | Plugin |
| Feed de Instagram | **Sí (API propia)** | Sí | Sí | Plugin |
| WhatsApp | Botón + coordinación | App | Automatizaciones | Plugin |
| **Editor visual de la página** | **Sí (D38)** | Sí | Sí | Sí (página builder) |
| SEO (meta/JSON-LD) | Parcial (SSR, sin meta propios) | Sí | Sí | Sí (Yoast) |
| **Buscador con autocompletado** | **No** | Sí | PRO+ | Plugin |
| Favoritos / lista de deseos | No | App | PRO+ | Plugin |
| Notificación "nuevamente en stock" | No | App | PRO+ | Plugin |
| Programa de puntos / lealtad | No | App | — | Plugin |
| POS (venta presencial) | No | Sí | Sí | Plugin |
| Reservas / citas | No | App | Sí | Plugin |
| Suscripciones | No | App | Sí | Plugin |
| Mercado Libre / Google Shopping | No | Sí | PRO+ / Sí | Plugin |
| Pasarelas de pago | Solo Webpay | Muchas (3ros en Chile) | Muchas (Webpay nativo) | Muchas |
| Envío por comuna + tarifa + gratis | **Sí (D44)** | Sí (zonas) | Sí | Sí |
| Retiro en tienda + franjas | **Sí (D18)** | App | Sí | Plugin |
| **Alérgenos / ingredientes** | **Sí (nativo, D2)** | No | No | No |
| **Bajo pedido + días de preparación** | **Sí (D35)** | Config | Config | Plugin |
| Comentarios moderados | **Sí (D10/D45)** | Sí | PRO+ | Sí (plugin) |
| Reportes de negocio | **Sí (D21/D42)** | Sí (200+) | PRO+ | Plugin |
| Modo sin conexión | **Sí (D20)** | N/A | N/A | N/A |
| App móvil del panel | Web responsive | App nativa | Web | Web |
| Soporte | Del desarrollador | 24/7 (chat) | Correo | Comunidad + devs |
| Dependencia del proveedor | **Ninguna** | Alta | Alta | Media |

**Lectura de la tabla:**
- **BOSQUE gana** en: propiedad del activo, 0% comisión, UX hecha a medida, alérgenos/ingredientes,
  bajo pedido, retiro con franjas, Instagram propio, modo offline, **sin dependencia de un proveedor** y
  **reutilización como plantilla** (rebrand por paleta + editor visual, no por código).
- **BOSQUE pierde** en: funciones de **crecimiento y venta** (variantes, cupones, carrito abandonado,
  email marketing, buscador, favoritos, gift cards, multi-idioma) y en **sincronización con marketplaces**.
- **Jumpseller** es el competidor más duro en precio (BASIC $7.200) y ya trae gran parte de lo anterior.

---

## 6. Mejoras para la plantilla (qué agregar para competir)

Ordenadas por **impacto comercial / esfuerzo**. Las primeras 6 son las que cierran la brecha con los
SaaS; las de abajo son "nice to have".

> **Ojo con la plantilla:** varias de estas mejoras —multi-idioma, páginas editables, temas/paletas
> predefinidas y multi-tienda— también **suben el valor reutilizable** de BOSQUE, porque hacen que
> adaptarla a un cliente nuevo tome menos tiempo y menos código.

### Prioridad alta (cierra la brecha de ventas)

1. **Variantes de producto** (tamaño, sabor, porciones). Es la carencia más citada en repostería y
   hoy está fuera de alcance por D22. Requiere: modelo de variantes, precio/stock por variante y
   selector en la ficha.
2. **Cupones y descuentos** (por producto, por monto mínimo, primera compra, código). Muy esperado por
   el dueño y trivial de vender.
3. **Recuperación de carrito abandonado** por correo. **Resend ya está integrado** (D14/D8): solo falta
   capturar el carrito y un trabajo de fondo.
4. **Buscador de productos con autocompletado** y **filtros avanzados** (categoría, rango de precio,
   alérgenos). Mejora directa de conversión.
5. **SEO completo**: campos `meta_title`/`meta_description` por producto, **JSON-LD** (`Product`,
   `Offer`, `AggregateRating` con los comentarios que ya existen), `sitemap.xml` y Open Graph.
6. **Email marketing / newsletter** (aprovechando Resend): campañas simples y segmentos.

### Prioridad media (retención y ticket)

7. **Favoritos / lista de deseos.**
8. **Notificación "nuevamente en stock"** (correo al reponer un producto agotado).
9. **Gift cards / tarjetas de regalo.**
10. **Programa de puntos o lealtad.**
11. **Integración con couriers chilenos** (Chilexpress, Starken, Blue Express) con **número de
    seguimiento**. Hoy el envío es propio por comuna (D44), sin tracking.
12. **Pasarelas de pago adicionales** (MercadoPago, Flow, Khipu) para reducir fricción; hoy **solo
    Webpay** está previsto (D8/D34).
13. **Analítica**: GA4 + Meta Pixel + embudo de conversión dentro del panel de Reportes.

### Prioridad baja (escala)

14. **Multi-idioma** (solo si se apunta a mercado fuera de Chile).
15. **Sincronización con Google Shopping y Meta Catalog** (feed de productos).
16. **POS / venta presencial** para ferias y eventos.
17. **Páginas editables** (políticas, FAQ, "sobre nosotros" extendido); hoy D22 lo excluye.
18. **PWA** (instalable, notificaciones push).
19. **Reseñas con foto y rating agregado** (hoy hay comentarios moderados, D45; faltan fotos y estrellas).
20. **Exportación CSV / impresión de etiquetas** en el panel de pedidos.

---

## 7. Recomendación de precios: el "mejor trato" para tus clientes

Como BOSQUE es **propio** (no SaaS), el modelo correcto es **implementación + mantención**, no una
licencia mensual de plataforma.

### 7.1 Propuesta de planes

| Plan | Implementación (única) | Mantención mensual | Qué incluye |
|---|---|---|---|
| **Esencial** | $249.000 CLP | **$14.900 CLP/mes** | Hosting, dominio, SSL, respaldos, correo transaccional, soporte 48 h hábiles |
| **Crecimiento** | $349.000 CLP | **$24.900 CLP/mes** | Todo lo anterior + cambios de contenido, reportes, Instagram, soporte 24 h, respaldo 7 días |
| **Pro** | $499.000 CLP | **$49.900 CLP/mes** | Todo + integraciones courier/pasarelas extra, email marketing, SEO, soporte prioritario |

- **Descuento anual:** −15% pagando 12 meses por adelantado.
- **Sin comisión por venta** de la plataforma (solo la de Webpay: ~2,35% crédito / 1,75% débito).
- Ajustar la implementación al alcance real (carga de catálogo, diseño, credenciales Webpay, contenido).

### 7.2 Por qué es competitivo

| Escenario | Costo mensual | Comisión |
|---|---|---|
| **BOSQUE Crecimiento** | **$24.900 CLP** | **0%** |
| Jumpseller PRO | $28.800 CLP | 0% |
| Shopify Basic | ~$23.750 CLP | +2% de cada venta |

**Ejemplo con ventas de $1.000.000 CLP/mes:**
- **Shopify Basic:** $23.750 + 2% ($20.000) = **~$43.750/mes**.
- **BOSQUE Crecimiento:** $24.900 → **ahorro ~$18.850/mes (~$226.000 CLP/año)**.
- **Jumpseller BASIC ($7.200):** más barato, pero con **menos personalización y sin soporte humano
  dedicado**; BOSQUE se vende ahí por **UX a medida + activo propio**.

### 7.3 Argumentos de venta frente a cada competidor

- **vs. Shopify:** *"La tienda es tuya y no pagas ni un peso de comisión por cada venta."*
- **vs. Jumpseller:** *"Mismo precio que un plan PRO, pero el diseño, el flujo de retiro/envío y el
  editor son tuyos y hechos a medida para repostería."*
- **vs. WooCommerce:** *"Sin plugins que mantener ni actualizaciones que rompan cosas: registro, carrito,
  Webpay, reportes y agenda ya vienen integrados y soportados."*

### 7.4 Modelo de plantilla reutilizable (adaptación rápida)

Como la base ya está hecha, estilosa y reutilizable, **no todo cliente se vende igual**. Conviene
separar el desarrollo a medida de la simple **adaptación de la plantilla**:

| Tipo de encargo | Qué se hace | Precio sugerido (CLP) |
|---|---|---|
| **Adaptación de plantilla** (cliente nuevo sin desarrollo) | Rebrand por **paleta + editor visual**, carga de catálogo y configuración de Webpay/envíos. Sin código nuevo. | **$149.000–$199.000** (única) + mantención desde $14.900/mes |
| **Bosque / implementación completa** | Desarrollo a medida + puesta en marcha real (referencia §7.1). | $249.000–$499.000 (única) |
| **Cliente con funciones nuevas** | Todo lo anterior + desarrollo de funciones que hoy no existen (variantes, cupones, couriers, etc.). | Adaptación + **horas de desarrollo** aparte |

- **La adaptación es el argumento más fuerte del negocio:** entregar en **días** y a bajo costo lo que
  a un competidor le toma semanas de configuración inicial.
- **Opcional:** **licencia de plantilla** (pago único por uso) o **acuerdo multi-tienda** si vas a operar
  varias marcas; ajústalo según cuánto soporte y personalización se acuerde.
- **Sin comisión por venta** igual que en todos los planes: el margen está en implementación +
  mantención, no en cobrar un % de lo que vende el cliente.

---

## 8. División de características entre los tres planes

**Pregunta:** con el modelo *implementación (pago único) + mantención (mensual)*, ¿en qué
características se desglosan los tres planes que se venden?

### 8.1 Regla de reparto

Cada función se vende en **una sola de dos categorías**:

1. **Operación y soporte** (mantención): cubre infraestructura, respaldos, correos, monitoreo,
   actualizaciones, soporte y cambios de contenido. Es **recurrente** porque el costo también lo es.
2. **Construcción de funciones nuevas** (implementación o add-on): variantes, cupones, couriers,
   pasarelas extra, POS… son **desarrollo**; se pagan de forma única (o amortizados, ver §9).

> **Regla de oro:** la mensualidad **nunca** financia desarrollo nuevo salvo que esté amortizado en el
> contrato. Lo que hoy **no existe** (D22 y la lista §6) se cobra como **add-on de implementación**.

### 8.2 Base incluida en **todos** los planes

Catálogo + ficha propia (SEO), carrito, checkout, **Webpay**, retiro con **franjas y días cerrados**
(D18/D19/D32), **envío por comuna + gratis sobre umbral** (D44), **bajo pedido** con días de preparación
(D35), cuenta de cliente con dirección e historial, correo transaccional a cliente y tienda, destacados
automáticos (D54), feed de **Instagram** (D30/D31), **editor visual** (D38/D48–D53), **paleta de 5
colores** (D29), **panel admin** completo (D21/D42), comentarios moderados (D10/D45), reportes base,
modo sin conexión (D20) y **hosting + dominio + SSL + respaldos**.

### 8.3 Qué agrega cada plan

| Plan | Mantención | Operación / soporte | Funciones incluidas |
|---|---|---|---|
| **Esencial** | $14.900/mes | Respaldo diario (retención 3 días), soporte **48 h hábiles**, cambios de contenido menores (**2/mes**), 1 ambiente | Solo la **base** de §8.2 |
| **Crecimiento** | $24.900/mes | Respaldo 7 días, soporte **24 h hábiles**, cambios de contenido amplios (**6/mes**), monitoreo proactivo | Base + **variantes de producto**, **cupones/descuentos**, **recuperación de carrito** (Resend ya integrado), **buscador + filtros** (categoría, precio, alérgenos), **SEO completo** (meta por producto, JSON-LD, `sitemap.xml`, Open Graph), **reportes avanzados**, **GA4** |
| **Pro** | $49.900/mes | Respaldo 15 días, soporte **prioritario (4 h)**, cambios de contenido ilimitados razonables, respaldo de imágenes en S3/EFS, SLA escrito | Todo lo anterior + **email marketing / newsletter**, **favoritos**, **notificación "nuevamente en stock"**, **gift cards**, **puntos/lealtad**, **couriers chilenos con tracking** (Chilexpress/Starken/Blue Express), **pasarelas extra** (MercadoPago, Flow, Khipu), **analítica con embudo** de conversión, **páginas editables** (FAQ, políticas, "sobre nosotros"), **reseñas con foto y estrellas**, **export CSV / etiquetas**, **PWA**, **multi-idioma**, **feeds a Google Shopping / Meta Catalog / Mercado Libre**, **POS** |

### 8.4 Add-ons a la carta (cualquier plan)

Se cotizan aparte por ser **trabajo único**, no operación:

- **Migración / carga de catálogo masivo** (CSV con cientos de SKU y fotos).
- **Integración a medida** (ERP, bodega, sistema del cliente, boleta electrónica SII).
- **Diseño a medida adicional** (más allá del rebrand por paleta + editor).
- **Campañas de email puntuales** o armado de flujos de automatización.
- **Capacitación** al equipo del cliente (presencial online).
- **App móvil nativa** del panel (fuera del alcance del template).

### 8.5 Lectura comercial

- **Esencial** = "tu tienda funcionando, soportada y respaldada". Es el **precio de entrada** frente a
  Jumpseller BASIC; el diferencial es el **flujo a medida** y que la tienda **es del cliente**.
- **Crecimiento** = "vender más". Es donde están las funciones que **cierran la brecha** con Shopify /
  Jumpseller (variantes, cupones, carrito, buscador, SEO). Es el plan a empujar como recomendado.
- **Pro** = "escalar y automatizar". Justifica su precio con **marketing, logística y marketplaces**;
  está pensado para clientes con **volumen** (varias ventas/día) o los que hoy pagan apps de Shopify.

---

## 9. Alternativa: implementación como cuota dentro de la mantención

**Pregunta:** si en vez de cobrar el coste inicial de implementación por separado, se **amortiza** como
cuota en la mantención, ¿qué valor debería tener?

### 9.1 Cómo calcularlo

El valor mensual final = **mantención base** + **cuota de implementación**:

> **Cuota = Implementación ÷ meses de permanencia**  (y la mantención base ya cubre infraestructura +
> margen: piso real ≈ $14.000–28.000 CLP/mes, ver §4).

Cobrar en cuotas **tiene un costo financiero** (se entrega antes de cobrar todo y se asume el riesgo de
que el cliente se vaya). Por eso:

- **Exigir permanencia mínima** (12 meses) y, si se va antes, **pagar el saldo de implementación**.
- Si se ofrece **sin interés**, subir un **recargo por financiamiento (~15%)** sobre la implementación,
  o dejar la versión sin recargo como **beneficio** solo para contratos anuales prepagados.

### 9.2 Tabla de valores (CLP/mes, todo incluido)

Implementación de referencia (§7.1): Esencial **$249.000**, Crecimiento **$349.000**, Pro **$499.000**.

| Plan | Mantención base | 12 meses | 18 meses | 24 meses |
|---|---|---|---|---|
| **Esencial** | $14.900 | $35.650 | $28.750 | $25.300 |
| **Crecimiento** | $24.900 | $54.000 | $44.300 | $39.500 |
| **Pro** | $49.900 | $91.500 | $77.600 | $70.700 |

**Recomendado (redondeado, sin interés, permanencia 12 meses):**

| Plan | 12 meses | 18 meses | 24 meses |
|---|---|---|---|
| Esencial | **$35.900** | **$28.900** | **$25.900** |
| Crecimiento | **$54.900** | **$44.900** | **$39.900** |
| Pro | **$89.900** | **$77.900** | **$69.900** |

> Con **15% de recargo por financiamiento** (si no se paga nada al inicio y sin permanencia larga),
> sumar ≈ 15% a la columna de la cuota (ej. Esencial 24 meses: $25.300 → ≈**$29.000/mes**).

### 9.3 Comparación de las dos modalidades

| Modalidad | Ventaja | Riesgo / costo |
|---|---|---|
| **Pago único + mantención** | Cobra todo al inicio; menos exposición | **Barrera de entrada alta** ($249.000) que frena al cliente chico |
| **Amortizado en la mantención** | Entrada baja (**$25.900–$39.900/mes**); "todo incluido" fácil de vender | **Menor ingreso inicial**, riesgo de abandono → exige **permanencia mínima** |

### 9.4 Recomendación

- Ofrecer la **cuota amortizada a 12–24 meses** como **opción por defecto para clientes chicos**
  (frutería, cafetería, artesano): baja la barrera de entrada y el cliente compara contra un mensual
  tipo Jumpseller PRO.
- Mantener el **pago único** como opción para quien quiera "comprar la tienda" y no atarse a cuota.
- **Nunca** amortizar en el mismo mes sin permanencia: si el cliente cancela al mes 2, se pierde la
  implementación. La **cláusula de permanencia** no es opcional en este modelo.

---

## 10. Otros rubros que la plantilla puede habilitar

**Pregunta:** además de reposterías, ¿qué otros e-commerce puede atender la plantilla con **poca o
media modificación**?

El **filtro del cliente ideal** de BOSQUE es: negocio **local/regional**, con **catálogo pequeño-medio**,
que vende **por retiro o envío por comuna**, liderado por un **emprendedor o PYME** sin equipo técnico.
Todo lo que encaje ahí es cliente potencial.

### 10.1 Rebrand y listo (mismo flujo **bajo pedido** + retiro/envío, **sin código**)

- **Alimentos por encargo:** panadería, chocolatería, heladería, pastelería, viandas/meal prep, catering.
- **Floristería** (la franja de entrega equivale a la fecha de retiro).
- **Artesanía / cerámica / decoración**, **velas y cosmética natural**, **joyería de autor**.
- **Vinos, cervecería artesanal y licores**.
- **Café de especialidad, frutos secos y alimentos saludables** (venta por bolsa/pack).
- **Prints, ilustración y arte** (si la entrega es física).
- **Pet: snacks y accesorios**, **plantas y vivero** (por encargo).

### 10.2 Poca modificación (mismo flujo + **stock** o **POS/agenda**)

- **Cafetería / local con vitrina:** agrega **POS** (venta presencial) al flujo de retiro.
- **Restaurante / dark kitchen:** pedidos programados por franja.
- **Minimarket / almacén de barrio, verdulería/frutería:** **stock real** y venta por **peso/unidad**.
- **Pet shop, farmacia natural, suplementos:** **stock + caducidad**.
- **Librería, papelería, juguetería, bazar, ferretería:** **stock + variantes**.
- **Bicicletería / repuestos y accesorios técnicos:** variantes por **compatibilidad**.

### 10.3 Modificación media (requiere desarrollo acotado)

- **Servicios con agenda:** peluquería, spa, consultas, **talleres y clases** — reutiliza la **Agenda**
  (franjas/cupos) que ya existe.
- **Arriendo de equipos / cancha / salón:** reserva por **rango de fechas**.
- **Suscripciones / cajas mensuales** (café, cerveza, comida).
- **Membresías / club de socios**.
- **Productos digitales** (ebooks, cursos, plantillas): entrega por **descarga**, no por envío.
- **B2B mayorista:** **listas de precio** por cliente y venta por volumen.
- **Ticketera de eventos** (entrada con **código QR** en vez de producto físico).

> **Priorización sugerida:** atacar primero **10.1** (entrega en días, margen alto) y **cafetería +
> retail con stock** de **10.2** (mercado grande, reusa casi todo). **10.3** es la cantera de **add-ons
> pagados** (§8.4), no de plantilla estándar.

---

## 11. La plantilla "perfecta": qué configurar y cuántas plantillas tener

**Pregunta:** tomando en cuenta los rubros anteriores, ¿qué debe tener la plantilla "perfecta" para que
las ediciones cliente a cliente sean mínimas, o **cuántas plantillas** conviene mantener?

### 11.1 El caso que manda: el stock no significa lo mismo en cada rubro

| Política de inventario | Rubro típico | Comportamiento |
|---|---|---|
| **Bajo pedido** (sin stock) | Repostería, catering, floristería | No bloquea la compra; cada producto tiene **días de preparación** (D35) |
| **Stock bloqueante** | Retail, minimarket, librería | **Sin stock no se puede comprar**; el producto no desaparece, se marca agotado |
| **Stock informativo** | Artesano, cosmética | Muestra "quedan X" pero **permite** pedir (backorder) |
| **Stock por variante** | Ropa, repuestos, calzado | El stock vive en la **variante** (talla/color/compatibilidad), no en el producto |

> Esto **no** debe resolverse con código distinto por cliente, sino con **una sola opción configurable**
> por tienda (y, si acaso, por producto). Ese es el cambio más rentable en la plantilla.

### 11.2 Qué debe ser **configuración** y no código

1. **Feature flags por tienda:** inventario (las 4 políticas de arriba), variantes, cupones, favoritos,
   reseñas con estrellas, puntos/lealtad, gift cards, newsletter, POS, agenda.
2. **Atributos genéricos:** "ingredientes" y "alérgenos" (D2) son en realidad **atributos con etiqueta
   configurable** (material, compatibilidad, caducidad, origen). Así sirven en cualquier rubro.
3. **Agenda y franjas genéricas:** la misma tabla sirve para **retiro** y para **servicios/cupos**.
4. **Envío pluggable:** retiro, **envío propio por comuna** (D44), **courier con tracking**, **entrega
   digital**.
5. **Pago pluggable:** hoy solo Webpay (D8/D34); dejar el checkout preparado para sumar pasarelas.
6. **Tema y contenido 100% editables:** paleta de 5 colores (D29), tipografías, **logo**, **hero** y
   textos con el editor visual (D38/D48–D53) + **páginas editables** (FAQ, políticas, "sobre nosotros").
7. **Semilla / preset por rubro:** al crear una tienda se elige un **preset** que ya precarga flags,
   categorías, copy y paleta. Importación de catálogo por **CSV**.
8. **Idioma y moneda** centralizados (para no reescribir textos al cambiar de mercado).

### 11.3 ¿Una sola plantilla o varias?

**Recomendación: un solo código con configuración + presets, no varios proyectos.** Mantener N bases
multiplica el costo de mantención (que es justamente el negocio): un arreglo habría que repetirlo en cada
fork. En cambio, un código único con **flags** arregla todo desde un solo lugar.

Traducir cada rubro a un **preset** (paquete de configuración + semilla + paleta + copy), no a un clon:

| Preset | Para qué rubros | Qué cambia |
|---|---|---|
| **"Hecho a pedido"** | Repostería, catering, floristería, artesanía | Inventario **bajo pedido** + días de preparación; agenda de retiro |
| **"Retail con stock"** | Minimarket, librería, ferretería, pet shop, vivero | Inventario **bloqueante** + variables de **variante**; POS y couriers |
| **"Servicios / agenda"** | Peluquería, spa, talleres, arriendo | Cupos por franja/día; sin envío; pago de reserva |

> **Resultado práctico:** **1 sola base de código** + **3 presets** (y **2–3 familias de layout** dentro del
> mismo código) cubren prácticamente todos los rubros de §10 **sin editar código**. Lo que no se resuelva
> con flags/presets **no es plantilla**: es **desarrollo a medida** (add-on, §8.4) o un **producto distinto**.

### 11.4 Cuándo **no** es plantilla (y hay que decirlo)

- Reservas con lógica de **hotel/turismo** (tarifas por temporada, habitaciones, ocupación).
- Ventas **B2B complejas** (catálogos y listas de precio por cliente, crédito, OC).
- Marketplaces multi-vendedor.

En esos casos conviene cotizar **a medida** y no forzar el preset: forzarlo ensucia el código y encarece
la mantención de **todos** los clientes.

---

## 12. Fuentes (consultadas en octubre 2026)

- Shopify — precios oficiales: https://www.shopify.com/pricing
- Jumpseller Chile — planes y precios: https://jumpseller.cl/sign-up/
- WooCommerce — costos/TCO de referencia: https://woocommerce.com/pricing/
- Transbank — tarifas Webpay: https://publico.transbank.cl/tarifas y
  https://ayuda.transbank.cl/tarifas-vender-webpay

> Los precios de SaaS cambian; **verificar el tarifario vigente** antes de cerrar una cotización y
> fijar el tipo de cambio con el que se calcula el CLP.
