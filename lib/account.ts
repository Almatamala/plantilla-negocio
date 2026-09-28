"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getServerSessionSnapshot,
  getSession,
  getSessionSnapshot,
  subscribeSession,
  type SessionState,
} from "@/lib/session-client";

export type AccountLink = { href: string; label: string };

/**
 * Sesión del navegador (usuario + token). Todos los componentes que la necesitan —header, cuenta,
 * checkout y panel— comparten la misma respuesta de `GET /api/auth/me` en lugar de pedirla cada uno
 * (ver `lib/session-client.ts`).
 */
export function useSession(): SessionState {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);

  useEffect(() => {
    // En desarrollo el efecto se monta dos veces: la promesa compartida evita la segunda petición.
    void getSession();
  }, []);

  return session;
}

/**
 * Enlace de cuenta del header: el admin va directo al panel, el cliente a su cuenta y quien no ha
 * iniciado sesión al login. Devuelve `null` mientras se resuelve la sesión para no parpadear con el
 * enlace equivocado.
 */
export function useAccountLink(): AccountLink | null {
  const session = useSession();

  if (session.status === "loading") return null;
  if (session.user?.role === "admin") return { href: "/admin", label: "Panel admin" };
  if (session.user) return { href: "/cuenta", label: "Mi cuenta" };
  return { href: "/login", label: "Iniciar sesión" };
}
