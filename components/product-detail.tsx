"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { formatPrice, mapApiProduct, stockLabel, type ApiProduct, type Product } from "@/lib/products";
import { mergeSettings, storeConfig, type ApiSettings, type StoreConfig } from "@/lib/store-config";
import { allergenInfo } from "@/lib/allergens";
import { CartDrawer } from "@/components/cart-drawer";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

type Review = { id: string; product_id: string; author: string; rating: number; comment: string; created_at: string };

/** Lee producto, catálogo y comentarios de la API. Sin estado: se aplica en callbacks. */
async function fetchDetail(slug: string): Promise<{ product: Product; catalog: Product[]; reviews: Review[] }> {
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
  const [added, setAdded] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [config, setConfig] = useState<StoreConfig>(storeConfig);
  const [drawer, setDrawer] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const { cart, add, change, count } = useCart();

  useEffect(() => {
    apiFetch<ApiSettings>("/api/settings")
      .then((data) => setConfig((current) => mergeSettings(current, data)))
      .catch(() => undefined);
  }, []);

  const applyDetail = useCallback((data: { product: Product; catalog: Product[]; reviews: Review[] }) => {
    setProduct(data.product);
    setImage(data.product.images?.[0] ?? data.product.image_url ?? null);
    setCatalog(data.catalog);
    setReviews(data.reviews);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDetail(slug)
      .then((data) => { if (active) applyDetail(data); })
      .catch(() => { if (active) setProduct(null); });
    return () => { active = false; };
  }, [slug, applyDetail]);

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
    <main className="min-h-screen bg-[#faf7f0] text-[#243128]">
      <StoreHeader config={config} cartCount={count} onCartOpen={() => setDrawer(true)}/>
      {content}
      <StoreFooter config={config}/>
      <WhatsAppButton phone={config.whatsapp_phone}/>
      <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} products={catalog} onChange={change}/>
    </main>
  );

  if (product === undefined) {
    return shell(<div className="grid min-h-[60vh] place-items-center px-5"><p className="text-[#647167]">Cargando producto…</p></div>);
  }

  if (product === null) {
    return shell(
      <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-5 text-center md:px-10">
        <div>
          <h1 className="display text-4xl">Producto no encontrado</h1>
          <p className="mt-3 text-[#647167]">Puede que ya no esté disponible. Revisa la colección en el menú de arriba.</p>
        </div>
      </div>,
    );
  }

  const stock = stockLabel(product);
  const gallery = [...(product.images ?? []), ...(product.image_url && !(product.images ?? []).includes(product.image_url) ? [product.image_url] : [])].filter(Boolean) as string[];
  const hasReviews = reviews.length > 0;

  return shell(
    <div className="mx-auto max-w-7xl px-5 pb-20 md:px-10">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          {gallery.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-2xl">
                <img src={image ?? gallery[0]} alt={product.name} className="aspect-[.95] w-full object-cover"/>
              </div>
              {gallery.length > 1 && <div className="mt-3 flex gap-2">{gallery.map((src) => <button key={src} onClick={() => setImage(src)} className={`h-20 w-16 overflow-hidden rounded-lg border-2 ${image === src ? "border-[#243128]" : "border-transparent"}`}><img src={src} alt="" className="h-full w-full object-cover"/></button>)}</div>}
            </>
          ) : (
            <div data-tone={product.tone} className="product-visual aspect-[.95] w-full rounded-2xl"/>
          )}
        </div>
        <div className="md:py-4">
          <p className="text-xs tracking-[.18em] text-[#56745c] uppercase">{product.category}</p>
          <h1 className="display mt-2 text-4xl leading-tight md:text-5xl">{product.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${stock.className}`}>{stock.label}</span>
          </div>
          <p className="display mt-5 text-3xl">{formatPrice(product.price)}</p>
          <p className="mt-5 max-w-prose leading-7 text-[#526058]">{product.description}</p>
          {product.ingredients && <div className="mt-6"><h2 className="text-xs tracking-[.16em] text-[#748077] uppercase">Ingredientes principales</h2><p className="mt-2 text-sm leading-6 text-[#526058]">{product.ingredients}</p></div>}
          {product.allergens && product.allergens.length > 0 && <div className="mt-6"><h2 className="text-xs tracking-[.16em] text-[#748077] uppercase">Información de alérgenos</h2><div className="mt-3 flex flex-wrap gap-2">{product.allergens.map((code) => { const info = allergenInfo(code); return info ? <span key={code} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d6cd] bg-white px-3 py-1.5 text-xs" title={`Contiene: ${info.label}`}>{info.icon}{info.label}</span> : null; })}</div></div>}
          {!stock.available && <p className="mt-6 rounded-lg bg-[#f3e2e0] p-3 text-sm text-[#8a4a44]">Este producto está agotado. Vuelve pronto o consulta por WhatsApp.</p>}
          <div className="mt-7 flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full border border-[#c7ccc3] px-4 py-2.5">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Disminuir cantidad"><Minus size={16}/></button>
              <span className="w-6 text-center text-sm">{qty}</span>
              <button onClick={() => setQty(qty + 1)} aria-label="Aumentar cantidad"><Plus size={16}/></button>
            </div>
            <button onClick={addToCart} disabled={!stock.available} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#243128] px-6 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"><ShoppingBag size={16}/>Agregar al carrito</button>
          </div>
          {added && <div className="mt-4 rounded-lg bg-[#e2f0e2] p-3 text-sm text-[#3c6b3f]">Producto agregado a tu carrito. <Link href="/checkout" className="underline underline-offset-2">Ir al checkout</Link> o <Link href="/#coleccion" className="underline underline-offset-2">seguir comprando</Link>.</div>}
          <div className="mt-8 border-t border-[#e2e5df] pt-6">
            <h2 className="display text-2xl">Comentarios {hasReviews && <span className="text-base text-[#748077]">({reviews.length})</span>}</h2>
            {hasReviews ? <div className="mt-4 space-y-4">{reviews.map((review) => <div key={review.id} className="rounded-xl bg-white p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">{review.author}</p><span className="inline-flex items-center gap-0.5 text-[#c9962e]">{Array.from({ length: review.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor"/>)}</span></div><p className="mt-2 text-sm leading-6 text-[#526058]">{review.comment}</p></div>)}</div> : <p className="mt-3 text-sm text-[#647167]">Aún no hay comentarios para este producto.</p>}
            <form onSubmit={submitReview} className="mt-6 space-y-3 rounded-xl bg-white p-4">
              <h3 className="text-sm font-medium">Deja tu comentario</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input required value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Tu nombre" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#243128]">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? "estrella" : "estrellas"}</option>)}</select>
              </div>
              <textarea required value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Cuéntanos qué te pareció…" rows={3} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
              <button className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white">Enviar comentario</button>
              {reviewMsg && <p className="text-sm text-[#647167]">{reviewMsg}</p>}
            </form>
          </div>
        </div>
      </div>
    </div>,
  );
}
