"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHighlights } from "@/lib/highlights";
import { formatPrice, type Product } from "@/lib/products";

/**
 * Sección **«Nuevo» / «Más vendidos»** (D54): siempre los **cuatro productos más recientes** y los **cuatro
 * más vendidos**, en un carrusel de ocho paradas que reemplaza a las tarjetas de beneficios.
 *
 * Cada parada muestra el producto **dos veces**: en el panel izquierdo va su **segunda foto** (el detalle,
 * recortado a sangre contra el borde de la página) y en el panel derecho la **primera** —la principal— con
 * su nombre y su «Desde $…»; si el producto tiene **una sola foto**, las dos paradas usan esa misma.
 *
 * Las **cartas no se mueven**: los dos marcos —el del panel izquierdo y el de la foto del panel derecho—
 * quedan **fijos** y lo que se desliza **dentro** de ellos es la foto, con el mismo `slide` direccional de la
 * galería de la ficha (D39): la que entra viene de un costado y la que sale se va hacia el otro. El nombre y
 * el precio viven **fuera** del marco que se mueve, así que la tarjeta se queda quieta y solo cambia su pie
 * (con un fundido, sin desplazarse).
 *
 * El **título de la sección** va **encima de la carta del panel derecho** —arriba de la misma carta que se
 * desliza— y dice de qué grupo se trata (`Nuevo` en las cuatro primeras paradas y `Más vendidos` en las
 * cuatro últimas): se desliza al pasar de un grupo al otro.
 *
 * Los grupos salen de la API (`useHighlights`, D54) porque las ventas se calculan con los pedidos; mientras
 * la respuesta llega —o si la API no responde y no hay respaldo— se muestran los productos que la tienda ya
 * tiene (`fallback`, el catálogo compartido), así la sección nunca queda vacía.
 */

/** Slide de las fotos dentro de su marco, según la dirección (`1` adelante, `-1` atrás), como en la ficha (D39). */
const slideVariants: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: 0 },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%" }),
};

/** El título entra desde el lado hacia el que se avanza y sale hacia el contrario. */
const titleVariants: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? 90 : -90, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -90 : 90, opacity: 0 }),
};

/** Mismo tiempo que la galería de la ficha (D39): las fotos entran y salen a este ritmo. */
const transition = { duration: 0.35, ease: "easeOut" } as const;

/**
 * Círculo de una flecha: mismo botón en las dos, así el clic se apunta igual y la flecha siempre cae al
 * **lado de la carta** (no en el borde del panel, que queda a un costado de la vista). Nunca se bloquean: el
 * carrusel es **circular** y de la última parada vuelve a la primera.
 */
const arrowClass = "absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--brand-ink)] shadow-md transition hover:scale-105";

/** Las dos fotos del producto: la principal (la primera) y la de detalle (la segunda, si hay). */
function photos(product: Product): { main: string; detail: string } {
  const list = product.images?.length ? product.images : [product.image_url ?? ""];
  return { main: list[0] ?? "", detail: list[1] ?? list[0] ?? "" };
}

export function ProductHighlights({ fallback = [] }: { fallback?: Product[] }) {
  const { recent, bestSellers } = useHighlights(fallback);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  // Las ocho paradas: primero los cuatro recientes y después los cuatro más vendidos, cada una con el título
  // de su grupo. El índice se recorta al total por si la API devuelve menos productos que el respaldo.
  const slides = [
    ...recent.map((product) => ({ product, group: "Nuevo" })),
    ...bestSellers.map((product) => ({ product, group: "Más vendidos" })),
  ];
  if (slides.length === 0) return null;
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];
  const { main, detail } = photos(slide.product);

  // Circular: adelante desde la última vuelve a la primera y atrás desde la primera va a la última, así las
  // flechas nunca quedan bloqueadas.
  const go = (step: number) => {
    setDirection(step);
    setIndex((current + step + slides.length) % slides.length);
  };
  const select = (position: number) => {
    setDirection(position > current ? 1 : -1);
    setIndex(position);
  };

  return (
    <section id="novedades" className="bg-[var(--cream)] ">
      <div className="grid md:grid-cols-2 gap-1">
        {/* Panel izquierdo: el marco queda fijo (a sangre contra el borde de la página) y la foto de detalle
            se desliza dentro. El fondo del visual (`product-visual`) es el degradado de la paleta, así que un
            producto sin foto igual muestra su bloque de color. */}
        

        {/* Panel derecho: la tarjeta (marco de la foto + pie) no se mueve. Dentro de su marco se desliza la
            foto principal y el pie —nombre y «Desde $…»— cambia con un fundido, sin desplazarse. Las flechas
            van en círculo **al lado de la tarjeta** y los puntos debajo. */}
        <div className="relative flex flex-col items-center justify-center bg-[var(--brand-surface)] px-14 py-12 md:px-24 md:py-16">
          <div className="w-full max-w-sm">
            {/* Título **encima de la carta**, en la misma columna que ella: dice en qué grupo se está y se
                desliza al cambiar de uno a otro. El alto queda fijo para que el que sale y el que entra se
                muevan en el mismo carril y la carta no salte. */}
            <div className="text-left">
              <p className="text-xs tracking-[.18em] text-[var(--brand-accent)] uppercase">Destacados</p>
              <div className="mt-2 h-16 overflow-hidden">
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.h2
                    key={slide.group}
                    custom={direction}
                    variants={titleVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="display text-4xl leading-none md:text-5xl"
                  >
                    {slide.group}
                  </motion.h2>
                </AnimatePresence>
              </div>
            </div>

            {/* La carta: las flechas se anclan a este marco, que es el que no se mueve. */}
            <div className="relative mt-4">
              <button onClick={() => go(-1)} aria-label="Producto anterior" title="Producto anterior" className={`${arrowClass} -left-14`}><ChevronLeft size={22}/></button>
              <button onClick={() => go(1)} aria-label="Producto siguiente" title="Producto siguiente" className={`${arrowClass} -right-14`}><ChevronRight size={22}/></button>

              <div data-tone={slide.product.tone} className="product-visual relative h-[300px] w-full overflow-hidden md:h-[420px]">
                <AnimatePresence initial={false} custom={direction}>
                  <motion.div key={current} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={transition} className="absolute inset-0">
                    <Link href={`/producto/${slide.product.slug}`} className="block h-full w-full">
                      {main ? <img src={main} alt={slide.product.name} className="h-full w-full object-cover"/> : null}
                    </Link>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* El pie de la tarjeta: mismo alto siempre, así el cambio de producto no corre los puntos. */}
              <div className="mt-5 h-20">
                <AnimatePresence initial={false} mode="wait">
                  <motion.div key={current} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Link href={`/producto/${slide.product.slug}`} className="block">
                      <span className="block text-sm">{slide.product.name}</span>
                      <span className="mt-2 block text-sm text-[var(--brand-muted)]">Desde {formatPrice(slide.product.price)}</span>
                    </Link>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Un punto por parada: dice en qué producto se está y en qué grupo. */}
          <div className="mt-8 flex items-center gap-3">
            {slides.map((item, position) => (
              <button
                key={`${item.group}-${item.product.id}`}
                onClick={() => select(position)}
                aria-label={`Ver ${item.product.name}`}
                aria-current={position === current}
                className={`h-3 w-3 rounded-full transition ${position === current ? "bg-[var(--brand-ink)]" : "bg-[var(--brand-muted)]/40 hover:bg-[var(--brand-muted)]"}`}
              />
            ))}
          </div>
        </div>
        <div data-tone={slide.product.tone} className="product-visual relative min-h-[320px] overflow-hidden md:min-h-[560px]">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div key={current} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={transition} className="absolute inset-0">
              {detail ? <img src={detail} alt={slide.product.name} className="h-full w-full object-cover"/> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
