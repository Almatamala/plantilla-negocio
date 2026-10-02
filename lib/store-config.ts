import { defaultThemeColors, normalizeThemeColors, type ThemeColors } from "@/lib/theme";

/**
 * Punto único para personalizar una nueva tienda sin modificar la interfaz.
 * Estos valores pueden ser sobreescritos desde la tabla `store_settings` del panel.
 */
/** Tarjeta de la sección «Beneficios» de la vitrina: título y texto. */
export type Benefit = { title: string; text: string };

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
  hero_logo: string | null;
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
    // La foto del hero cae a la de la plantilla si no hay ninguna guardada (o si se dejó vacía).
    heroImage: data.hero_image?.trim() || current.heroImage,
    // El logo es opcional: sin valor guardado no se dibuja nada en la esquina del hero (D49).
    heroLogo: data.hero_logo?.trim() || "",
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
 * Foto de fondo del hero de la plantilla (D47): la que se usa mientras no se suba otra desde el editor de
 * la página. El editor la necesita aparte para ofrecer «volver a la de la plantilla».
 */
export const defaultHeroImage = "/hero-bosque.png";

export const storeConfig: StoreConfig = {
  name: "Tienda Base",
  announcement: "Compra simple, productos que importan",
  eyebrow: "Tu colección, tu estilo",
  headline: "Una tienda que se adapta a tu negocio.",
  description: "Una base limpia para mostrar productos, conectar con clientes y hacer crecer una marca propia.",
  heroImage: defaultHeroImage,
  heroLogo: "",
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