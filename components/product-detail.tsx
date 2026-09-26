"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { readCache, writeCache } from "@/lib/offline-cache";
import { formatPrice, mapApiProduct, type ApiProduct, type Product } from "@/lib/products";
import { useStoreSettings } from "@/lib/use-store-settings";
import { themeVars } from "@/lib/theme";
import { allergenInfo } from "@/lib/allergens";
import { CartDrawer } from "@/components/cart-drawer";
import { FloatingCart } from "@/components/floating-cart";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

type Review = { id: string; product_id: string; author: string; rating: number; comment: string; created_at: string };
type Detail = { product: Product; catalog: Product[]; reviews: Review[] };
/**
 * Lo que se guarda por producto: la ficha y sus comentarios.
 * El catálogo **no** se repite acá: vive en la clave `catalog`, compartida con la tienda, y se lee de
 * ahí si hace falta (es lo que usa el carrito lateral).
 */
type CachedProduct = { product: Product; reviews: Review[] };

/** Lee producto, catálogo y comentarios de la API. Sin estado: se aplica en callbacks. */
async function fetchDetail(slug: string): Promise<Detail> {
  const [data, cats, rows] = await Promise.all([
    apiFetch<ApiProduct>(`/api/products/slug/${slug}`),
    apiFetch<{ id: string; name: string }[]>("/api/categories"),
    apiFetch<ApiProduct[]>("/api/products"),
  ]);
  const categories = new Map(cats.map((category) => [category.id, category.name]));
  const product = mapApiProduct(data, 0, categories);
  const catalog = rows.map((row, index) => mapApiProduct(row, index, categories));
  const reviews = await apiFetch<Review[]>("/api/reviews").catch(() => [] as Review[]);
  return { product, catalog, reviews: reviews.filter((review) => review.product_id === product.id) };
}

export function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [image, setImage] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  // La cantidad se puede escribir: se mantiene el texto aparte para poder borrarlo y reescribirlo
  // sin que el número quede en 0 a medio tipear.
  const [qtyText, setQtyText] = useState("1");
  const [added, setAdded] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const config = useStoreSettings();
  const [drawer, setDrawer] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const { cart, add, change, count } = useCart();

  const applyDetail = useCallback((data: Detail) => {
    setProduct(data.product);
    setImage(data.product.images?.[0] ?? data.product.image_url ?? null);
    setCatalog(data.catalog);
    setReviews(data.reviews);
  }, []);

  // Última versión conocida de la ficha: si la API no responde, se muestra esto en lugar de
  // «Producto no encontrado» (ver `lib/offline-cache.ts`).
  useEffect(() => {
    const key = `product:${slug}`;
    let active = true;
    fetchDetail(slug)
      .then((data) => {
        if (!active) return;
        applyDetail(data);
        writeCache(key, { product: data.product, reviews: data.reviews } satisfies CachedProduct);
        writeCache("catalog", data.catalog);
      })
      .catch(() => {
        if (!active) return;
        const cached = readCache<CachedProduct>(key);
        if (!cached) { setProduct(null); return; }
        setProduct(cached.product);
        setImage(cached.product.images?.[0] ?? cached.product.image_url ?? null);
        setReviews(cached.reviews);
        const catalog = readCache<Product[]>("catalog");
        if (catalog?.length) setCatalog(catalog);
      });
    return () => { active = false; };
  }, [slug, applyDetail]);

  function setQuantity(next: number) {
    const value = Math.min(99, Math.max(1, Math.floor(next) || 1));
    setQty(value);
    setQtyText(String(value));
  }

  function addToCart() {
    if (!product) return;
    add(product.id, qty);
    setDrawer(true);
    setAdded(true);
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    setReviewMsg("");
    if (!product) return;
    try {
      await apiFetch("/api/reviews", { method: "POST", body: { product_id: product.id, author, rating, comment } });
      setAuthor(""); setComment(""); setRating(5);
      setReviewMsg("¡Gracias! Tu comentario se publicará después de la revisión.");
    } catch {
      setReviewMsg("No se pudo enviar el comentario. Intenta nuevamente.");
    }
  }

  // La ficha mantiene el header y el footer de la tienda (no es una página aislada)
  // y ya no incluye un enlace «Volver a la tienda».
  const shell = (content: React.ReactNode) => (
    // La paleta editable (D29) entra como variables CSS en el `<main>`: la ficha, el header, el carrito
    // lateral y el footer la heredan sin pasar ninguna prop.
    <main className="theme-bosque min-h-screen bg-white text-[var(--brand-ink)]" style={themeVars(config.theme_colors)}>
      <StoreHeader warm config={config} cartCount={count} onCartOpen={() => setDrawer(true)}/>
      {content}
      <StoreFooter config={config}/>
      <WhatsAppButton phone={config.whatsapp_phone}/>
      <FloatingCart count={count} onOpen={() => setDrawer(true)}/>
      <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} products={catalog} onChange={change}/>
    </main>
  );

  if (product === undefined) {
    return shell(<div className="grid min-h-[60vh] place-items-center px-5"><p className="text-[var(--brand-muted)]">Cargando producto…</p></div>);
  }

  if (product === null) {
    return shell(
      <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-5 text-center md:px-10">
        <div>
          <h1 className="display text-4xl">Producto no encontrado</h1>
          <p className="mt-3 text-[var(--brand-muted)]">Puede que ya no esté disponible. Revisa la colección en el menú de arriba.</p>
        </div>
      </div>,
    );
  }

  const gallery = [...(product.images ?? []), ...(product.image_url && !(product.images ?? []).includes(product.image_url) ? [product.image_url] : [])].filter(Boolean) as string[];
  const hasReviews = reviews.length > 0;
  // Índice de la foto visible: permite avanzar/retroceder con las flechas y da la vuelta al llegar al final.
  const currentIndex = Math.max(0, gallery.indexOf(image ?? gallery[0] ?? ""));
  const goTo = (delta: number) => {
    if (gallery.length < 2) return;
    setImage(gallery[(currentIndex + delta + gallery.length) % gallery.length]);
  };

  return shell(
    <div className="mx-auto max-w-7xl px-5 pb-20 md:px-10">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          {gallery.length > 0 ? (
            <>
              <div className="relative overflow-hidden rounded-2xl">
                <img src={image ?? gallery[0]} alt={product.name} className="aspect-[.95] w-full object-cover"/>
                {gallery.length > 1 && <>
                  <button type="button" onClick={() => goTo(-1)} aria-label="Foto anterior" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[var(--brand-ink)] shadow transition hover:bg-white"><ChevronLeft size={20}/></button>
                  <button type="button" onClick={() => goTo(1)} aria-label="Foto siguiente" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[var(--brand-ink)] shadow transition hover:bg-white"><ChevronRight size={20}/></button>
                </>}
              </div>
              {gallery.length > 1 && <div className="mt-3 flex gap-2">{gallery.map((src) => <button key={src} onClick={() => setImage(src)} className={`h-20 w-16 overflow-hidden rounded-lg border-2 ${image === src ? "border-[var(--brand-accent)]" : "border-transparent"}`}><img src={src} alt="" className="h-full w-full object-cover"/></button>)}</div>}
            </>
          ) : (
            <div data-tone={product.tone} className="product-visual aspect-[.95] w-full rounded-2xl"/>
          )}
        </div>
        <div className="md:py-4">
          <p className="text-xs tracking-[.18em] text-[var(--brand-accent)] uppercase">{product.category}</p>
          <h1 className="display mt-2 text-4xl leading-tight md:text-5xl">{product.name}</h1>
          <p className="display mt-5 text-3xl">{formatPrice(product.price)}</p>
          <p className="mt-5 max-w-prose leading-7 text-[var(--brand-muted)]">{product.description}</p>
          {product.ingredients && <div className="mt-6"><h2 className="text-xs tracking-[.16em] text-[var(--brand-muted)] uppercase">Ingredientes principales</h2><p className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">{product.ingredients}</p></div>}
          {product.allergens && product.allergens.length > 0 && <div className="mt-6"><h2 className="text-xs tracking-[.16em] text-[var(--brand-muted)] uppercase">Información de alérgenos</h2><div className="mt-3 flex flex-wrap gap-2">{product.allergens.map((code) => { const info = allergenInfo(code); return info ? <span key={code} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-surface)] bg-white px-3 py-1.5 text-xs" title={`Contiene: ${info.label}`}>{info.icon}{info.label}</span> : null; })}</div></div>}
          <div className="mt-7 flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full border border-[var(--brand-surface)] px-4 py-2.5">
              <button onClick={() => setQuantity(qty - 1)} aria-label="Disminuir cantidad"><Minus size={16}/></button>
              <input
                value={qtyText}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setQtyText(raw);
                  if (raw) setQuantity(Number(raw));
                }}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => setQtyText(String(qty))}
                inputMode="numeric"
                aria-label="Cantidad"
                title="Haz clic para escribir la cantidad"
                className="w-8 cursor-text bg-transparent text-center text-sm outline-none"
              />
              <button onClick={() => setQuantity(qty + 1)} aria-label="Aumentar cantidad"><Plus size={16}/></button>
            </div>
            <button onClick={addToCart} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--brand-accent)] px-6 py-3 text-sm text-white"><ShoppingBag size={16}/>Agregar al carrito</button>
          </div>
          {added && <div className="mt-4 rounded-lg bg-[#e7eae0] p-3 text-sm text-[#4d573e]">Producto agregado a tu carrito. <Link href="/checkout" className="underline underline-offset-2">Ir al checkout</Link> o <Link href="/#coleccion" className="underline underline-offset-2">seguir comprando</Link>.</div>}
          <div className="mt-8 border-t border-[var(--brand-surface)] pt-6">
            <h2 className="display text-2xl">Comentarios {hasReviews && <span className="text-base text-[var(--brand-muted)]">({reviews.length})</span>}</h2>
            {hasReviews ? <div className="mt-4 space-y-4">{reviews.map((review) => <div key={review.id} className="rounded-xl bg-white p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">{review.author}</p><span className="inline-flex items-center gap-0.5 text-[#c9962e]">{Array.from({ length: review.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor"/>)}</span></div><p className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">{review.comment}</p></div>)}</div> : <p className="mt-3 text-sm text-[var(--brand-muted)]">Aún no hay comentarios para este producto.</p>}
            <form onSubmit={submitReview} className="mt-6 space-y-3 rounded-xl bg-white p-4">
              <h3 className="text-sm font-medium">Deja tu comentario</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input required value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Tu nombre" className="rounded-lg border border-[var(--brand-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-accent)]"/>
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="select-field rounded-lg border border-[var(--brand-surface)] bg-white px-3 py-2.5 text-sm outline-none transition hover:border-[var(--brand-accent)] focus:border-[var(--brand-accent)]">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? "estrella" : "estrellas"}</option>)}</select>
              </div>
              <textarea required value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Cuéntanos qué te pareció…" rows={3} className="w-full rounded-lg border border-[var(--brand-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-accent)]"/>
              <button className="rounded-lg bg-[var(--brand-accent)] px-4 py-2.5 text-sm text-white">Enviar comentario</button>
              {reviewMsg && <p className="text-sm text-[var(--brand-muted)]">{reviewMsg}</p>}
            </form>
          </div>
        </div>
      </div>
    </div>,
  );
}
