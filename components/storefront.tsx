"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatPrice, type Product } from "@/lib/products";
import { useCatalog } from "@/lib/use-catalog";
import { defaultHeroImage } from "@/lib/store-config";
import { useStoreSettings } from "@/lib/use-store-settings";
import { themeVars } from "@/lib/theme";
import { CartDrawer } from "@/components/cart-drawer";
import { EditableImage, EditableText, type EditableField } from "@/components/editable-content";
import { FloatingCart } from "@/components/floating-cart";
import { InstagramGrid } from "@/components/instagram-grid";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

/**
 * Productos por página en «Productos destacados»: 8, o sea 4 columnas × 2 filas. Es un valor **fijo**
 * de la vitrina (no se edita desde el panel), así que la carta siempre pagina igual.
 */
const PRODUCTS_PER_PAGE = 8;

/**
 * Claves editables de las tres tarjetas de «Beneficios», en el mismo orden que `storeConfig.benefits`
 * (D38): `EditableText` guarda por nombre de campo, así que la pareja título/texto se declara una vez.
 */
const BENEFIT_FIELDS: { title: EditableField; text: EditableField }[] = [
  { title: "benefit_1_title", text: "benefit_1_text" },
  { title: "benefit_2_title", text: "benefit_2_text" },
  { title: "benefit_3_title", text: "benefit_3_text" },
];

export function Storefront({ products }: { products: Product[] }) {
  // El catálogo real (o la última versión conocida) sale de la lectura compartida: la ficha y el
  // checkout usan la misma (`lib/use-catalog.ts`).
  const { catalog } = useCatalog(products);
  const config = useStoreSettings();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const { cart, add, change, count } = useCart();

  // Búsqueda y categoría son filtros independientes y combinables: el texto busca dentro de la
  // categoría activa (AND), y «Todos» (categoría vacía) no restringe.
  const visible = catalog.filter((p) =>
    (category === "" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const addToCart = (id: string) => { add(id); setDrawer(true); };

  // Catálogo paginado: la vitrina muestra 8 productos por página (4 columnas × 2 filas) y la página se
  // recorta al total para que un filtro más chico no deje la vitrina vacía.
  const pageCount = Math.max(1, Math.ceil(visible.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageProducts = visible.slice(currentPage * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE + PRODUCTS_PER_PAGE);
  const goToPage = (delta: number) => setPage(Math.min(Math.max(currentPage + delta, 0), pageCount - 1));
  // Al filtrar o buscar se vuelve a la primera página, y los productos que quedan se acomodan solos.
  const onSearch = (value: string) => { setSearch(value); setPage(0); };
  const onCategory = (value: string) => { setCategory(value); setPage(0); };

  // La paleta editable (D29) entra como variables CSS en el `<main>`, así que la heredan la carta, el
  // header, el carrito lateral y el footer sin pasar ninguna prop.
  return <main className="theme-bosque min-h-screen overflow-hidden" style={themeVars(config.theme_colors)}>
    <StoreHeader warm config={config} cartCount={count} onSearch={() => document.getElementById("buscador")?.focus()} onCartOpen={() => setDrawer(true)}/>
    {/* Hero (A66/D47/D48/D49): la foto de fondo —la que se sube desde el editor de la página o, si no hay, la de la plantilla— cubre toda la sección y el texto queda a la izquierda; el degradado hacia la derecha sale del color de la página (`--cream`), así la foto se mimetiza con el fondo. El **logo** de la esquina inferior es opcional (D49) y va de un **tamaño fijo**. En el editor aparecen encima los botones para cambiar cada foto. La caja «Destacado · Colección destacada» se retiró. */}
    <section id="inicio" className="relative"><EditableImage field="hero_image" value={config.heroImage} resetTo={defaultHeroImage} containerClassName="absolute inset-0" className="h-full w-full object-cover object-right" controlsClassName="absolute right-5 top-5 z-50"/><div aria-hidden className="absolute inset-0 bg-linear-to-r from-[var(--cream)] to-transparent to-60%"/><div className="relative mx-auto max-w-7xl px-5 md:px-10"><div className="flex min-h-[430px] max-w-xl flex-col justify-center py-14 md:py-20"><EditableText as="p" field="hero_eyebrow" value={config.eyebrow} className="mb-5 text-xs tracking-[.2em] text-[var(--brand-accent)] uppercase"/><EditableText as="h1" field="hero_title" value={config.headline} className="display max-w-xl text-5xl leading-[.96] md:text-7xl"/><EditableText as="p" field="hero_description" value={config.description} className="mt-7 max-w-md leading-7 text-[var(--brand-muted)]"/><Link href="/#coleccion" className="mt-9 inline-flex w-fit items-center gap-3 border-b border-[var(--brand-accent)] pb-2 text-sm font-medium">Ver productos <ArrowRight size={16}/></Link></div></div>{/* Logo de la tienda (D49, **opcional**): un círculo en la esquina inferior derecha del hero. Sin logo no se dibuja nada y, en el editor de la página, queda el botón para subirlo. Va **después** del texto para quedar por encima: sin `z-index` en el contenedor, el botón sí puede subir sobre el velo. */}<EditableImage field="hero_logo" value={config.heroLogo} alt={config.name} containerClassName="absolute right-10 bottom-10 flex flex-col items-end gap-2" className="h-20 w-20 rounded-full border-4 border-white bg-white object-cover shadow-xl md:h-40 md:w-40" controlsClassName="relative z-50" resetTo="" resetLabel="Quitar el logo" label="Logo de la tienda"/></section>
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
    <section id="beneficios" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 md:grid-cols-3 md:px-10">{config.benefits.map((benefit, index) => {
      // El título y el texto de cada tarjeta se editan en la página («/admin/editor», D38).
      const fields = BENEFIT_FIELDS[index];
      return (
        <div key={fields.title}>
          <Package className="mb-5 text-[var(--brand-accent)]"/>
          <EditableText as="h3" field={fields.title} value={benefit.title} className="display text-2xl"/>
          <EditableText as="p" field={fields.text} value={benefit.text} className="mt-3 leading-7 text-[var(--brand-muted)]"/>
        </div>
      );
    })}</section>
    <section id="historia" className="bg-[var(--brand-accent)] px-5 py-20 text-white md:px-10"><div className="mx-auto max-w-3xl text-center"><EditableText as="p" field="story_eyebrow" value={config.storyEyebrow} className="text-xs tracking-[.18em] text-white/80 uppercase"/><EditableText as="h2" field="story_headline" value={config.storyHeadline} className="display mt-4 text-4xl md:text-5xl"/><EditableText as="p" field="story_description" value={config.storyDescription} className="mx-auto mt-6 max-w-xl leading-7 text-white/90"/></div></section>
    <InstagramGrid/>
    <StoreFooter config={config}/>
    <WhatsAppButton phone={config.whatsapp_phone}/>
    <FloatingCart count={count} onOpen={() => setDrawer(true)}/>
    <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} products={catalog} onChange={change}/>
  </main>;
}
