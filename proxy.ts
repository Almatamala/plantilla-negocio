import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, withSessionCookie } from "@/lib/session";

// Modo demo: la portada lleva al panel y, si no hay sesión, se inicia con la cuenta de demostración.
// Se activa solo con `DEMO_AUTO_ADMIN=true`; en una tienda real no debe estar definida.
const DEMO_AUTO_ADMIN = process.env.DEMO_AUTO_ADMIN === "true";
const DEMO_EMAIL = (process.env.DEMO_ADMIN_EMAIL ?? "demo@bosque.cl").trim();
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "bosque-demo";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Pide a la API una sesión con la cuenta demo. Devuelve "" si no se pudo. */
async function demoAdminToken(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = (await res.json().catch(() => null)) as { token?: unknown } | null;
    return typeof data?.token === "string" ? data.token : "";
  } catch {
    return "";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // El panel de administración solo es accesible con una sesión de rol admin.
  if (pathname.startsWith("/admin")) {
    if (session?.role === "admin") return NextResponse.next();
    if (DEMO_AUTO_ADMIN) {
      const token = await demoAdminToken();
      // Si el autologin falla (API caída, cuenta cambiada) se cae al formulario y no a "/": con la
      // portada apuntando al panel, ese rebote sería un bucle infinito.
      if (!token) return NextResponse.redirect(new URL("/login", request.url));
      return withSessionCookie(
        NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, request.url)),
        token,
      );
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // El admin no usa la vista de cuenta: su lugar es el panel.
  if (pathname.startsWith("/cuenta") && session?.role === "admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Un usuario ya logueado no necesita volver a /login.
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(session.role === "admin" ? "/admin" : "/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$).*)"],
};