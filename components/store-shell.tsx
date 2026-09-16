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
 * Se reutiliza en la carta, la ficha de producto y el checkout para que la
 * experiencia no se rompa entre páginas.
 */
export function StoreHeader({
  config,
  cartCount = 0,
  onSearch,
  onCartOpen,
  cartHref = "/checkout",
}: {
  config: ShellConfig;
  cartCount?: number;
  onSearch?: () => void;
  onCartOpen?: () => void;
  cartHref?: string;
}) {
  const [menu, setMenu] = useState(false);
  const account = useAccountLink();

  return (
    <>
      {config.announcement && <div className="bg-[#243128] px-4 py-2 text-center text-[11px] tracking-[.16em] text-[#f7f4ec] uppercase">{config.announcement} · Plantilla demo</div>}
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
                {cartCount > 0 && <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-[#d88480] text-[10px] text-white">{cartCount}</span>}
              </button>
            : <Link href={cartHref} className="relative" aria-label="Carrito" title="Carrito">
                <ShoppingBag size={21}/>
                {cartCount > 0 && <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-[#d88480] text-[10px] text-white">{cartCount}</span>}
              </Link>}
        </div>
      </header>
    </>
  );
}

/**
 * Footer de la tienda. Sin accesos de cuenta ni de panel: ese botón vive en el
 * header (`/admin` para el admin y `/cuenta` o `/login` para el cliente).
 */
export function StoreFooter({ config }: { config: ShellConfig }) {
  return (
    <footer className="bg-[#243128] px-5 py-12 text-[#f8f5ee] md:px-10">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row">
        <div>
          <p className="display text-3xl">{config.name}</p>
          <p className="mt-3 text-sm text-[#c8d1c4]">Una base para crear marcas con vida.</p>
        </div>
        <div className="flex gap-6 text-sm">
          {config.instagram_url && <a href={config.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white"><AtSign size={15}/>Instagram</a>}
        </div>
      </div>
    </footer>
  );
}
