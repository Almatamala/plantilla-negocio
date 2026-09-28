import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/api/auth/google/authorize`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      // Sin credenciales de Google, volvemos al login con un aviso amigable
      // en vez de mostrar un JSON de error crudo.
      return NextResponse.redirect(new URL("/login?error=google-no-config", request.url));
    }
    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.json(
      { error: `No se pudo conectar con la API (${API_URL}). Verifica NEXT_PUBLIC_API_URL.` },
      { status: 502 },
    );
  }
}