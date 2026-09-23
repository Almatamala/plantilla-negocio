import { NextResponse } from "next/server";
import { INSTAGRAM_POST_COUNT, type InstagramFeed, type InstagramPost } from "@/lib/instagram";

/**
 * Feed de Instagram propio, del lado del servidor (D30).
 *
 * El token de la cuenta profesional nunca llega al navegador: vive en `INSTAGRAM_USER_ID` /
 * `INSTAGRAM_ACCESS_TOKEN` (solo servidor) y este route handler consulta la API de Instagram, limpia la
 * respuesta y entrega al componente **solo** lo que necesita pintar. Así el widget de terceros de D23
 * deja de ser necesario (el iframe del proveedor mostraba las publicaciones pero no sus datos).
 *
 * Los datos se guardan en la caché de datos de Next durante `CACHE_SECONDS`, así que la página puede
 * recargarse muchas veces sin gastar llamadas de la API.
 */

const GRAPH_API = "https://graph.instagram.com/v23.0";
const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "like_count",
  "comments_count",
  "children{media_type,media_url,thumbnail_url}",
].join(",");
/** Cuánto se guarda la respuesta antes de volver a pedirla a Instagram (15 min). */
const CACHE_SECONDS = 900;

type GraphChild = { media_type?: string; media_url?: string; thumbnail_url?: string };

type GraphMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: { data?: GraphChild[] };
};

/**
 * Imagen que se pinta en la grilla. El video se representa con su miniatura y el carrusel con la
 * primera imagen hija (su `media_url` no existe): por eso se prueban en ese orden y se descarta lo que
 * no traiga ninguna.
 */
function imageOf(media: GraphMedia): string {
  const first = media.children?.data?.[0];
  const candidates = [media.thumbnail_url, media.media_url, first?.thumbnail_url, first?.media_url];
  return candidates.find((url) => typeof url === "string" && url.length > 0) ?? "";
}

export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = process.env.INSTAGRAM_USER_ID?.trim();

  // Sin credenciales la sección no se dibuja (igual que el widget anterior): no es un error de la página.
  if (!token || !userId) return NextResponse.json({ configured: false, posts: [] });

  const url = `${GRAPH_API}/${userId}/media?fields=${encodeURIComponent(MEDIA_FIELDS)}&limit=${INSTAGRAM_POST_COUNT}&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    const data = (await res.json()) as { data?: GraphMedia[]; error?: { message?: string } };
    if (!res.ok || data.error) {
      // No se registra la URL: lleva el token.
      console.error("[instagram] la API respondió con error:", data.error?.message ?? res.status);
      return NextResponse.json({ configured: true, posts: [], error: "No se pudo leer el feed." }, { status: 502 });
    }

    const posts: InstagramPost[] = (data.data ?? [])
      .map((media) => ({
        id: media.id,
        image: imageOf(media),
        permalink: media.permalink ?? "",
        caption: media.caption ?? "",
        likes: media.like_count ?? 0,
        comments: media.comments_count ?? 0,
        isVideo: media.media_type === "VIDEO",
        timestamp: media.timestamp ?? "",
      }))
      .filter((post) => post.image)
      .slice(0, INSTAGRAM_POST_COUNT);

    return NextResponse.json({ configured: true, posts } satisfies InstagramFeed);
  } catch (error) {
    console.error("[instagram] no se pudo consultar la API:", error instanceof Error ? error.message : error);
    return NextResponse.json({ configured: true, posts: [], error: "No se pudo leer el feed." }, { status: 502 });
  }
}
