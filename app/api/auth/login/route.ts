import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { withSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

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

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? "No se pudo iniciar sesión.", needs_verification: res.status === 403 },
        { status: res.status },
      );
    }

    // Cuenta creada con confirmación por correo activa: todavía no hay sesión.
    if (data?.verification_required) {
      return NextResponse.json({
        ok: true,
        verification_required: true,
        email: data.email ?? email,
        sent: Boolean(data.sent),
        message: data.message ?? "",
      });
    }

    if (!data?.token || !data?.user) {
      return NextResponse.json({ error: "No se pudo iniciar sesión." }, { status: 502 });
    }
    return withSessionCookie(NextResponse.json({ ok: true, role: data.user.role, verification_required: false }), data.token);
  } catch {
    return NextResponse.json(
      { error: `No se pudo conectar con la API (${API_URL}). Verifica NEXT_PUBLIC_API_URL.` },
      { status: 502 },
    );
  }
}
