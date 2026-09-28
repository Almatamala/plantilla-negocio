/**
 * Feed de Instagram **propio** (D30): configuración del widget de la tienda y espejo de lo que devuelve
 * la API.
 *
 * Los datos los sirve `GET /api/instagram/feed` de la **API** (que es la única fuente de verdad, D7):
 * ahí vive el token de larga duración, ahí se consulta Instagram y ahí corre la **tarea de fondo que
 * renueva el token sola** (`backend/app/instagram.py`). El navegador solo recibe las publicaciones ya
 * normalizadas, nunca el token. Los tipos de abajo coinciden campo por campo con `InstagramPostOut` /
 * `InstagramFeedOut` de `backend/app/schemas.py`.
 *
 * La configuración del widget vive **solo acá** (no hay ajuste en el panel): por defecto se muestran las
 * **15 últimas publicaciones en 3 filas de 5 columnas** en escritorio y **2 por fila en celular**.
 *
 * En celular, además, **la última fila no deja sobras**: si la cantidad de publicaciones no es múltiplo
 * de `INSTAGRAM_COLUMNS_MOBILE`, las que sobran no se pintan (con 15 publicaciones y 2 columnas se ven
 * **14**, o sea 7 filas completas) y vuelven a aparecer en escritorio.
 */
export const INSTAGRAM_POST_COUNT = 15;
export const INSTAGRAM_COLUMNS = 5;
export const INSTAGRAM_COLUMNS_MOBILE = 2;

/** Una publicación ya normalizada para la grilla (la API descarta lo que no se puede pintar). */
export type InstagramPost = {
  id: string;
  /** URL de la imagen: la propia, la miniatura del video o la primera del carrusel. */
  image: string;
  permalink: string;
  caption: string;
  likes: number;
  comments: number;
  is_video: boolean;
  timestamp: string;
};

/** Respuesta de `GET /api/instagram/feed`. `configured: false` significa que faltan credenciales. */
export type InstagramFeed = { configured: boolean; posts: InstagramPost[] };
