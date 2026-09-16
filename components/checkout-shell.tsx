"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ShellConfig } from "@/components/store-shell";

/**
 * Header mínimo del checkout, como en la referencia https://simplysweet.cl
 * (checkout de Shopify): solo el logo de la tienda y la vuelta a la colección,
 * sin la navegación completa de la tienda.
 */
export function CheckoutHeader({ config }: { config: ShellConfig }) {
  return (
    <header className="border-b border-[#e2e5df] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-10">
        <Link href="/" className="display min-w-0 truncate text-2xl">{config.name}</Link>
        <Link href="/#coleccion" className="shrink-0 text-sm text-[#56745c] underline underline-offset-4">Seguir comprando</Link>
      </div>
    </header>
  );
}

/** Footer de contacto del checkout (en la referencia son los enlaces de políticas). */
export function CheckoutFooter({ config }: { config: ShellConfig & { whatsapp_phone?: string | null } }) {
  const digits = (config.whatsapp_phone ?? "").replace(/\D/g, "");
  return (
    <footer className="border-t border-[#e2e5df] bg-white px-5 py-8 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs text-[#647167]">
        <div className="flex flex-wrap gap-5">
          {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">¿Dudas? Escríbenos por WhatsApp</a>}
          {config.instagram_url && <a href={config.instagram_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">Instagram</a>}
          <Link href="/#historia" className="underline underline-offset-4">Sobre el negocio</Link>
          <Link href="/#coleccion" className="underline underline-offset-4">Productos</Link>
        </div>
        <p className="inline-flex items-center gap-1.5"><Lock size={13}/>Compra segura · {config.name}</p>
      </div>
    </footer>
  );
}
