"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";

/**
 * Acceso flotante al carrito, **encima del botón de WhatsApp** (que vive en la esquina inferior
 * derecha).
 *
 * Aparece solo cuando el **header de la tienda dejó de verse**: así el cliente puede volver al carrito
 * sin subir hasta arriba. El header se busca por su `id` (`store-header`, que pone `StoreHeader`); en
 * una pantalla sin ese header (el checkout, por ejemplo) no se dibuja nada.
 *
 * Entra y sale con la **misma animación que los productos de «Productos destacados»**
 * (`opacity 0 → 1` y `scale 0.96 → 1`, 0.28 s con `easeOut`), como el resto de la carta.
 *
 * Se comporta como el ícono del header: abre el **carrito lateral** cuando la pantalla lo tiene
 * (`onOpen`) y, cuando no, enlaza al **checkout** (`href`).
 */
export function FloatingCart({
  count = 0,
  onOpen,
  href = "/checkout",
}: {
  count?: number;
  onOpen?: () => void;
  href?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const header = document.getElementById("store-header") ?? document.querySelector("header");
    if (!header) return;
    // Aparece cuando el borde inferior del header cruza el borde superior de la ventana, o sea cuando
    // ya no se ve nada de él. Se revisa al montar (por si la página carga ya scrolleada), al scrollear
    // y al redimensionar.
    const update = () => setVisible(header.getBoundingClientRect().bottom <= 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // El badge se cuelga del botón, que lleva `relative`; el contenedor animado es el que va `fixed`.
  const button = "relative grid h-14 w-14 place-items-center rounded-full bg-[var(--brand-ink)] text-[var(--brand-on-ink)] shadow-lg transition hover:scale-105";
  const badge = "absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--brand-detail)] text-[10px] text-[var(--brand-ink)]";
  const content = <>
    <ShoppingBag size={22}/>
    {count > 0 && <span className={badge}>{count}</span>}
  </>;

  return (
    <AnimatePresence>
      {visible && (
        // `bottom-23` deja el botón justo arriba del de WhatsApp (`bottom-5` + 14 de alto).
        <motion.div
          key="floating-cart"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed right-5 bottom-23 z-30"
        >
          {onOpen
            ? <button type="button" onClick={onOpen} aria-label="Ver carrito" title="Ver carrito" className={button}>{content}</button>
            : <Link href={href} aria-label="Ver carrito" title="Ver carrito" className={button}>{content}</Link>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
