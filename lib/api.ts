/**
 * Cliente HTTP para la API dockerizada (FastAPI en AWS).
 * La API es la única fuente de verdad: catálogo, agenda, zonas, reviews,
 * órdenes, ajustes e imágenes. Las mutaciones administrativas envían el
 * JWT de sesión (Authorization: Bearer) cuando hay sesión de Google activa;
 * como respaldo, la clave `API_ADMIN_TOKEN` guardada en /login (X-Admin-Token).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ADMIN_TOKEN_KEY = "bosque-admin-token";

let sessionTokenCache = "";

/**
 * Devuelve el JWT de sesión (si hay login con Google) leyéndolo desde la cookie
 * httpOnly a través del route handler /api/auth/me. Solo corre en el navegador.
 */
export async function getSessionToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (sessionTokenCache) return sessionTokenCache;
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await res.json();
    if (data?.token) sessionTokenCache = data.token;
    return data?.token ?? "";
  } catch {
    return "";
  }
}

export function clearSessionTokenCache() {
  sessionTokenCache = "";
}

export function getAdminToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function absoluteUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_URL}${path}`;
}

export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.admin) {
    const sessionToken = await getSessionToken();
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    } else {
      const token = getAdminToken();
      if (token) headers["X-Admin-Token"] = token;
    }
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch { /* sin cuerpo JSON */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function uploadImage(file: File): Promise<string> {
  const token = getAdminToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", headers: token ? { "X-Admin-Token": token } : {}, body: form });
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try { const data = await res.json(); if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail); } catch { /* noop */ }
    throw new Error(detail);
  }
  const data = (await res.json()) as { url: string };
  return absoluteUrl(data.url);
}