"use client";

import { useEffect, useState } from "react";

export type AccountLink = { href: string; label: string };

/**
 * Enlace de cuenta del header: el admin va directo al panel, el cliente a su
 * cuenta y quien no ha iniciado sesión al login. Devuelve `null` mientras se
 * resuelve la sesión para no parpadear con el enlace equivocado.
 */
export function useAccountLink(): AccountLink | null {
  const [role, setRole] = useState<string | null>();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => { if (active) setRole(data?.user?.role ?? null); })
      .catch(() => { if (active) setRole(null); });
    return () => { active = false; };
  }, []);

  if (role === undefined) return null;
  if (role === "admin") return { href: "/admin", label: "Panel admin" };
  if (role) return { href: "/cuenta", label: "Mi cuenta" };
  return { href: "/login", label: "Iniciar sesión" };
}
