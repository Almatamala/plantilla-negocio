import { defaultThemeColors, normalizeThemeColors, type ThemeColors } from "@/lib/theme";

/**
 * Punto único para personalizar una nueva tienda sin modificar la interfaz.
 * Estos valores pueden ser sobreescritos desde la tabla `store_settings` del panel.
 */
export type StoreConfig = {
  name: string;
  announcement: string;
  eyebrow: string;
  headline: string;
  description: string;
  featuredCollection: string;
  storyEyebrow: string;
  storyHeadline: string;
  storyDescription: string;
  contact_email: string;
  contact_phone: string;
  whatsapp_phone: string;
  instagram_url: string;
  instagram_embed_url: string;
  bank_account_info: string;
  /** Paleta de marca ya normalizada (ver `lib/theme.ts`), editable en Contenido › Colores. */
  theme_colors: ThemeColors;
};

/** Ajustes de tienda tal como los devuelve la API (`GET /api/settings`). */
export type ApiSettings = {
  name: string;
  announcement: string | null;
  hero_title: string | null;
  hero_description: string | null;
  story_headline: string | null;
  story_description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  instagram_url: string | null;
  instagram_embed_url: string | null;
  bank_account_info: string | null;
  theme_colors: Partial<Record<string, string>> | null;
};

/** Combina los ajustes guardados en el panel con los valores por defecto. */
export function mergeSettings(current: StoreConfig, data: ApiSettings): StoreConfig {
  return {
    ...current,
    name: data.name ?? current.name,
    announcement: data.announcement ?? current.announcement,
    headline: data.hero_title ?? current.headline,
    description: data.hero_description ?? current.description,
    storyHeadline: data.story_headline ?? current.storyHeadline,
    storyDescription: data.story_description ?? current.storyDescription,
    contact_email: data.contact_email ?? current.contact_email,
    contact_phone: data.contact_phone ?? current.contact_phone,
    whatsapp_phone: data.whatsapp_phone ?? current.whatsapp_phone,
    instagram_url: data.instagram_url ?? current.instagram_url,
    instagram_embed_url: data.instagram_embed_url ?? current.instagram_embed_url,
    bank_account_info: data.bank_account_info ?? current.bank_account_info,
    // La paleta se normaliza acá (no se copia tal cual): así un valor viejo o incompleto no deja la
    // tienda sin color y los tonos que falten caen a la paleta por defecto.
    theme_colors: data.theme_colors ? normalizeThemeColors(data.theme_colors) : current.theme_colors,
  };
}

export const storeConfig: StoreConfig = {
  name: "Tienda Base",
  announcement: "Compra simple, productos que importan",
  eyebrow: "Tu colección, tu estilo",
  headline: "Una tienda que se adapta a tu negocio.",
  description: "Una base limpia para mostrar productos, conectar con clientes y hacer crecer una marca propia.",
  featuredCollection: "Colección destacada",
  storyEyebrow: "Una plantilla que crece contigo",
  storyHeadline: "Haz que tu marca se sienta única.",
  storyDescription: "Personaliza este espacio para comunicar tu propuesta, historia, beneficios o cualquier mensaje importante para tus clientes.",
  contact_email: "",
  contact_phone: "",
  whatsapp_phone: "",
  instagram_url: "",
  instagram_embed_url: "",
  bank_account_info: "",
  theme_colors: defaultThemeColors,
};