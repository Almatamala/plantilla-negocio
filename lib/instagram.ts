/**
 * Feed de Instagram **propio** (D30): tipos y configuración compartidos entre el route handler
 * (`app/api/instagram/feed/route.ts`), que consulta la API de Instagram **desde el servidor** con el
 * token de entorno, y el widget (`components/instagram-grid.tsx`), que lo pinta en la tienda.
 *
 * La configuración vive **solo acá** (no hay ajuste en el panel): por defecto se muestran las **15
 * últimas publicaciones en 3 filas de 5 columnas** en escritorio y **2 por fila en celular**; cambiar el
 * reparto es cambiar estas constantes.
 *
 * En celular, además, **la última fila no deja sobras**: si la cantidad de publicaciones no es múltiplo
 * de `INSTAGRAM_COLUMNS_MOBILE`, las que sobran no se pintan (con 15 publicaciones y 2 columnas se ven
 * **14**, o sea 7 filas completas) y vuelven a aparecer en escritorio.
 */
export const INSTAGRAM_POST_COUNT = 15;
export const INSTAGRAM_COLUMNS = 5;
export const INSTAGRAM_COLUMNS_MOBILE = 2;

/** Una publicación ya normalizada para la grilla (se descarta lo que no se pinta). */
export type InstagramPost = {
  id: string;
  /** URL de la imagen: la propia, la miniatura del video o la primera del carrusel. */
  image: string;
  permalink: string;
  caption: string;
  likes: number;
  comments: number;
  isVideo: boolean;
  timestamp: string;
};

/** Respuesta de `GET /api/instagram/feed`. `configured: false` significa que faltan credenciales. */
export type InstagramFeed = { configured: boolean; posts: InstagramPost[] };
