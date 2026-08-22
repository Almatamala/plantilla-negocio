/**
 * Punto único para personalizar una nueva tienda sin modificar la interfaz.
 * En una segunda etapa estos valores pueden vivir en la tabla `store_settings`.
 */
export const storeConfig = {
  name: "Tienda Base",
  announcement: "Compra simple, productos que importan",
  eyebrow: "Tu colección, tu estilo",
  headline: "Una tienda que se adapta a tu negocio.",
  description: "Una base limpia para mostrar productos, conectar con clientes y hacer crecer una marca propia.",
  featuredCollection: "Colección destacada",
  storyEyebrow: "Una plantilla que crece contigo",
  storyHeadline: "Haz que tu marca se sienta única.",
  storyDescription: "Personaliza este espacio para comunicar tu propuesta, historia, beneficios o cualquier mensaje importante para tus clientes.",
} as const;
