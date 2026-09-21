/**
 * Últimas publicaciones de Instagram al final de la página principal, como en la referencia
 * https://www.studiopasacademy.com.
 *
 * El embed oficial de Instagram no se puede ensanchar más allá de su tarjeta (~540 px) ni ocultar su
 * encabezado, así que para mostrar **solo las publicaciones a ancho completo** se usa un **widget de
 * terceros** (D23): el dueño crea el widget gratis en el proveedor elegido y pega su **código o URL de
 * iframe** en el panel (Contenido › Instagram — código o URL del widget). Acá se pinta ese iframe
 * —**de borde a borde** de la pantalla— y nada más: sin encabezado ni enlace al perfil, porque el propio
 * widget ya muestra las publicaciones y lleva a Instagram.
 *
 * Si no hay widget configurado, la sección no se dibuja.
 */

/**
 * Acepta la URL pelada del widget o el fragmento que entrega el proveedor (`<iframe src="…" height="…">`) y
 * devuelve un `src` http(s) válido más la altura sugerida, si viene. Cualquier otra cosa se ignora en vez
 * de inyectarse en la página: solo se leen esos dos atributos, nunca el HTML completo.
 */
function parseEmbed(value: string | null | undefined): { src: string; height: number | null } | null {
  if (!value) return null;
  const srcMatch = value.match(/src\s*=\s*["']([^"']+)["']/i);
  const src = (srcMatch ? srcMatch[1] : value).trim();
  if (!/^https?:\/\//i.test(src)) return null;
  const heightMatch = value.match(/height\s*=\s*["']?(\d{3,4})/i);
  // Se acota para que un valor raro no rompa la sección (el widget suele sugerir 1000px).
  const height = heightMatch ? Math.min(1600, Math.max(400, Number(heightMatch[1]))) : null;
  return { src, height };
}

export function InstagramFeed({ embedUrl }: { embedUrl?: string | null }) {
  const embed = parseEmbed(embedUrl);
  if (!embed) return null;

  // Sección "pura": solo el widget, sin fondo, sin padding y sin contenedores intermedios, para que la
  // grilla llegue de borde a borde de la pantalla.
  return (
    <section id="instagram">
      <iframe
        src={embed.src}
        title="Últimas publicaciones de Instagram"
        className="block w-full"
        style={{ height: embed.height ?? 640 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}
