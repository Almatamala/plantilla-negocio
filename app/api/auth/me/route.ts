import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ user: null });
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ user: null });
    const user = await res.json();
    // El token es el JWT de sesión propio (solo sub/role/exp), necesario para
    // las llamadas admin directas a la API (Authorization: Bearer).
    return NextResponse.json({ user, token });
  } catch {
    return NextResponse.json({ user: null });
  }
}