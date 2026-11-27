import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { withSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Inicia sesión con la cuenta demo y vuelve al panel.
 *
 * Vive en una route handler y no en el middleware a propósito: el middleware corre en el edge y
 * llamar desde ahí al login del mismo deployment se quedaba esperando varios segundos (a veces
 * colgado) en cada primera visita. Solo responde si `DEMO_AUTO_ADMIN=true`.
 */
export async function GET(request: NextRequest) {
  if (process.env.DEMO_AUTO_ADMIN !== "true") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const next = request.nextUrl.searchParams.get("next") ?? "/admin";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const email = (process.env.DEMO_ADMIN_EMAIL ?? "demo@bosque.cl").trim();
  const password = process.env.DEMO_ADMIN_PASSWORD ?? "bosque-demo";
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { token?: unknown } | null;
    if (!res.ok || typeof data?.token !== "string") {
      return NextResponse.redirect(new URL("/login?error=demo", request.url));
    }
    return withSessionCookie(NextResponse.redirect(new URL(safe, request.url)), data.token);
  } catch {
    return NextResponse.redirect(new URL("/login?error=demo", request.url));
  }
}
