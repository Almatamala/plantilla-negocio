import type { CSSProperties } from "react";

/**
 * Paleta de marca **editable** desde el panel (Contenido › Colores).
 *
 * Son los cinco tonos de la identidad cálida, nombrados por el uso que tienen en la tienda. Los valores
 * por defecto son la paleta con la que se diseñó la carta, así que sin guardar nada la tienda se ve igual
 * que antes. Lo que no se edita (el texto claro sobre los bloques oscuros y los rellenos de los visuales
 * de relleno) se deriva en `app/globals.css` con `color-mix`, para que cualquier combinación quede
 * legible.
 */
export type ThemeColorKey = "accent" | "ink" | "surface" | "muted" | "detail";

export type ThemeColors = Record<ThemeColorKey, string>;

export const defaultThemeColors: ThemeColors = {
  accent: "#808c6d",
  ink: "#401a04",
  surface: "#d7cdc1",
  muted: "#846851",
  detail: "#d9b391",
};

/** Etiquetas del panel: qué pinta cada tono en la tienda pública. */
export const themeColorFields: { key: ThemeColorKey; label: string; hint: string }[] = [
  { key: "accent", label: "Acento", hint: "Botones, filtros, enlaces y la sección de historia" },
  { key: "ink", label: "Tinta", hint: "Texto principal, footer y bloques oscuros" },
  { key: "surface", label: "Bloque suave", hint: "Fondo del catálogo, bordes y fotos de relleno" },
  { key: "muted", label: "Texto secundario", hint: "Descripciones, contadores y líneas" },
  { key: "detail", label: "Detalle cálido", hint: "Títulos de contacto e interiores de los visuales" },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** ¿Es un color hexadecimal de seis dígitos (lo único que aceptan la API y el panel)? */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

/**
 * Paleta utilizable a partir de lo que devuelve la API: cada tono guardado se respeta solo si es un hex
 * válido y los que falten caen a la paleta por defecto, así que una tienda sin colores guardados (o con
 * una respuesta vieja del respaldo sin conexión) siempre pinta algo coherente.
 */
export function normalizeThemeColors(saved?: Partial<Record<string, string>> | null): ThemeColors {
  const colors = { ...defaultThemeColors };
  if (!saved) return colors;
  for (const key of Object.keys(defaultThemeColors) as ThemeColorKey[]) {
    const value = saved[key];
    if (typeof value === "string" && isHexColor(value)) colors[key] = value.trim().toLowerCase();
  }
  return colors;
}

/** Variables CSS de la paleta, para escribir en línea en el `<main>` de las vistas cálidas. */
export function themeVars(colors: ThemeColors): CSSProperties {
  return {
    "--brand-accent": colors.accent,
    "--brand-ink": colors.ink,
    "--brand-surface": colors.surface,
    "--brand-muted": colors.muted,
    "--brand-detail": colors.detail,
  } as CSSProperties;
}
