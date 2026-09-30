"use client";

import Link from "next/link";
import { useState } from "react";
import { AtSign, Mail, Menu, MessageCircle, Phone, Search, ShoppingBag, UserRound } from "lucide-react";
import { EditableText, useContentEdit } from "@/components/editable-content";
import { useAccountLink } from "@/lib/account";
import type { StoreConfig } from "@/lib/store-config";

/**
 * Datos de tienda que comparten el header, el footer y el checkout mínimo.
 *
 * Las claves se **derivan** de `StoreConfig` (`lib/store-config.ts`) en vez de declararse a mano: así un
 * campo no puede existir de un solo lado. La ubicación del pie se llamaba `footer_location` acá y
 * `footerLocation` en los ajustes de tienda, así que el footer recibía `undefined` y dibujaba la línea
 * vacía; con `Pick` ese desajuste **no compila** (A57).
 */
export type ShellConfig = Pick<StoreConfig, "name"> &
  Partial<Pick<StoreConfig, "announcement" | "contact_email" | "contact_phone" | "whatsapp_phone" | "instagram_url" | "footerLocation" | "footerTagline">>;

/**
 * Header principal de la tienda (anuncio + navegación + buscador + cuenta + carrito).
 * Se reutiliza en la carta, la ficha de producto, la cuenta y el checkout para que la
 * experiencia no se rompa entre páginas.
 *
 * `warm` cambia los tonos a la paleta cálida de la página principal y la ficha; la cuenta (que comparte
 * este header) conserva la identidad anterior en el header. El footer, en cambio, es cálido en todas las
 * páginas (D28).
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
  // Presente solo en el editor del admin (`/admin/editor`, D38); fuera de ahí vale `null`.
  const contentEdit = useContentEdit();

  const announcement = warm ? "bg-[var(--brand-accent)] text-white" : "bg-[#243128] text-[#f7f4ec]";
  const badge = warm ? "bg-[var(--brand-ink)]" : "bg-[#d88480]";

  return (
    <>
      {(config.announcement || contentEdit) && <div className={`${announcement} px-4 py-2 text-center text-[11px] tracking-[.16em] uppercase`}><EditableText field="announcement" value={config.announcement ?? ""}/></div>}
      {/* El margen lateral va **fuera** de `max-w-7xl`, igual que la sección «Productos destacados»
          (`px-5 md:px-10` en el contenedor y `mx-auto max-w-7xl` adentro). Antes el padding iba dentro
          del `max-w-7xl`, así que en PC el borde del header caía 40 px más adentro que la carta. La nav y
          el logo siguen posicionándose contra la ventana porque acá no se agrega `relative`. */}
      <header id="store-header" className="px-5 py-6 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button className="md:hidden" onClick={() => setMenu(!menu)} aria-label="Abrir menú"><Menu size={22}/></button>
          <nav className={`${menu ? "flex" : "hidden"} absolute top-28 left-5 right-5 z-20 flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg md:static md:flex md:flex-row md:bg-transparent md:p-0 md:shadow-none`}>
            <Link href="/#coleccion" onClick={() => setMenu(false)}>Productos</Link>
            <Link href="/#beneficios" onClick={() => setMenu(false)}>Beneficios</Link>
            <Link href="/#historia" onClick={() => setMenu(false)}>Nosotros</Link>
          </nav>
          {/* Centrado con `inset-x-0 + mx-auto + w-fit` en vez de `left-1/2 + -translate-x-1/2`: se ve
              igual, pero una `translate` crea un **contexto de apilado** propio y en el editor dejaba el
              título (texto y borde) por debajo del velo. Sin `translate`, el título editable se comporta
              como el resto: `z-index` lo sube por encima del velo y se lee blanco. */}
          <Link href="/" className="display text-3xl tracking-tight md:absolute md:inset-x-0 md:mx-auto md:w-fit"><EditableText field="name" value={config.name}/></Link>
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
        </div>
      </header>
    </>
  );
}

/**
 * Footer de la tienda: marca, bajada, datos de contacto, navegación y aviso de copyright. La bajada y la
 * ubicación del pie se editan en la página (`/admin/editor`, D38); el nombre solo se edita en el header.
 *
 * Sin accesos de cuenta ni de panel: ese botón vive en el header (`/admin` para el admin y
 * `/cuenta` o `/login` para el cliente). Los datos de contacto salen de `store_settings` (Contenido) y
 * cada fila se dibuja solo si está configurada, para que una tienda recién creada no muestre vacíos.
 *
 * Usa siempre la paleta cálida (D28): es el mismo pie en la carta, la ficha y la cuenta, así que ya no
 * lleva la prop `warm` (el header sí la conserva porque la cuenta mantiene la identidad anterior arriba).
 * Los tonos salen de las variables `--brand-*` (D29), que las vistas cálidas escriben en línea con lo
 * que el dueño guardó en Contenido › Colores; el texto claro sobre la tinta se deriva con `color-mix`.
 */
export function StoreFooter({ config }: { config: ShellConfig }) {
  const year = new Date().getFullYear();
  const email = config.contact_email?.trim();
  const phone = config.contact_phone?.trim();
  const whatsappDigits = (config.whatsapp_phone ?? "").replace(/\D/g, "");
  const muted = "text-[var(--brand-surface)]";
  const heading = "text-xs tracking-[.18em] uppercase text-[var(--brand-detail)]";
  const link = "inline-flex items-center gap-2 transition hover:text-[var(--brand-detail)]";
  const hasContact = Boolean(email || phone || whatsappDigits || config.instagram_url);

  return (
    <footer className="bg-[var(--brand-ink)] text-[var(--brand-on-ink)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-10">
        <div>
          {/* El nombre del pie **no es editable a propósito**: se cambia en el título de arriba (el primero de
              la página) y el pie y el copyright lo siguen. */}
          <p className="display text-3xl">{config.name}</p>
          <EditableText as="p" field="footer_tagline" value={config.footerTagline ?? ""} className={`mt-3 max-w-xs text-sm leading-6 ${muted}`}/>
        </div>
        {hasContact && (
          <div>
            <p className={heading}>Contacto</p>
            <ul className={`mt-4 space-y-3 text-sm ${muted}`}>
              {email && <li><a href={`mailto:${email}`} className={link}><Mail size={15}/><span className="break-all">{email}</span></a></li>}
              {phone && <li><a href={`tel:${phone.replace(/\s/g, "")}`} className={link}><Phone size={15}/>{phone}</a></li>}
              {whatsappDigits && <li><a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer" className={link}><MessageCircle size={15}/>WhatsApp</a></li>}
              {config.instagram_url && <li><a href={config.instagram_url} target="_blank" rel="noreferrer" className={link}><AtSign size={15}/>Instagram</a></li>}
            </ul>
          </div>
        )}
        <div>
          <p className={heading}>Tienda</p>
          <ul className={`mt-4 space-y-3 text-sm ${muted}`}>
            <li><Link href="/#coleccion" className={link}>Productos</Link></li>
            <li><Link href="/#beneficios" className={link}>Beneficios</Link></li>
            <li><Link href="/#historia" className={link}>Nosotros</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--brand-muted)] px-5 py-5 md:px-10">
        <div className={`mx-auto flex max-w-7xl flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between ${muted}`}>
          {/* El copyright usa el **mismo** campo que el título de arriba (`name`): no tiene texto propio. */}
          <p>© {year} {config.name}. Todos los derechos reservados.</p>
          <EditableText as="p" field="footer_location" value={config.footerLocation ?? ""}/>
        </div>
      </div>
    </footer>
  );
}
