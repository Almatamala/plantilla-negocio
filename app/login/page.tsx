"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_URL, setAdminToken } from "@/lib/api";
import { storeConfig } from "@/lib/store-config";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    if (!token.trim()) { setMessage("Ingresa la clave de administración."); setLoading(false); return; }
    // Valida el token contra la API antes de guardarlo.
    fetch(`${API_URL}/api/categories`, { headers: { "X-Admin-Token": token.trim() } })
      .then((res) => {
        if (!res.ok) { setMessage("Clave inválida. Revisa API_ADMIN_TOKEN en el backend."); setLoading(false); return; }
        setAdminToken(token.trim());
        router.push("/admin");
      })
      .catch(() => { setMessage(`No se pudo conectar con la API (${API_URL}). Verifica NEXT_PUBLIC_API_URL.`); setLoading(false); });
  }
  return <main className="grid min-h-screen place-items-center px-5"><section className="w-full max-w-md"><Link href="/" className="display text-3xl">{storeConfig.name}</Link><p className="mt-8 text-xs tracking-[.18em] text-[#56745c] uppercase">Acceso del equipo</p><h1 className="display mt-3 text-4xl">Bienvenido de vuelta</h1><p className="mt-3 leading-7 text-[#647167]">Ingresa la clave de administración definida en <code className="rounded bg-[#edf0e8] px-1.5 py-0.5 text-xs">API_ADMIN_TOKEN</code> del backend.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm">Clave de administración<input required type="password" value={token} onChange={(e) => setToken(e.target.value)} className="mt-2 w-full border border-[#c7ccc3] bg-white px-4 py-3 outline-[#56745c]" placeholder="••••••••"/></label><button disabled={loading} className="w-full bg-[#243128] py-3.5 text-sm text-white disabled:opacity-50">{loading ? "Validando..." : "Entrar al panel"}</button></form>{message && <p className="mt-4 rounded-lg bg-[#edf0e8] p-3 text-sm">{message}</p>}<Link href="/" className="mt-8 inline-block text-sm underline underline-offset-4">Volver a la tienda</Link></section></main>;
}