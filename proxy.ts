import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Modo demo: el panel abre con la cuenta demo sin pasar por el formulario. Se activa solo con
// `DEMO_AUTO_ADMIN=true`; en una tienda real no debe estar definida. El login vive en
// `/api/demo/session` (una route handler), no acá: el middleware corre en el edge y llamar al login
// del mismo deployment desde ahí tardaba segundos o se quedaba colgado.
const DEMO_AUTO_ADMIN = process.env.DEMO_AUTO_ADMIN === "true";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // El panel de administración solo es accesible con una sesión de rol admin.
  if (pathname.startsWith("/admin")) {
    if (session?.role === "admin") return NextResponse.next();
    if (DEMO_AUTO_ADMIN) {
      const target = new URL("/api/demo/session", request.url);
      target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(target);
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