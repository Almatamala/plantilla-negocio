/**
 * Sesión del navegador: una sola lectura de `GET /api/auth/me` para toda la app.
 *
 * Antes cada pantalla pedía la sesión por su cuenta (el header, el checkout, la cuenta y el panel)
 * y en desarrollo React monta los efectos dos veces, así que al arrancar se veían **dos** llamadas
 * idénticas al route handler. Acá la petición se guarda como promesa compartida: quien la necesite
 * después recibe el mismo resultado sin volver a pedirlo.
 *
 * El token sigue viviendo solo en la cookie httpOnly: este módulo únicamente lo deja en memoria
 * para las mutaciones admin (`Authorization: Bearer`).
 */

export type SessionUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string;
  role: string;
};

export type SessionState = {
  /** `loading` mientras no responde el route handler; `ready` cuando ya se sabe si hay sesión. */
  status: "loading" | "ready";
  user: SessionUser | null;
  token: string;
};

/** Estado inicial: en el servidor siempre es «sin sesión» para que la hidratación coincida. */
const LOADING: SessionState = { status: "loading", user: null, token: "" };

let snapshot: SessionState = LOADING;
let pending: Promise<SessionState> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

async function load(): Promise<SessionState> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const data = (await res.json()) as { user?: SessionUser | null; token?: string };
    snapshot = { status: "ready", user: data?.user ?? null, token: data?.token ?? "" };
  } catch {
    // Sin API no se sabe si hay sesión: se trata como invitado.
    snapshot = { status: "ready", user: null, token: "" };
  }
  emit();
  return snapshot;
}

/** Estado actual (referencia estable mientras no cambie). */
export function getSessionSnapshot(): SessionState {
  return snapshot;
}

/** Snapshot que usa React en el servidor y en la hidratación. */
export function getServerSessionSnapshot(): SessionState {
  return LOADING;
}

/** Pide la sesión una sola vez por carga de página; las llamadas siguientes comparten la promesa. */
export function getSession(): Promise<SessionState> {
  if (!pending) pending = load();
  return pending;
}

/** Vuelve a consultar la sesión (tras iniciar sesión o al guardar los datos de la cuenta). */
export function refreshSession(): Promise<SessionState> {
  pending = null;
  return getSession();
}

/** Descarta lo cacheado (al cerrar sesión o al iniciar sesión con otra cuenta). */
export function resetSession(): void {
  pending = null;
  snapshot = { status: "ready", user: null, token: "" };
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
