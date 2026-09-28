import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Pide un código de confirmación nuevo (la API limita los reenvíos). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "Falta el correo." }, { status: 400 });
  try {
    const res = await fetch(`${API_URL}/api/auth/resend-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ error: data?.detail ?? "No se pudo reenviar el código." }, { status: res.status });
    }
    return NextResponse.json({ ok: true, message: data?.message ?? "Te enviamos un código nuevo." });
  } catch {
    return NextResponse.json({ error: `No se pudo conectar con la API (${API_URL}).` }, { status: 502 });
  }
}
