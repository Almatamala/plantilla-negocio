#!/usr/bin/env node
/**
 * Exporta los datos **reales** de la tienda para que la demo arranque con ellos.
 *
 * Lee la API que ya está corriendo (por defecto la del `docker compose`, en `:8000`) y escribe
 * `scripts/demo-snapshot.json` con categorías, productos, ajustes, puntos de retiro con sus franjas y
 * zonas de envío. Además copia a `public/demo/` las fotos que estén en `/uploads`, las reduce a 1600 px
 * y reescribe las URLs para que dejen de apuntar a `http://localhost:8000` (que en un deploy no existe).
 *
 * No exporta **pedidos ni cuentas**: son datos de clientes y la demo no los necesita. Los pedidos de
 * ejemplo los crea la siembra a partir de los productos exportados.
 *
 * Uso:
 *   npm run demo:export                       # contra http://localhost:8000
 *   DEMO_API_URL=https://mi-api npm run demo:export
 *
 * `API_ADMIN_TOKEN` debe coincidir con el de la API (en el compose es `change-me-in-development`).
 * El resultado se versiona en el repo: la demo se siembra desde ese archivo, sin depender de tu base.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const API = (process.env.DEMO_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.API_ADMIN_TOKEN ?? "";
const SNAPSHOT = path.join(HERE, "demo-snapshot.json");
const IMAGES = path.join(ROOT, "public", "demo");
const MAX_SIDE = 1600;

/** Campos que acepta `PUT /api/settings`; lo demás (`id`, `updated_at`, columnas retiradas) se descarta. */
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

/** Nombre legible del archivo para las tres fotos de los ajustes. */
const SETTINGS_IMAGES = { hero_image: "hero", hero_logo: "logo", story_image: "historia" };

const log = (message) => console.log(`· ${message}`);

async function call(pathname, admin = false) {
  const headers = admin && ADMIN_TOKEN ? { "X-Admin-Token": ADMIN_TOKEN } : {};
  const response = await fetch(`${API}${pathname}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${pathname} → ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

/**
 * Copia una foto de `/uploads` a `public/demo` con un nombre legible y devuelve su ruta pública.
 * Las URLs externas (por ejemplo una imagen enlazada de otro sitio) se dejan tal cual.
 */
async function localize(url, name) {
  if (!url) return null;
  const match = /\/uploads\/([^/?#]+)$/.exec(url);
  if (!match) {
    log(`aviso: «${url}» no está en /uploads; se deja enlazada`);
    return url;
  }
  const extension = (path.extname(match[1]) || ".jpg").toLowerCase();
  const filename = `${name}${extension}`;
  const destination = path.join(IMAGES, filename);
  const publicPath = `/demo/${filename}`;

  // Se vuelve a descargar siempre: si cambiaste la foto en el panel, el export la trae al día.
  const response = await fetch(`${API}/uploads/${match[1]}`);
  if (!response.ok) throw new Error(`No se pudo descargar ${match[1]} → ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  const resized = sharp(original)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  const optimized =
    extension === ".png"
      ? await resized.png({ compressionLevel: 9 }).toBuffer()
      : await resized.jpeg({ quality: 82 }).toBuffer();
  await mkdir(IMAGES, { recursive: true });
  await writeFile(destination, optimized);
  log(`foto ${filename} · ${Math.round(original.length / 1024)} KB → ${Math.round(optimized.length / 1024)} KB`);
  return publicPath;
}

async function main() {
  console.log(`Exportando la tienda de ${API}\n`);
  const [categories, products, settings, shippingZones, deliveryZones] = await Promise.all([
    call("/api/categories"),
    call("/api/products?include_inactive=true", true),
    call("/api/settings"),
    call("/api/shipping-zones"),
    call("/api/delivery-zones"),
  ]);

  const categorySlug = new Map(categories.map((category) => [category.id, category.slug]));

  const exportedProducts = [];
  for (const product of products) {
    // La portada y la galería suelen compartir archivo: el mapa evita descargarlo dos veces y le da
    // nombres estables (`slug.jpg`, `slug-2.jpg`, …).
    const localized = new Map();
    const cover = await localize(product.image_url, product.slug);
    if (cover) localized.set(product.image_url, cover);
    const images = [];
    for (const [index, url] of (product.images ?? []).entries()) {
      const name = `${product.slug}${index ? `-${index + 1}` : ""}`;
      const local = localized.get(url) ?? (await localize(url, name));
      if (local) images.push(local);
    }
    // La portada tiene que ser una foto propia: si `image_url` enlaza a otro sitio se usa la primera
    // de la galería (que sí se copió a `public/demo`), para que la demo no dependa de un hotlink.
    const imageUrl = /^\/demo\//.test(cover ?? "") ? cover : images[0] ?? cover ?? null;
    exportedProducts.push({
      name: product.name,
      slug: product.slug,
      category: categorySlug.get(product.category_id) ?? null,
      price: product.price,
      description: product.description,
      ingredients: product.ingredients,
      allergens: product.allergens ?? [],
      status: product.status,
      inventory: product.inventory,
      preparation_days: product.preparation_days,
      image_url: imageUrl,
      images,
    });
    log(`producto «${product.name}»`);
  }

  const exportedSettings = {};
  for (const key of SETTINGS_KEYS) {
    if (!(key in settings)) continue;
    exportedSettings[key] = key in SETTINGS_IMAGES
      ? await localize(settings[key], SETTINGS_IMAGES[key])
      : settings[key];
  }

  const pickupZones = [];
  for (const zone of shippingZones) {
    const slots = await call(`/api/time-slots?zone_id=${encodeURIComponent(zone.id)}&include_disabled=true`);
    pickupZones.push({
      name: zone.name,
      location: zone.location,
      slots: slots.map((slot) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        weekdays: slot.weekdays,
        enabled: slot.enabled,
      })),
    });
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    categories: categories.map(({ name, slug }) => ({ name, slug })),
    products: exportedProducts,
    settings: exportedSettings,
    pickup_zones: pickupZones,
    delivery_zones: deliveryZones.map(({ country, region, city, fee, free_threshold, active }) => ({
      country,
      region,
      city,
      fee,
      free_threshold,
      active,
    })),
  };

  await writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `\nListo: ${exportedProducts.length} productos y ${categories.length} categorías en scripts/demo-snapshot.json.\n` +
      "Ahora corre la siembra contra la base de la demo: npm run demo:seed",
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
});
