"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, X } from "lucide-react";
import { formatPrice, type Product } from "@/lib/products";

/**
 * Carrito lateral compartido por la carta y la ficha de producto. Los ítems se
 * resuelven contra el catálogo recibido; si un producto no está en esa lista se
 * avisa en lugar de desaparecer en silencio.
 *
 * Los colores salen de las variables `--brand-*` (D29) que escriben en línea los `<main>` cálidos que
 * lo montan, así que el carrito acompaña la paleta que el dueño guarde en Contenido.
 */
export function CartDrawer({
  open,
  onClose,
  cart,
  products,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  products: Product[];
  onChange: (id: string, delta: number) => void;
}) {
  const lines = products.filter((product) => cart[product.id]);
  const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const total = lines.reduce((sum, product) => sum + product.price * cart[product.id], 0);
  const missing = Object.keys(cart).filter((id) => !products.some((product) => product.id === id)).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button aria-label="Cerrar carrito" onClick={onClose} className="fixed inset-0 z-30 bg-[var(--brand-ink)]/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}/>
          <motion.aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white p-6 text-[var(--brand-ink)] shadow-2xl" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 330, damping: 32 }}>
            <div className="flex items-center justify-between">
              <h2 className="display text-3xl">Tu carrito</h2>
              <button onClick={onClose} aria-label="Cerrar"><X/></button>
            </div>
            <div className="mt-8 flex-1 space-y-5 overflow-auto">
              {count === 0 ? <p className="text-[var(--brand-muted)]">Aún no agregas productos a tu carrito.</p> : lines.map((product) => (
                <div key={product.id} className="flex gap-4 border-b border-[var(--brand-surface)] pb-5">
                  <div data-tone={product.tone} className="product-visual h-20 w-16 shrink-0"/>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="display text-lg">{product.name}</p>
                      <span>{formatPrice(product.price * cart[product.id])}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button onClick={() => onChange(product.id, -1)} aria-label={`Quitar una unidad de ${product.name}`}><Minus size={15}/></button>
                      <span className="text-sm">{cart[product.id]}</span>
                      <button onClick={() => onChange(product.id, 1)} aria-label={`Agregar una unidad de ${product.name}`}><Plus size={15}/></button>
                    </div>
                  </div>
                </div>
              ))}
              {missing > 0 && <p className="rounded-lg bg-[#f6e3d3] p-3 text-xs text-[#8a5a2c]">No pudimos mostrar {missing} {missing === 1 ? "producto" : "productos"} del carrito. Vuelve a la tienda e inténtalo nuevamente.</p>}
            </div>
            {count > 0 && (
              <div className="border-t border-[var(--brand-accent)] pt-5">
                <div className="mb-4 flex justify-between"><span>Total</span><span className="display text-xl">{formatPrice(total)}</span></div>
                <Link href="/checkout" className="block w-full bg-[var(--brand-accent)] py-4 text-center text-sm text-white">Continuar al checkout</Link>
                <p className="mt-3 text-center text-xs text-[var(--brand-muted)]">Elige punto de retiro, día, horario y forma de pago.</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
