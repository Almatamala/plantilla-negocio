"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSessionTokenCache } from "@/lib/api";
import { storeConfig } from "@/lib/store-config";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const error = new URLSearchParams(window.location.search).get("error");
      if (error === "google-no-config") {
        setGoogleError("El login con Google aún no está configurado. Usa correo y contraseña, o agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el backend.");
      } else if (error) {
        setGoogleError("No se pudo iniciar sesión con Google. Intenta nuevamente.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, name, email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "No se pudo iniciar sesión. Intenta nuevamente.");
        setLoading(false);
        return;
      }
      clearSessionTokenCache();
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(data.role === "admin" ? "/admin" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/cuenta");
    } catch {
      setMessage("No se pudo conectar. Intenta nuevamente.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <section className="w-full max-w-md">
        <Link href="/" className="display text-3xl">{storeConfig.name}</Link>
        <p className="mt-8 text-xs tracking-[.18em] text-[#56745c] uppercase">Acceso</p>
        <h1 className="display mt-3 text-4xl">{mode === "register" ? "Crea tu cuenta" : "Bienvenido de vuelta"}</h1>
        <p className="mt-3 leading-7 text-[#647167]">
          {mode === "register"
            ? "Regístrate con tu correo para agendar pedidos más rápido. Tu correo autorizado también da acceso al panel de administración."
            : "Inicia sesión para agendar tus pedidos más rápido y llevar tu historial."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "register" && (
            <label className="block text-sm">Nombre
              <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full border border-[#c7ccc3] bg-white px-4 py-3 outline-[#56745c]" placeholder="Tu nombre"/>
            </label>
          )}
          <label className="block text-sm">Correo
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full border border-[#c7ccc3] bg-white px-4 py-3 outline-[#56745c]" placeholder="tucorreo@ejemplo.cl"/>
          </label>
          <label className="block text-sm">Contraseña
            <input required type="password" minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full border border-[#c7ccc3] bg-white px-4 py-3 outline-[#56745c]" placeholder="••••••••"/>
          </label>
          {mode === "register" && <p className="text-xs text-[#748077]">La contraseña debe tener al menos 8 caracteres.</p>}
          <button disabled={loading} className="w-full bg-[#243128] py-3.5 text-sm text-white disabled:opacity-50">
            {loading ? "Un momento..." : mode === "register" ? "Crear cuenta" : "Entrar"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="mt-3 w-full text-center text-sm text-[#56745c] underline underline-offset-4">
          {mode === "register" ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
        </button>
        {message && <p className="mt-4 rounded-lg bg-[#edf0e8] p-3 text-sm">{message}</p>}

        <div className="mt-8 flex items-center gap-3 text-xs text-[#748077]"><span className="h-px flex-1 bg-[#e2e5df]"/>o continúa con<span className="h-px flex-1 bg-[#e2e5df]"/></div>
        {googleError && <p className="mt-6 rounded-lg bg-[#f3e2e0] p-3 text-sm text-[#8a4a44]">{googleError}</p>}
        <a href="/api/auth/google" className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-[#d9ddd5] bg-white py-3 text-sm font-medium transition hover:border-[#243128]">
          <GoogleIcon className="h-4 w-4"/>
          Continuar con Google
        </a>
        <Link href="/" className="mt-8 inline-block text-sm underline underline-offset-4">Volver a la tienda</Link>
      </section>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}