"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { loadCached } from "@/lib/offline-cache";
import { formatPrice, mapApiProduct, type ApiProduct, type Product } from "@/lib/products";
import { useStoreSettings } from "@/lib/use-store-settings";
import { themeVars } from "@/lib/theme";
import { CartDrawer } from "@/components/cart-drawer";
import { EditableText } from "@/components/editable-content";
import { FloatingCart } from "@/components/floating-cart";
import { InstagramGrid } from "@/components/instagram-grid";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

/**
 * Productos por página en «Productos destacados»: 8, o sea 4 columnas × 2 filas. Es un valor **fijo**
 * de la vitrina (no se edita desde el panel), así que la carta siempre pagina igual.
 */
const PRODUCTS_PER_PAGE = 8;

/** Lee el catálogo de la API. No toca estado: se aplica en un callback. */
async function fetchCatalog(): Promise<Product[]> {
  const [rows, cats] = await Promise.all([
    apiFetch<ApiProduct[]>("/api/products"),
    apiFetch<{ id: string; name: string }[]>("/api/categories"),
  ]);
  const categories = new Map(cats.map((category) => [category.id, category.name]));
  return rows.map((row, index) => mapApiProduct(row, index, categories));
}

export function Storefront({ products }: { products: Product[] }) {
  const [catalog, setCatalog] = useState(products);
  const config = useStoreSettings();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const { cart, add, change, count } = useCart();

  // Los productos demo solo son el punto de partida: manda la API y, si no responde, lo último
  // guardado en este navegador (ver `lib/offline-cache.ts`).
  useEffect(() => {
    let active = true;
    void loadCached("catalog", fetchCatalog).then(({ value }) => {
      if (active && value?.length) setCatalog(value);
    });
    return () => { active = false; };
  }, []);

  // Búsqueda y categoría son filtros independientes y combinables: el texto busca dentro de la
  // categoría activa (AND), y «Todos» (categoría vacía) no restringe.
  const visible = catalog.filter((p) =>
    (category === "" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const addToCart = (id: string) => { add(id); setDrawer(true); };

  // Catálogo paginado: la vitrina muestra 8 productos por página (4 columnas × 2 filas) y la página se
  // recorta al total para que un filtro más chico no deje la vitrina vacía.
  const perPage = PRODUCTS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(visible.length / perPage));
  const currentPage = Math.min(page, pageCount - 1);
  const pageProducts = visible.slice(currentPage * perPage, currentPage * perPage + perPage);
  const goToPage = (delta: number) => setPage(Math.min(Math.max(currentPage + delta, 0), pageCount - 1));
  // Al filtrar o buscar se vuelve a la primera página, y los productos que quedan se acomodan solos.
  const onSearch = (value: string) => { setSearch(value); setPage(0); };
  const onCategory = (value: string) => { setCategory(value); setPage(0); };

  // La paleta editable (D29) entra como variables CSS en el `<main>`, así que la heredan la carta, el
  // header, el carrito lateral y el footer sin pasar ninguna prop.
  return <main className="theme-bosque min-h-screen overflow-hidden" style={themeVars(config.theme_colors)}>
    <StoreHeader warm config={config} cartCount={count} onSearch={() => document.getElementById("buscador")?.focus()} onCartOpen={() => setDrawer(true)}/>
    <section id="inicio" className="mx-auto grid max-w-7xl grid-cols-1 px-5 pb-16 md:grid-cols-[1.05fr_.95fr] md:px-10"><div className="flex min-h-[430px] flex-col justify-center py-14 md:py-20"><p className="mb-5 text-xs tracking-[.2em] text-[var(--brand-accent)] uppercase">{config.eyebrow}</p><EditableText as="h1" field="hero_title" value={config.headline} className="display max-w-xl text-5xl leading-[.96] md:text-7xl"/><EditableText as="p" field="hero_description" value={config.description} className="mt-7 max-w-md leading-7 text-[var(--brand-muted)]"/><Link href="/#coleccion" className="mt-9 inline-flex w-fit items-center gap-3 border-b border-[var(--brand-accent)] pb-2 text-sm font-medium">Ver productos <ArrowRight size={16}/></Link></div><div className="hero-visual relative min-h-[410px] overflow-hidden rounded-t-full md:rounded-none"><div className="absolute bottom-7 left-7 bg-white/90 px-5 py-4 text-sm backdrop-blur"><span className="block text-xs tracking-wider text-[var(--brand-accent)] uppercase">Destacado</span><span className="display text-xl">{config.featuredCollection}</span></div></div></section>
    <section id="coleccion" className="bg-[var(--brand-surface)] px-5 py-20 md:px-10"><div className="mx-auto max-w-7xl">
      <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs tracking-[.18em] text-[var(--brand-accent)] uppercase">Catálogo</p><h2 className="display mt-2 text-4xl md:text-5xl">Productos destacados</h2></div><label className="flex items-center gap-2 border-b border-[var(--brand-accent)] pb-2 text-sm"><Search size={16}/><input id="buscador" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar productos" className="w-44 bg-transparent outline-none placeholder:text-[var(--brand-muted)]"/></label></div>
      {/* Los filtros van arriba del catálogo, como en la referencia. */}
      <div className="mb-8 flex flex-wrap items-center gap-2">{["Todos", ...Array.from(new Set(catalog.map((product) => product.category)))].map((option) => <button key={option} onClick={() => onCategory(option === "Todos" ? "" : option)} className="rounded-full border border-[var(--brand-accent)] px-4 py-2 text-sm transition hover:border-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white">{option}</button>)}
        {/* Flechas de página del catálogo, a la derecha de los filtros. */}
        {pageCount > 1 && <div className="ml-auto flex items-center gap-2"><span className="text-sm text-[var(--brand-muted)]">{currentPage + 1} / {pageCount}</span><button onClick={() => goToPage(-1)} disabled={currentPage === 0} aria-label="Productos anteriores" className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brand-accent)] text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--brand-accent)]"><ChevronLeft size={18}/></button><button onClick={() => goToPage(1)} disabled={currentPage >= pageCount - 1} aria-label="Productos siguientes" className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brand-accent)] text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--brand-accent)]"><ChevronRight size={18}/></button></div>}
      </div>
      {/* Carta limpia: solo foto, nombre y precio — sin categoría ni descripción debajo (referencia simplysweet.cl). */}
      {/* Al cambiar el filtro los productos que no coinciden se desvanecen y los que quedan se juntan: el
          layout de framer-motion anima la grilla, no solo desaparece. */}
      <motion.div layout className="grid grid-cols-2 gap-x-1 gap-y-6 lg:grid-cols-4"><AnimatePresence mode="popLayout">{pageProducts.map((product) => { const photo = product.images?.[0] ?? product.image_url; return <motion.article key={product.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.28, ease: "easeOut" }} className="group"><Link href={`/producto/${product.slug}`} className="relative block"><div data-tone={product.tone} className="product-visual relative aspect-[.83] overflow-hidden ">{photo ? <img src={photo} alt={product.name} className="absolute inset-0 h-full w-full object-cover"/> : null}{product.badge && <span className="absolute left-3 bottom-3 bg-white px-2 py-1 text-[10px] tracking-wider uppercase">{product.badge}</span>}<button onClick={(e) => { e.preventDefault(); addToCart(product.id); }} className="absolute right-3 bottom-3 grid h-10 w-10 place-items-center rounded-full bg-white opacity-100 transition disabled:cursor-not-allowed disabled:opacity-40 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100" aria-label={`Agregar ${product.name}`}><Plus size={18}/></button></div></Link><div className="pt-4"><h3 className="display  flex justify-between items-baseline px-5"> <span>{product.name}</span> <span>{formatPrice(product.price)}</span> </h3></div></motion.article>; })}</AnimatePresence></motion.div>
      {visible.length === 0 && <p className="py-12 text-center text-[var(--brand-muted)]">No encontramos productos con esos filtros.</p>}
    </div></section>
    <section id="beneficios" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 md:grid-cols-3 md:px-10">{[[ "Compra con confianza", "Destaca tus garantías, materiales, soporte o cualquier beneficio importante."], ["Una experiencia simple", "Usa este bloque para explicar cómo funciona tu servicio o proceso de compra."], ["Tu negocio, tu estilo", "Cambia textos, precios, fotos y colecciones desde el CMS incluido."]].map(([title, text]) => <div key={title}><Package className="mb-5 text-[var(--brand-accent)]"/><h3 className="display text-2xl">{title}</h3><p className="mt-3 leading-7 text-[var(--brand-muted)]">{text}</p></div>)}</section>
    <section id="historia" className="bg-[var(--brand-accent)] px-5 py-20 text-white md:px-10"><div className="mx-auto max-w-3xl text-center"><p className="text-xs tracking-[.18em] text-white/80 uppercase">{config.storyEyebrow}</p><EditableText as="h2" field="story_headline" value={config.storyHeadline} className="display mt-4 text-4xl md:text-5xl"/><EditableText as="p" field="story_description" value={config.storyDescription} className="mx-auto mt-6 max-w-xl leading-7 text-white/90"/></div></section>
    <InstagramGrid/>
    <StoreFooter config={config}/>
    <WhatsAppButton phone={config.whatsapp_phone}/>
    <FloatingCart count={count} onOpen={() => setDrawer(true)}/>
    <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} products={catalog} onChange={change}/>
  </main>;
}
