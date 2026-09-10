import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días, igual que en la API

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const mode = body?.mode === "register" ? "register" : "login";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Ingresa correo y contraseña." }, { status: 400 });
  }
  const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const payload = mode === "register" ? { name, email, password } : { email, password };
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token || !data?.user) {
      return NextResponse.json(
        { error: data?.detail ?? "No se pudo iniciar sesión." },
        { status: res.status },
      );
    }
    const response = NextResponse.json({ ok: true, role: data.user.role });
    response.cookies.set(SESSION_COOKIE, data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: `No se pudo conectar con la API (${API_URL}). Verifica NEXT_PUBLIC_API_URL.` },
      { status: 502 },
    );
  }
}