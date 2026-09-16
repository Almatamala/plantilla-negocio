"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Package, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatPrice, mapApiProduct, stockLabel, type ApiProduct, type Product } from "@/lib/products";
import { mergeSettings, storeConfig, type ApiSettings, type StoreConfig } from "@/lib/store-config";
import { CartDrawer } from "@/components/cart-drawer";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

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
  const [config, setConfig] = useState<StoreConfig>(storeConfig);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const { cart, add, change, count } = useCart();

  useEffect(() => {
    apiFetch<ApiSettings>("/api/settings")
      .then((data) => setConfig((current) => mergeSettings(current, data)))
      .catch(() => undefined);
  }, []);

  // Los productos demo solo son el punto de partida: si la API responde, manda la API.
  const applyCatalog = useCallback((items: Product[]) => {
    if (items.length) setCatalog(items);
  }, []);

  useEffect(() => {
    let active = true;
    fetchCatalog()
      .then((items) => { if (active) applyCatalog(items); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [applyCatalog]);

  const visible = catalog.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));
  const addToCart = (id: string) => { add(id); setDrawer(true); };

  return <main className="min-h-screen overflow-hidden">
    <StoreHeader config={config} cartCount={count} onSearch={() => document.getElementById("buscador")?.focus()} onCartOpen={() => setDrawer(true)}/>
    <section id="inicio" className="mx-auto grid max-w-7xl grid-cols-1 px-5 pb-16 md:grid-cols-[1.05fr_.95fr] md:px-10"><div className="flex min-h-[430px] flex-col justify-center py-14 md:py-20"><p className="mb-5 text-xs tracking-[.2em] text-[#56745c] uppercase">{config.eyebrow}</p><h1 className="display max-w-xl text-5xl leading-[.96] md:text-7xl">{config.headline}</h1><p className="mt-7 max-w-md leading-7 text-[#526058]">{config.description}</p><Link href="/#coleccion" className="mt-9 inline-flex w-fit items-center gap-3 border-b border-[#243128] pb-2 text-sm font-medium">Ver productos <ArrowRight size={16}/></Link></div><div className="hero-visual relative min-h-[410px] overflow-hidden rounded-t-full md:rounded-none"><div className="absolute bottom-7 left-7 bg-white/90 px-5 py-4 text-sm backdrop-blur"><span className="block text-xs tracking-wider text-[#56745c] uppercase">Destacado</span><span className="display text-xl">{config.featuredCollection}</span></div></div></section>
    <section id="coleccion" className="bg-[#edf0e8] px-5 py-20 md:px-10"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs tracking-[.18em] text-[#56745c] uppercase">Catálogo</p><h2 className="display mt-2 text-4xl md:text-5xl">Explora lo que tenemos para ti</h2></div><label className="flex items-center gap-2 border-b border-[#a7b2a3] pb-2 text-sm"><Search size={16}/><input id="buscador" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar productos" className="w-44 bg-transparent outline-none placeholder:text-[#748077]"/></label></div><div className="mb-8 flex flex-wrap gap-2">{["Todos", ...Array.from(new Set(catalog.map((product) => product.category)))].map((category) => <button key={category} onClick={() => setSearch(category === "Todos" ? "" : category)} className="rounded-full border border-[#a7b2a3] px-4 py-2 text-sm transition hover:border-[#243128] hover:bg-[#243128] hover:text-white">{category}</button>)}</div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{visible.map((product) => { const stock = stockLabel(product); const photo = product.images?.[0] ?? product.image_url; return <article key={product.id} className="group"><Link href={`/producto/${product.slug}`} className="relative block"><div data-tone={product.tone} className="product-visual relative aspect-[.83] overflow-hidden">{photo ? <img src={photo} alt={product.name} className="absolute inset-0 h-full w-full object-cover"/> : null}<span className={`absolute left-3 top-3 px-2 py-1 text-[10px] tracking-wider uppercase ${stock.className}`}>{stock.label}</span>{product.badge && <span className="absolute left-3 bottom-3 bg-[#faf7f0] px-2 py-1 text-[10px] tracking-wider uppercase">{product.badge}</span>}<button onClick={(e) => { e.preventDefault(); addToCart(product.id); }} disabled={!stock.available} className="absolute right-3 bottom-3 grid h-10 w-10 place-items-center rounded-full bg-white opacity-100 transition disabled:cursor-not-allowed disabled:opacity-40 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100" aria-label={`Agregar ${product.name}`}><Plus size={18}/></button></div></Link><div className="flex justify-between gap-3 pt-4"><div><p className="text-xs tracking-wider text-[#56745c] uppercase">{product.category}</p><h3 className="display mt-1 text-xl">{product.name}</h3><p className="mt-1 text-sm text-[#647167]">{product.description}</p></div><span className="whitespace-nowrap text-sm">{formatPrice(product.price)}</span></div></article>; })}</div>{visible.length === 0 && <p className="py-12 text-center text-[#647167]">No encontramos productos con esa búsqueda.</p>}</div></section>
    <section id="beneficios" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 md:grid-cols-3 md:px-10">{[[ "Compra con confianza", "Destaca tus garantías, materiales, soporte o cualquier beneficio importante."], ["Una experiencia simple", "Usa este bloque para explicar cómo funciona tu servicio o proceso de compra."], ["Tu negocio, tu estilo", "Cambia textos, precios, fotos y colecciones desde el CMS incluido."]].map(([title, text]) => <div key={title}><Package className="mb-5 text-[#56745c]"/><h3 className="display text-2xl">{title}</h3><p className="mt-3 leading-7 text-[#647167]">{text}</p></div>)}</section>
    <section id="historia" className="bg-[#d9cbb7] px-5 py-20 md:px-10"><div className="mx-auto max-w-3xl text-center"><p className="text-xs tracking-[.18em] uppercase">{config.storyEyebrow}</p><h2 className="display mt-4 text-4xl md:text-5xl">{config.storyHeadline}</h2><p className="mx-auto mt-6 max-w-xl leading-7">{config.storyDescription}</p></div></section>
    <StoreFooter config={config}/>
    <WhatsAppButton phone={config.whatsapp_phone}/>
    <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} products={catalog} onChange={change}/>
  </main>;
}
