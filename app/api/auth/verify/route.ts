import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { withSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Confirma el código temporal de 6 dígitos y deja la sesión en cookie httpOnly. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Ingresa el código de 6 dígitos que llegó a tu correo." }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token || !data?.user) {
      return NextResponse.json(
        { error: data?.detail ?? "No se pudo confirmar el código." },
        { status: res.ok ? 502 : res.status },
      );
    }
    return withSessionCookie(NextResponse.json({ ok: true, role: data.user.role }), data.token);
  } catch {
    return NextResponse.json({ error: `No se pudo conectar con la API (${API_URL}).` }, { status: 502 });
  }
}
