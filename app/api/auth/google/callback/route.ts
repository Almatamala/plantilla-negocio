import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días, igual que en la API

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
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.set(SESSION_COOKIE, data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }
}