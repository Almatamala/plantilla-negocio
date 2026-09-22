"use client";

import Link from "next/link";
import { useState } from "react";
import { AtSign, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { useAccountLink } from "@/lib/account";

/** Datos de tienda que comparten el header y el footer en todas las páginas. */
export type ShellConfig = {
  name: string;
  announcement?: string | null;
  instagram_url?: string | null;
};

/**
 * Header principal de la tienda (anuncio + navegación + buscador + cuenta + carrito).
 * Se reutiliza en la carta, la ficha de producto, la cuenta y el checkout para que la
 * experiencia no se rompa entre páginas.
 *
 * `warm` cambia los tonos a la paleta cálida de la página principal y la ficha; la cuenta
 * (que comparte este header) conserva la identidad anterior.
 */
export function StoreHeader({
  config,
  cartCount = 0,
  onSearch,
  onCartOpen,
  cartHref = "/checkout",
  warm = false,
}: {
  config: ShellConfig;
  cartCount?: number;
  onSearch?: () => void;
  onCartOpen?: () => void;
  cartHref?: string;
  warm?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const account = useAccountLink();

  const announcement = warm ? "bg-[#808c6d] text-white" : "bg-[#243128] text-[#f7f4ec]";
  const badge = warm ? "bg-[#401a04]" : "bg-[#d88480]";

  return (
    <>
      {config.announcement && <div className={`${announcement} px-4 py-2 text-center text-[11px] tracking-[.16em] uppercase`}>{config.announcement} · Plantilla demo</div>}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-10">
        <button className="md:hidden" onClick={() => setMenu(!menu)} aria-label="Abrir menú"><Menu size={22}/></button>
        <nav className={`${menu ? "flex" : "hidden"} absolute top-28 left-5 right-5 z-20 flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg md:static md:flex md:flex-row md:bg-transparent md:p-0 md:shadow-none`}>
          <Link href="/#coleccion" onClick={() => setMenu(false)}>Productos</Link>
          <Link href="/#beneficios" onClick={() => setMenu(false)}>Beneficios</Link>
          <Link href="/#historia" onClick={() => setMenu(false)}>Nosotros</Link>
        </nav>
        <Link href="/" className="display text-3xl tracking-tight md:absolute md:left-1/2 md:-translate-x-1/2">{config.name}</Link>
        <div className="flex items-center gap-4">
          {onSearch
            ? <button onClick={onSearch} aria-label="Buscar"><Search size={20}/></button>
            : <Link href="/#coleccion" aria-label="Buscar" title="Buscar productos"><Search size={20}/></Link>}
          {account && <Link href={account.href} aria-label={account.label} title={account.label}><UserRound size={20}/></Link>}
          {onCartOpen
            ? <button className="relative" onClick={onCartOpen} aria-label="Carrito">
                <ShoppingBag size={21}/>
                {cartCount > 0 && <span className={`absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full ${badge} text-[10px] text-white`}>{cartCount}</span>}
              </button>
            : <Link href={cartHref} className="relative" aria-label="Carrito" title="Carrito">
                <ShoppingBag size={21}/>
                {cartCount > 0 && <span className={`absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full ${badge} text-[10px] text-white`}>{cartCount}</span>}
              </Link>}
        </div>
      </header>
    </>
  );
}

/**
 * Footer de la tienda. Sin accesos de cuenta ni de panel: ese botón vive en el
 * header (`/admin` para el admin y `/cuenta` o `/login` para el cliente).
 *
 * `warm` cambia el bloque a la paleta cálida en la página principal y la ficha; la cuenta
 * conserva la identidad anterior.
 */
export function StoreFooter({ config, warm = false }: { config: ShellConfig; warm?: boolean }) {
  return (
    <footer className={`${warm ? "bg-[#401a04] text-[#f1e9e1]" : "bg-[#243128] text-[#f8f5ee]"} px-5 py-12 md:px-10`}>
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row">
        <div>
          <p className="display text-3xl">{config.name}</p>
          <p className={`mt-3 text-sm ${warm ? "text-[#d7cdc1]" : "text-[#c8d1c4]"}`}>Una base para crear marcas con vida.</p>
        </div>
      </div>
    </footer>
  );
}
