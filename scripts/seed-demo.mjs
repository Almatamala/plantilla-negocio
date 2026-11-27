#!/usr/bin/env node
/**
 * Siembra de la **demo interactiva** de BOSQUE.
 *
 * Deja la tienda presentable sin tocar código ni la base a mano. Por defecto usa el catálogo real
 * exportado con `npm run demo:export` (`scripts/demo-snapshot.json`): mismos productos, precios,
 * textos, fotos y zonas que tu base actual. Si ese archivo no existe, cae al catálogo de ejemplo que
 * trae la plantilla, así que la demo también funciona en una copia limpia del repo.
 *
 * Se ejecuta contra una API ya levantada (local o desplegada) y es **idempotente**: lo que ya existe
 * no se vuelve a crear, así que correrlo dos veces no duplica nada. Si alguien borró un producto de
 * demo desde el panel, volver a correrlo lo restaura.
 *
 * Uso:
 *   DEMO_API_URL=https://mi-demo.vercel.app/api/backend \
 *   API_ADMIN_TOKEN=... \
 *   npm run demo:seed
 *
 * Variables (todas opcionales salvo la URL y el token cuando la API no es local):
 *   DEMO_API_URL          URL de la API (por defecto http://localhost:8000)
 *   API_ADMIN_TOKEN       clave administrativa de la API (`API_ADMIN_TOKEN` en el backend)
 *   DEMO_ADMIN_EMAIL      correo de la cuenta demo (por defecto demo@bosque.cl); debe estar en ADMIN_EMAILS
 *   DEMO_ADMIN_PASSWORD   contraseña de la cuenta demo (por defecto bosque-demo)
 *   INSTAGRAM_ACCESS_TOKEN  token de larga duración; si viene, la demo queda con el feed de Instagram
 *   INSTAGRAM_USER_ID     cuenta del feed (opcional: Instagram la devuelve al validar el token)
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = (process.env.DEMO_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.API_ADMIN_TOKEN ?? "";
const ADMIN_EMAIL = (process.env.DEMO_ADMIN_EMAIL ?? "demo@bosque.cl").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "bosque-demo";
const ADMIN_NAME = "Equipo BOSQUE (demo)";
const INSTAGRAM_TOKEN = (process.env.INSTAGRAM_ACCESS_TOKEN ?? "").trim();
const INSTAGRAM_USER_ID = (process.env.INSTAGRAM_USER_ID ?? "").trim();
const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "demo-snapshot.json");

/** Campos que acepta `PUT /api/settings`: la respuesta del GET trae columnas retiradas que la API rechaza. */
const SETTINGS_KEYS = [
  "name",
  "contact_email",
  "contact_phone",
  "whatsapp_phone",
  "instagram_url",
  "announcement",
  "hero_title",
  "hero_description",
  "hero_image",
  "hero_logo",
  "hero_logo_shape",
  "hero_image_position",
  "story_headline",
  "story_description",
  "story_image",
  "hero_eyebrow",
  "story_eyebrow",
  "footer_location",
  "footer_tagline",
  "theme_colors",
];

const log = (message) => console.log(`· ${message}`);

async function call(pathname, { method = "GET", body, admin = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (admin) headers["X-Admin-Token"] = ADMIN_TOKEN;
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data);
    throw new Error(`${method} ${pathname} → ${response.status}: ${detail}`);
  }
  return data;
}

// ── Catálogo de ejemplo (solo si no hay snapshot exportado) ──────────────────

const EXAMPLE = {
  categories: [
    { name: "Tortas", slug: "tortas" },
    { name: "Galletas", slug: "galletas" },
    { name: "Postres", slug: "postres" },
  ],
  products: [
    {
      slug: "torta-chocolate-frambuesa",
      name: "Torta de chocolate y frambuesa",
      category: "tortas",
      price: 24990,
      description: "Bizcocho húmedo de cacao, relleno de frambuesas frescas y crema de chocolate semiamargo. Para 10 personas.",
      ingredients: "Harina de trigo, cacao, huevos de campo, mantequilla, azúcar, frambuesas, crema.",
      allergens: ["gluten", "lacteos", "huevo"],
      inventory: 6,
      preparation_days: 2,
    },
    {
      slug: "cheesecake-maracuya",
      name: "Cheesecake de maracuyá",
      category: "tortas",
      price: 21990,
      description: "Base de galleta de mantequilla, relleno cremoso y una capa de maracuyá natural. Se entrega frío.",
      ingredients: "Queso crema, crema, galleta, mantequilla, azúcar, maracuyá, huevo.",
      allergens: ["gluten", "lacteos", "huevo"],
      inventory: 4,
      preparation_days: 1,
    },
    {
      slug: "torta-tres-leches",
      name: "Torta tres leches",
      category: "tortas",
      price: 23990,
      description: "El clásico de la casa: bizcocho liviano bañado en tres leches y un copete de canela.",
      ingredients: "Harina, huevo, azúcar, leche condensada, leche evaporada, crema, canela.",
      allergens: ["gluten", "lacteos", "huevo"],
      inventory: 5,
      preparation_days: 2,
    },
    {
      slug: "brownie-nuez",
      name: "Brownie de nuez (caja de 6)",
      category: "postres",
      price: 8990,
      description: "Centro fundido, nueces tostadas y una pizca de sal de mar. Caja de seis unidades.",
      ingredients: "Chocolate 70%, mantequilla, huevo, azúcar, harina, nueces, sal de mar.",
      allergens: ["gluten", "lacteos", "huevo", "frutos-secos"],
      inventory: 12,
      preparation_days: 0,
    },
    {
      slug: "galletas-avena-miel",
      name: "Galletas de avena y miel (bolsa de 8)",
      category: "galletas",
      price: 6990,
      description: "Crujientes por fuera, tiernas por dentro. Endulzadas solo con miel de la zona.",
      ingredients: "Avena, harina integral, miel, mantequilla, huevo, canela.",
      allergens: ["gluten", "lacteos", "huevo"],
      inventory: 15,
      preparation_days: 0,
    },
    {
      slug: "alfajores-manjar",
      name: "Alfajores de manjar (caja de 6)",
      category: "galletas",
      price: 7990,
      description: "Masa quebrada de mantequilla, manjar casero y coco rallado. Caja de seis unidades.",
      ingredients: "Harina, mantequilla, manjar, coco, azúcar flor.",
      allergens: ["gluten", "lacteos"],
      inventory: 10,
      preparation_days: 1,
    },
  ].map((product) => ({
    ...product,
    status: "active",
    image_url: `/demo/${product.slug}.jpg`,
    images: [`/demo/${product.slug}.jpg`],
  })),
  settings: {
    name: "BOSQUE",
    contact_email: "demo@bosque.cl",
    contact_phone: "+56 9 1234 5678",
    whatsapp_phone: "+56 9 1234 5678",
    instagram_url: "https://www.instagram.com/",
    announcement: "Demo interactiva · los pedidos no se cobran ni se despachan",
    hero_eyebrow: "Repostería artesanal · San Javier y Talca",
    hero_title: "Dulces para las fechas que importan",
    hero_description:
      "Tortas, galletas y postres hechos por encargo, con ingredientes de verdad y tiempo para cada detalle.",
    story_eyebrow: "Nuestra historia",
    story_headline: "Un taller pequeño, con las manos siempre en la masa",
    story_description:
      "Nacimos horneando para la familia y hoy preparamos cada pedido uno por uno. Todo se agenda: así llega fresco el día que lo necesitas.",
    footer_tagline: "Repostería artesanal de San Javier y Talca, hecha por encargo.",
    footer_location: "San Javier, Región del Maule",
  },
  pickup_zones: [
    {
      name: "Retiro en San Javier",
      location: "Av. Bernardo O'Higgins 1234, San Javier, Maule",
      slots: [
        { start_time: "10:00", end_time: "13:00", weekdays: [1, 2, 3, 4, 5, 6], enabled: true },
        { start_time: "16:00", end_time: "19:00", weekdays: [1, 2, 3, 4, 5, 6], enabled: true },
      ],
    },
  ],
  delivery_zones: [
    { country: "Chile", region: "Maule", city: "Talca", fee: 3000, free_threshold: 30000, active: true },
    { country: "Chile", region: "Maule", city: "San Javier", fee: 2000, free_threshold: 25000, active: true },
  ],
};

const REVIEWS = [
  { slug: "torta-chocolate-frambuesa", author: "Camila Rojas", rating: 5, comment: "La torta llegó impecable y el relleno de frambuesa es increíble. Repetimos seguro." },
  { slug: "brownie-nuez", author: "Felipe Muñoz", rating: 5, comment: "El centro fundido es real. La caja de seis no alcanzó para la once." },
];

async function loadData() {
  if (!existsSync(SNAPSHOT)) {
    log("sin scripts/demo-snapshot.json: se usa el catálogo de ejemplo");
    return EXAMPLE;
  }
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8"));
  if (!Array.isArray(snapshot.products) || snapshot.products.length === 0) {
    throw new Error("scripts/demo-snapshot.json no tiene productos. Vuelve a correr npm run demo:export.");
  }
  log(`catálogo real exportado: ${snapshot.products.length} productos y ${snapshot.categories?.length ?? 0} categorías`);
  return {
    ...EXAMPLE,
    ...snapshot,
    pickup_zones: snapshot.pickup_zones?.length ? snapshot.pickup_zones : EXAMPLE.pickup_zones,
    delivery_zones: snapshot.delivery_zones?.length ? snapshot.delivery_zones : EXAMPLE.delivery_zones,
  };
}

// ── Pasos ────────────────────────────────────────────────────────────────────

async function ensureAdmin() {
  try {
    await call("/api/auth/register", {
      method: "POST",
      body: { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    log(`cuenta demo ${ADMIN_EMAIL} creada`);
  } catch (error) {
    if (!String(error.message).includes("409")) throw error;
    log(`cuenta demo ${ADMIN_EMAIL} ya existía`);
  }
  const session = await call("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (session?.user?.role !== "admin") {
    throw new Error(
      `La cuenta ${ADMIN_EMAIL} no tiene rol admin. Agrégala a ADMIN_EMAILS en el backend y vuelve a correr la siembra (en una cuenta recién creada el rol se asigna al registrarse).`,
    );
  }
  log("sesión admin verificada");
}

async function ensureCategories(categories) {
  const existing = await call("/api/categories");
  const bySlug = new Map(existing.map((category) => [category.slug, category]));
  for (const category of categories) {
    if (bySlug.has(category.slug)) continue;
    const created = await call("/api/categories", { method: "POST", admin: true, body: category });
    bySlug.set(created.slug, created);
    log(`categoría «${created.name}» creada`);
  }
  return bySlug;
}

async function ensureProducts(products, categories) {
  const existing = await call("/api/products?include_inactive=true", { admin: true });
  const bySlug = new Map(existing.map((product) => [product.slug, product]));
  for (const product of products) {
    if (bySlug.has(product.slug)) continue;
    const created = await call("/api/products", {
      method: "POST",
      admin: true,
      body: {
        category_id: categories.get(product.category)?.id ?? null,
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        price: product.price ?? 0,
        image_url: product.image_url ?? null,
        images: product.images ?? [],
        ingredients: product.ingredients ?? null,
        allergens: product.allergens ?? [],
        status: product.status ?? "active",
        inventory: product.inventory ?? 0,
        preparation_days: product.preparation_days ?? 0,
      },
    });
    bySlug.set(created.slug, created);
    log(`producto «${created.name}» creado`);
  }
  return bySlug;
}

async function ensurePickup(zones) {
  const existingZones = await call("/api/shipping-zones");
  const points = [];
  for (const zone of zones) {
    let point = existingZones.find((item) => item.name === zone.name);
    if (!point) {
      point = await call("/api/shipping-zones", {
        method: "POST",
        admin: true,
        body: { name: zone.name, location: zone.location, active: true },
      });
      log(`punto de retiro «${point.name}» creado`);
    }
    let slots = await call(`/api/time-slots?zone_id=${point.id}&include_disabled=true`);
    if (!slots.length) {
      slots = [];
      for (const slot of zone.slots ?? []) {
        slots.push(await call("/api/time-slots", { method: "POST", admin: true, body: { ...slot, zone_id: point.id } }));
        log(`franja ${slot.start_time}–${slot.end_time} creada en «${point.name}»`);
      }
    }
    points.push({ zone: point, slots });
  }
  if (!points.length) throw new Error("El snapshot no trae ningún punto de retiro con el que agendar.");
  return points;
}

async function ensureDeliveryZones(zones) {
  const existing = await call("/api/delivery-zones");
  for (const zone of zones) {
    const found = existing.find(
      (item) => item.region?.toLowerCase() === zone.region.toLowerCase() && item.city?.toLowerCase() === zone.city.toLowerCase(),
    );
    if (found) continue;
    const created = await call("/api/delivery-zones", { method: "POST", admin: true, body: zone });
    log(`zona de envío «${created.city}» creada`);
  }
}

async function ensureSettings(settings) {
  const body = {};
  for (const key of SETTINGS_KEYS) {
    if (settings[key] !== undefined) body[key] = settings[key];
  }
  if (!body.name) {
    body.name = (await call("/api/settings")).name;
  }
  await call("/api/settings", { method: "PUT", admin: true, body });
  log("textos, fotos y colores de la tienda ajustados");
}

/**
 * Credenciales de Instagram: se guardan en la base de la demo con `PUT /api/instagram/token`, que las
 * valida contra Instagram antes de aceptarlas. Así la demo no depende de variables de entorno del
 * proveedor ni de un token pegado a mano en el panel.
 */
async function ensureInstagram() {
  if (!INSTAGRAM_TOKEN) {
    log("sin INSTAGRAM_ACCESS_TOKEN: la sección de Instagram no se dibuja");
    return;
  }
  const status = await call("/api/instagram/token", {
    method: "PUT",
    admin: true,
    body: { access_token: INSTAGRAM_TOKEN, user_id: INSTAGRAM_USER_ID || null },
  });
  log(`credenciales de Instagram cargadas (cuenta ${status.user_id ?? "?"})`);
}

async function ensureReviews(products) {
  for (const review of REVIEWS) {
    const product = products.get(review.slug);
    if (!product) continue;
    const published = await call(`/api/reviews?product_id=${product.id}`);
    if (published.length) continue;
    const created = await call("/api/reviews", {
      method: "POST",
      body: { product_id: product.id, author: review.author, rating: review.rating, comment: review.comment },
    });
    await call(`/api/reviews/${created.id}/status`, { method: "PATCH", admin: true, body: { status: "approved" } });
    log(`comentario de ${review.author} publicado`);
  }
}

function nextDateForSlot(slots) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2); // deja margen de preparación
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const slot = slots.find((item) => (item.weekdays ?? []).includes(date.getUTCDay()));
    if (slot) return { date: date.toISOString().slice(0, 10), slot };
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return { date: date.toISOString().slice(0, 10), slot: slots[0] };
}

/** Pedidos de ejemplo armados con los productos del catálogo (nunca con los pedidos reales). */
function sampleOrders(products) {
  const available = [...products.values()].filter((product) => product.status === "active").slice(0, 3);
  const customers = [
    { name: "Antonia Pérez", phone: "+56 9 8765 4321", email: "antonia@ejemplo.cl", status: "pending" },
    { name: "Ignacio Salas", phone: "+56 9 5555 1234", email: "ignacio@ejemplo.cl", status: "pending" },
    { name: "Josefa Torres", phone: "+56 9 4444 9876", email: "josefa@ejemplo.cl", status: "delivered" },
  ];
  return available.map((product, index) => ({
    ...customers[index],
    items: [{ product_id: product.id, name: product.name, unit_price: product.price, quantity: index === 0 ? 2 : 1 }],
  }));
}

async function ensureOrders(products, pickup) {
  const existing = await call("/api/orders?include_closed=true", { admin: true });
  if (existing.length) {
    log("ya hay pedidos; no se crean más");
    return;
  }
  for (const order of sampleOrders(products)) {
    const { date, slot } = nextDateForSlot(pickup.slots);
    const created = await call("/api/orders", {
      method: "POST",
      body: {
        customer_name: order.name,
        customer_phone: order.phone,
        customer_email: order.email,
        scheduled_date: date,
        time_slot_id: slot?.id ?? null,
        shipping_zone_id: pickup.zone.id,
        location: pickup.zone.location,
        delivery_method: "pickup",
        items: order.items,
      },
    });
    if (order.status !== "pending") {
      await call(`/api/orders/${created.id}/status`, { method: "PATCH", admin: true, body: { status: order.status } });
    }
    log(`pedido de ${order.name} creado (${order.status})`);
  }
}

async function main() {
  console.log(`Sembrando la demo en ${API}\n`);
  const health = await call("/health");
  if (health?.status !== "ok") throw new Error("La API no respondió /health.");
  const data = await loadData();
  await ensureAdmin();
  const categories = await ensureCategories(data.categories ?? []);
  const products = await ensureProducts(data.products, categories);
  const pickup = await ensurePickup(data.pickup_zones);
  await ensureDeliveryZones(data.delivery_zones ?? []);
  await ensureSettings(data.settings ?? {});
  await ensureInstagram();
  await ensureReviews(products);
  await ensureOrders(products, pickup[0]);
  console.log(`\nListo. Entra a la tienda y al panel con ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
});
