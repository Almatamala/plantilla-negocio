"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Heart, MessageCircle, Play } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { INSTAGRAM_COLUMNS, INSTAGRAM_COLUMNS_MOBILE, INSTAGRAM_POST_COUNT, type InstagramFeed } from "@/lib/instagram";

/**
 * Feed de Instagram **propio** (D30), que reemplazó al iframe de un proveedor externo (D23).
 *
 * Las publicaciones las sirve `GET /api/instagram/feed` de la **API**, que guarda el token de larga
 * duración, consulta Instagram y lo **renueva sola** con una tarea de fondo (`backend/app/instagram.py`);
 * el navegador nunca ve el token. Por defecto se muestran las **15 últimas publicaciones** en **3 filas de 5
 * columnas** en escritorio y **2 por fila en celular** (ver `lib/instagram.ts`); al pasar el mouse por una
 * foto se ven **likes, comentarios y la descripción**, y cada tarjeta lleva a la publicación en Instagram.
 * En celular la última fila no deja sobras: las publicaciones que no completan la fila no se pintan.
 *
 * La separación entre publicaciones es un margen real (`gap-1`, 4 px): los huecos dejan ver el fondo de la
 * página en vez de las líneas de 1 px con las que antes se pegaban las fotos. La sección suma además un
 * **respiro vertical** (`py-1`, 4 px arriba y abajo) para que las publicaciones no toquen el bloque de
 * historia ni el footer.
 */

/** Cuánto se espera antes de volver a pedir el feed (15 min, igual que la caché de la API). */
const REFRESH_MS = 15 * 60 * 1000;

export function InstagramGrid() {
  const [feed, setFeed] = useState<InstagramFeed | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiFetch<InstagramFeed>(`/api/instagram/feed?limit=${INSTAGRAM_POST_COUNT}`);
        if (active) setFeed(data);
      } catch {
        // Sin respuesta (API o Instagram caídos) la sección no se dibuja, igual que antes.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  // Sin credenciales, sin publicaciones o con la API caída la sección no se dibuja, igual que el widget
  // anterior: la tienda no muestra un bloque roto.
  if (!feed?.configured || feed.posts.length === 0) return null;

  // En celular las publicaciones que no completan la última fila se ocultan (y vuelven en escritorio):
  // con 15 publicaciones y 2 columnas se ven 14, así que nunca queda una foto sola colgando.
  const firstHiddenOnMobile = feed.posts.length - (feed.posts.length % INSTAGRAM_COLUMNS_MOBILE);

  return (
    <section id="instagram" aria-label="Últimas publicaciones de Instagram" className="py-1">
      <div
        className="grid grid-cols-[repeat(var(--ig-columns-mobile),minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(var(--ig-columns),minmax(0,1fr))]"
        style={{ "--ig-columns": INSTAGRAM_COLUMNS, "--ig-columns-mobile": INSTAGRAM_COLUMNS_MOBILE } as CSSProperties}
      >
        {feed.posts.map((post, index) => (
          <a
            key={post.id}
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            aria-label={post.caption ? `Ver en Instagram: ${post.caption.slice(0, 90)}` : "Ver publicación en Instagram"}
            className={`group relative aspect-square overflow-hidden bg-[var(--brand-surface)] ${index >= firstHiddenOnMobile ? "hidden sm:block" : "block"}`}
          >
            <img
              src={post.image}
              alt={post.caption ? post.caption.slice(0, 90) : "Publicación de Instagram"}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            {post.is_video && (
              <Play size={16} className="absolute top-3 right-3 text-white drop-shadow" aria-hidden />
            )}
            {/* Al posar el mouse: likes, comentarios y descripción, sobre la tinta de la marca. */}
            <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-[var(--brand-ink)]/85 p-3 text-[var(--brand-surface-soft)] opacity-0 transition duration-300 group-hover:opacity-100">
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="flex items-center gap-1.5"><Heart size={16} aria-hidden />{post.likes}</span>
                <span className="flex items-center gap-1.5"><MessageCircle size={16} aria-hidden />{post.comments}</span>
              </div>
              <p className="line-clamp-3 text-xs leading-5 opacity-90">{post.caption || "Sin descripción."}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
