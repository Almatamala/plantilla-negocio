"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, Star, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { fetchCatalog } from "@/lib/catalog";
import { formatPrice, type Product } from "@/lib/products";
import { loadResource } from "@/lib/resource";
import { useStoreSettings } from "@/lib/use-store-settings";
import { themeVars } from "@/lib/theme";
import { allergenInfo } from "@/lib/allergens";
import { CartDrawer } from "@/components/cart-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloatingCart } from "@/components/floating-cart";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

/**
 * Slide de la galería (D39): al pasar de foto la nueva entra desde un costado y la que sale se va hacia
 * el otro, según la dirección (`1` adelante, `-1` atrás). El `custom` de `AnimatePresence` le pasa esa
 * dirección también a la foto que sale, así el retroceso no se ve como un avance.
 */
const slideVariants: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%", opacity: 0 }),
};

type Review = { id: string; product_id: string; author: string; rating: number; comment: string; created_at: string };
type Detail = { product: Product; catalog: Product[]; reviews: Review[] };

/**
 * Lee la ficha desde el **catálogo compartido** (la misma lectura que usa la tienda) y solo los
 * comentarios de ese producto.
 *
 * Devolver `null` significa «no está en la carta». El catálogo ya trae categoría, fotos, alérgenos e
 * ingredientes, así que la ficha no repite `/api/products` ni `/api/categories` ni el endpoint por slug,
 * y el tono del gradiente coincide con el de la grilla. El catálogo además queda compartido con el
 * carrito lateral.
 */
async function fetchDetail(slug: string): Promise<Detail | null> {
  const { value: catalog } = await loadResource("catalog", fetchCatalog);
  const product = (catalog ?? []).find((row) => row.slug === slug);
  if (!product) return null;
  // `?product_id=` filtra en la base: antes se pedían todos los comentarios y se filtraba en el cliente.
  const reviews = await apiFetch<Review[]>(`/api/reviews?product_id=${product.id}`).catch(() => [] as Review[]);
  return { product, catalog: catalog ?? [], reviews };
}

export function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [image, setImage] = useState<string | null>(null);
  // Dirección del slide de la galería (D39): `1` para la próxima foto, `-1` para la anterior.
  const [slide, setSlide] = useState(1);
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
  // Comentario pendiente de borrar: el admin confirma en un modal antes de eliminarlo (D45).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; author: string } | null>(null);
  const { cart, add, change, count } = useCart();
  // Sesión (D45): si quien mira la ficha es admin, cada comentario publicado trae la papelera para
  // borrarlo desde la propia tienda.
  const session = useSession();
  const isAdmin = session.user?.role === "admin";

  const applyDetail = useCallback((data: Detail) => {
    setProduct(data.product);
    setImage(data.product.images?.[0] ?? data.product.image_url ?? null);
    setCatalog(data.catalog);
    setReviews(data.reviews);
  }, []);

  // La ficha se lee con la lectura **compartida**, que guarda la última versión conocida (D20): si la
  // API no responde se muestra eso, y si no hay nada guardado, «Producto no encontrado».
  useEffect(() => {
    let active = true;
    void loadResource(`product:${slug}`, () => fetchDetail(slug)).then(({ value }) => {
      if (!active) return;
      if (!value) { setProduct(null); return; }
      applyDetail(value);
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

  async function deleteReview(id: string) {
    try {
      await apiFetch(`/api/reviews/${id}`, { method: "DELETE", admin: true });
      setReviews((items) => items.filter((review) => review.id !== id));
    } catch {
      setReviewMsg("No se pudo eliminar el comentario.");
    }
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
    setSlide(delta);
    setImage(gallery[(currentIndex + delta + gallery.length) % gallery.length]);
  };
  // Al elegir una miniatura, el slide va hacia el lado en que está la foto elegida.
  const selectImage = (src: string) => {
    const next = gallery.indexOf(src);
    if (next === currentIndex) return;
    setSlide(next > currentIndex ? 1 : -1);
    setImage(src);
  };

  return shell(
    <div className="mx-auto max-w-7xl px-5 pb-20 md:px-10">
      <div className="mt-4 grid gap-10 md:grid-cols-2">
        <div>
          {gallery.length > 0 ? (
            <>
              <div className="relative aspect-[.95] w-full overflow-hidden rounded-2xl">
                {/* Las fotos se apilan en absoluto dentro del contenedor, así el slide no salta de alto. */}
                <AnimatePresence initial={false} custom={slide}>
                  <motion.img
                    key={image ?? gallery[0]}
                    custom={slide}
                    src={image ?? gallery[0]}
                    alt={product.name}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </AnimatePresence>
                {gallery.length > 1 && <>
                  {/* Zonas de los costados (D39): cubren la orilla de la foto y, al pasar el mouse por
                      ahí, aparece la flecha con un degradado suave que indica hacia dónde se mueve; el
                      clic cambia de foto. En pantallas táctiles no hay hover, así que la flecha queda
                      siempre visible. */}
                  <button type="button" onClick={() => goTo(-1)} aria-label="Foto anterior" className="group/prev absolute inset-y-0 left-0 flex w-1/5 min-w-[3.25rem] items-center justify-start">
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/30 to-transparent opacity-0 transition-opacity duration-200 group-hover/prev:opacity-100"/>
                    <span className="relative ml-3 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-[var(--brand-ink)] shadow transition group-hover/prev:bg-white md:opacity-0 md:group-hover/prev:opacity-100"><ChevronLeft size={20}/></span>
                  </button>
                  <button type="button" onClick={() => goTo(1)} aria-label="Foto siguiente" className="group/next absolute inset-y-0 right-0 flex w-1/5 min-w-[3.25rem] items-center justify-end">
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/30 to-transparent opacity-0 transition-opacity duration-200 group-hover/next:opacity-100"/>
                    <span className="relative mr-3 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-[var(--brand-ink)] shadow transition group-hover/next:bg-white md:opacity-0 md:group-hover/next:opacity-100"><ChevronRight size={20}/></span>
                  </button>
                </>}
              </div>
              {gallery.length > 1 && <div className="mt-3 flex gap-2">{gallery.map((src) => <button key={src} onClick={() => selectImage(src)} className={`h-20 w-16 overflow-hidden rounded-lg border-2 ${image === src ? "border-[var(--brand-accent)]" : "border-transparent"}`}><img src={src} alt="" className="h-full w-full object-cover"/></button>)}</div>}
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
            {hasReviews ? <div className="mt-4 space-y-4">{reviews.map((review) => (
              <div key={review.id} className="rounded-xl bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{review.author}</p>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-[#c9962e]">{Array.from({ length: review.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor"/>)}</span>
                    {isAdmin && <button onClick={() => setPendingDelete({ id: review.id, author: review.author })} aria-label={`Eliminar comentario de ${review.author}`} title="Eliminar comentario" className="text-[var(--brand-muted)] transition hover:text-[#8a4a44]"><Trash2 size={15}/></button>}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">{review.comment}</p>
              </div>
            ))}</div> : <p className="mt-3 text-sm text-[var(--brand-muted)]">Aún no hay comentarios para este producto.</p>}
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
      {pendingDelete && <ConfirmDialog title="Eliminar comentario" message={`¿Eliminar el comentario de ${pendingDelete.author}? No se puede deshacer.`} onCancel={() => setPendingDelete(null)} onConfirm={() => { const id = pendingDelete.id; setPendingDelete(null); void deleteReview(id); }}/>}
    </div>,
  );
}
