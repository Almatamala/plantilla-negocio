/**
 * Cliente HTTP para la API dockerizada (FastAPI en AWS).
 * La API es la única fuente de verdad: catálogo, agenda, zonas, reviews,
 * órdenes, ajustes e imágenes. Las mutaciones administrativas envían el
 * JWT de sesión (Authorization: Bearer) de la sesión iniciada; como respaldo,
 * la clave `API_ADMIN_TOKEN` en localStorage (X-Admin-Token) para acceso directo.
 */
import { getSession, resetSession } from "@/lib/session-client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ADMIN_TOKEN_KEY = "bosque-admin-token";

/**
 * Devuelve el JWT de sesión leyéndolo desde la cookie httpOnly a través del route handler
 * /api/auth/me. La respuesta es compartida por todos los componentes (ver `lib/session-client.ts`),
 * así que esta llamada no genera peticiones repetidas. Solo corre en el navegador.
 */
async function getSessionToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  const session = await getSession();
  return session.token;
}

function getAdminToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

function clearAdminToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Cabeceras para todo lo que la API protege con `require_admin`: el JWT de la sesión (`Bearer`) y, solo
 * como respaldo para acceso directo a la API, la clave legacy `X-Admin-Token`.
 *
 * **Toda** petición administrativa debe pasar por acá: la subida de imágenes mandaba únicamente la
 * clave legacy, así que con el login por sesión (D13) respondía 401 y no se podían subir fotos desde
 * el panel (A19).
 */
async function adminHeaders(): Promise<Record<string, string>> {
  const sessionToken = await getSessionToken();
  if (sessionToken) return { Authorization: `Bearer ${sessionToken}` };
  const token = getAdminToken();
  return token ? { "X-Admin-Token": token } : {};
}

/** Cierra la sesión: borra la cookie httpOnly y limpia las cachés del cliente. */
export async function endSession() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  resetSession();
  clearAdminToken();
}

/** Convierte una ruta relativa de la API (p. ej. `/uploads/foto.jpg`) en URL absoluta. */
function absoluteUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_URL}${path}`;
}

async function errorDetail(response: Response): Promise<string> {
  let detail = `Error ${response.status}`;
  try {
    const data = await response.json();
    if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
  } catch { /* sin cuerpo JSON */ }
  return detail;
}

/**
 * Petición a la API.
 *
 * El `Content-Type` se manda **solo cuando hay cuerpo**: en un GET sin `body` esa cabecera no aporta
 * nada y, por no estar en la lista blanca de CORS, obligaba al navegador a hacer un **preflight
 * OPTIONS** antes de cada lectura (la API vive en otro origen). Sin ella, los GET son peticiones
 * simples y van directo, lo que ahorra un viaje por lectura en todas las pantallas.
 */
export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.admin) Object.assign(headers, await adminHeaders());
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", headers: await adminHeaders(), body: form });
  if (!res.ok) throw new Error(await errorDetail(res));
  const data = (await res.json()) as { url: string };
  return absoluteUrl(data.url);
}