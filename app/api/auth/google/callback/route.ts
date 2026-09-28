import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { withSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const next = request.nextUrl.searchParams.get("next");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=denegado", request.url));
  }
  try {
    const res = await fetch(`${API_URL}/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token || !data?.user) {
      return NextResponse.redirect(new URL("/login?error=1", request.url));
    }
    const destination = next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : data.user.role === "admin"
        ? "/admin"
        : "/";
    // Misma cookie httpOnly que el login y la verificación (`lib/session.ts`), en un solo lugar.
    return withSessionCookie(NextResponse.redirect(new URL(destination, request.url)), data.token);
  } catch {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }
}