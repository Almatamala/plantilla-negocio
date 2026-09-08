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
  contact_phone: string;
  whatsapp_phone: string;
  instagram_url: string;
  bank_account_info: string;
};

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
  contact_phone: "",
  whatsapp_phone: "",
  instagram_url: "",
  bank_account_info: "",
};