import "server-only";
import { jwtVerify } from "jose";

/** Nombre de la cookie httpOnly donde vive la sesión (JWT emitido por la API). */
export const SESSION_COOKIE = "bosque_session";

export type SessionUser = { id: string; role: string };

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET no está definido. Debe coincidir con el del backend.");
  }
  return new TextEncoder().encode(secret);
}

/** Verifica la firma y expiración del JWT de sesión (optimista, sin tocar la BD). */
export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}