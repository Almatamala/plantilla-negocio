import { defaultThemeColors, normalizeThemeColors, type ThemeColors } from "@/lib/theme";

/**
 * Punto único para personalizar una nueva tienda sin modificar la interfaz.
 * Estos valores pueden ser sobreescritos desde la tabla `store_settings` del panel.
 */
/** Tarjeta de la sección «Beneficios» de la vitrina: título y texto. */
export type Benefit = { title: string; text: string };

/**
 * Forma del marco del logo del hero (D50): el círculo de siempre, un círculo de **bordes difuminados** o
 * una flor. Se eligen en una ventana con las tres siluetas, en el editor de la página.
 */
export type LogoShape = "circle" | "soft" | "flower";

/** Las tres formas válidas, en un solo lugar: el resto del código no repite los literales. */
export const logoShapes: readonly LogoShape[] = ["circle", "soft", "flower"];

/**
 * Nombre de cada forma para el selector del editor (D50). Al cubrir **todas** las formas, sumar una nueva
 * obliga a darle su nombre: el selector se arma con `logoShapes` y estas etiquetas, así que la lista de
 * formas vive en un único lugar.
 */
export const logoShapeLabels: Record<LogoShape, string> = {
  circle: "Círculo",
  soft: "Bordes difuminados",
  flower: "Flor",
};

/**
 * Normaliza la forma del logo (D50): lo que no sea una de las formas válidas cae al `fallback` (el círculo
 * por defecto). Es el **único** lugar que conoce los valores válidos, así que lo usan el merge de ajustes,
 * la clase del marco y el selector, en vez de repetir la comparación en cada uno.
 */
export function normalizeLogoShape(value: string | null | undefined, fallback: LogoShape = "circle"): LogoShape {
  return logoShapes.includes(value as LogoShape) ? (value as LogoShape) : fallback;
}

export type StoreConfig = {
  name: string;
  announcement: string;
  eyebrow: string;
  headline: string;
  description: string;
  /** Foto de fondo del hero (D47): la de la plantilla si no se subió ninguna desde el editor de la página. */
  heroImage: string;
  /** Logo de la tienda en el hero (**opcional**, D49): vacío quiere decir que no se dibuja. */
  heroLogo: string;
  /** Forma del marco del logo (D50): `circle` por defecto, `soft` o `flower`. */
  heroLogoShape: LogoShape;
  /** Encuadre de la foto del hero (D51): un `object-position` de CSS, movible desde el editor. */
  heroImagePosition: string;
  /** Las tres tarjetas de «Beneficios», en el orden en que se dibujan (D38). */
  benefits: [Benefit, Benefit, Benefit];
  storyEyebrow: string;
  storyHeadline: string;
  storyDescription: string;
  /** Ubicación que se muestra al pie de la tienda («San Javier y Talca, Chile»). */
  footerLocation: string;
  /** Bajada del pie, debajo del nombre de la marca (D38). */
  footerTagline: string;
  contact_email: string;
  contact_phone: string;
  whatsapp_phone: string;
  instagram_url: string;
  /** Paleta de marca ya normalizada (ver `lib/theme.ts`), editable en Contenido › Colores. */
  theme_colors: ThemeColors;
};

/** Ajustes de tienda tal como los devuelve la API (`GET /api/settings`). */
export type ApiSettings = {
  name: string;
  announcement: string | null;
  hero_title: string | null;
  hero_description: string | null;
  hero_image: string | null;
  hero_image_position: string | null;
  hero_logo: string | null;
  hero_logo_shape: string | null;
  hero_eyebrow: string | null;
  story_headline: string | null;
  story_description: string | null;
  story_eyebrow: string | null;
  benefit_1_title: string | null;
  benefit_1_text: string | null;
  benefit_2_title: string | null;
  benefit_2_text: string | null;
  benefit_3_title: string | null;
  benefit_3_text: string | null;
  footer_location: string | null;
  footer_tagline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  instagram_url: string | null;
  theme_colors: Partial<Record<string, string>> | null;
};

/** Una tarjeta de beneficios: lo que llegó de la API y, si viene vacío, el texto por defecto. */
function mergeBenefit(current: Benefit, title: string | null, text: string | null): Benefit {
  return { title: title ?? current.title, text: text ?? current.text };
}

/** Combina los ajustes guardados en el panel con los valores por defecto. */
export function mergeSettings(current: StoreConfig, data: ApiSettings): StoreConfig {
  return {
    ...current,
    name: data.name ?? current.name,
    announcement: data.announcement ?? current.announcement,
    eyebrow: data.hero_eyebrow ?? current.eyebrow,
    headline: data.hero_title ?? current.headline,
    description: data.hero_description ?? current.description,
    // El hero **sin foto guardada no dibuja ninguna** (A74): un valor vacío se respeta tal cual en vez de
    // caer a la foto de la plantilla. `??` (y no `||`) distingue «vacío a propósito» de «sin ajuste».
    heroImage: data.hero_image?.trim() ?? current.heroImage,
    // El logo es opcional: sin valor guardado no se dibuja nada en la esquina del hero (D49).
    heroLogo: data.hero_logo?.trim() || "",
    // La forma del marco (D50) tiene tres valores: cualquier otra cosa —o nada— cae al círculo de siempre.
    heroLogoShape: normalizeLogoShape(data.hero_logo_shape),
    // El encuadre de la foto (D51) cae al recorte por defecto si no hay ninguno guardado.
    heroImagePosition: data.hero_image_position?.trim() || current.heroImagePosition,
    benefits: [
      mergeBenefit(current.benefits[0], data.benefit_1_title, data.benefit_1_text),
      mergeBenefit(current.benefits[1], data.benefit_2_title, data.benefit_2_text),
      mergeBenefit(current.benefits[2], data.benefit_3_title, data.benefit_3_text),
    ],
    storyEyebrow: data.story_eyebrow ?? current.storyEyebrow,
    storyHeadline: data.story_headline ?? current.storyHeadline,
    storyDescription: data.story_description ?? current.storyDescription,
    footerLocation: data.footer_location ?? current.footerLocation,
    footerTagline: data.footer_tagline ?? current.footerTagline,
    contact_email: data.contact_email ?? current.contact_email,
    contact_phone: data.contact_phone ?? current.contact_phone,
    whatsapp_phone: data.whatsapp_phone ?? current.whatsapp_phone,
    instagram_url: data.instagram_url ?? current.instagram_url,
    // La paleta se normaliza acá (no se copia tal cual): así un valor viejo o incompleto no deja la
    // tienda sin color y los tonos que falten caen a la paleta por defecto.
    theme_colors: data.theme_colors ? normalizeThemeColors(data.theme_colors) : current.theme_colors,
  };
}

/**
 * Encuadre por defecto de la foto del hero (D51): el borde derecho, que es el recorte original de la
 * plantilla (`object-right`). El editor lo ofrece para volver al encuadre de siempre.
 */
export const defaultHeroImagePosition = "100% 50%";

export const storeConfig: StoreConfig = {
  name: "Tienda Base",
  announcement: "Compra simple, productos que importan",
  eyebrow: "Tu colección, tu estilo",
  headline: "Una tienda que se adapta a tu negocio.",
  description: "Una base limpia para mostrar productos, conectar con clientes y hacer crecer una marca propia.",
  // El hero arranca **sin foto** (A74): la que se sube desde el editor es la única que se dibuja.
  heroImage: "",
  heroLogo: "",
  heroLogoShape: "circle",
  heroImagePosition: defaultHeroImagePosition,
  benefits: [
    { title: "Compra con confianza", text: "Destaca tus garantías, materiales, soporte o cualquier beneficio importante." },
    { title: "Una experiencia simple", text: "Usa este bloque para explicar cómo funciona tu servicio o proceso de compra." },
    { title: "Tu negocio, tu estilo", text: "Cambia textos, precios, fotos y colecciones desde el CMS incluido." },
  ],
  storyEyebrow: "Una plantilla que crece contigo",
  storyHeadline: "Haz que tu marca se sienta única.",
  storyDescription: "Personaliza este espacio para comunicar tu propuesta, historia, beneficios o cualquier mensaje importante para tus clientes.",
  footerLocation: "San Javier y Talca, Chile",
  footerTagline: "Repostería artesanal de San Javier y Talca. Pedidos programados con retiro presencial.",
  contact_email: "",
  contact_phone: "",
  whatsapp_phone: "",
  instagram_url: "",
  theme_colors: defaultThemeColors,
};