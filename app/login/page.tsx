"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { storeConfig } from "@/lib/store-config";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const client = createClient();
    if (!client) { setMessage("Configura las variables de Supabase para activar el acceso."); setLoading(false); return; }
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/admin` } });
    setMessage(error ? error.message : "Revisa tu correo: te enviamos un enlace seguro para ingresar."); setLoading(false);
  }
  return <main className="grid min-h-screen place-items-center px-5"><section className="w-full max-w-md"><Link href="/" className="display text-3xl">{storeConfig.name}</Link><p className="mt-8 text-xs tracking-[.18em] text-[#56745c] uppercase">Acceso de clientes y equipo</p><h1 className="display mt-3 text-4xl">Bienvenido de vuelta</h1><p className="mt-3 leading-7 text-[#647167]">Usamos un enlace de acceso, sin contraseñas que recordar.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm">Correo electrónico<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full border border-[#c7ccc3] bg-white px-4 py-3 outline-[#56745c]" placeholder="hola@ejemplo.cl"/></label><button disabled={loading} className="w-full bg-[#243128] py-3.5 text-sm text-white disabled:opacity-50">{loading ? "Enviando..." : "Enviar enlace de acceso"}</button></form>{message && <p className="mt-4 rounded-lg bg-[#edf0e8] p-3 text-sm">{message}</p>}<Link href="/" className="mt-8 inline-block text-sm underline underline-offset-4">Volver a la tienda</Link></section></main>;
}
