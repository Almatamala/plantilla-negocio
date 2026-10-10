"use client";

import { Slider } from "@base-ui/react/slider";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { formatPrice, type Product } from "@/lib/products";
import { priceBounds } from "@/lib/search";

/**
 * Filtros de la carta (D56): **categoría** y **rango de precio**.
 *
 * El botón **«Filtros»** despliega hacia la derecha los dos grupos —**«Categorías»** y **«Precio»**— y,
 * al elegir uno, sus controles aparecen debajo; volver a apretar el grupo (o «Filtros») los **retrae**.
 * Es un acordeón de dos niveles con la animación de siempre (opacidad + escala, `0.28s easeOut`), la misma
 * que usa la grilla de la vitrina.
 *
 * Los controles son **controlados** por la carta (`storefront.tsx`): los valores viven allá y acá solo se
 * dibujan, así que la regla que filtra los productos (`lib/search.ts`) queda en un solo lugar. La categoría
 * se dibuja tal como estaba antes (píldoras, con su «Todos») y el precio es un **slider de dos extremos**
 * cuyos límites y paso salen del catálogo.
 */
export type PriceRange = [number, number];

type Group = "category" | "price";

export function ProductFilters({
  products,
  category,
  onCategory,
  range,
  onRange,
}: {
  products: Product[];
  category: string;
  onCategory: (value: string) => void;
  range: PriceRange | null;
  onRange: (value: PriceRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group | null>(null);

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))), [products]);
  const bounds = useMemo(() => priceBounds(products), [products]);
  // El paso se adapta al ancho del rango: un rango chico con paso fijo de $1.000 dejaría dos posiciones.
  const step = bounds[1] > bounds[0] ? Math.max(1, Math.round((bounds[1] - bounds[0]) / 40)) : 1;

  const categoryActive = category !== "";
  const priceActive = range !== null;
  const activeCount = (categoryActive ? 1 : 0) + (priceActive ? 1 : 0);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      setGroup(null);
    } else {
      setOpen(true);
    }
  };

  const toggleGroup = (id: Group) => setGroup((current) => (current === id ? null : id));

  const clear = () => {
    onCategory("");
    onRange(null);
  };

  const pill = "rounded-full border px-4 py-2 text-sm transition";
  const pillIdle = "border-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white";
  const pillOn = "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white";

  const groupButton = (id: Group, label: string, active: boolean) => (
    <button
      type="button"
      onClick={() => toggleGroup(id)}
      aria-expanded={group === id}
      className={`${pill} inline-flex items-center gap-2 whitespace-nowrap ${group === id ? pillOn : pillIdle}`}
    >
      {label}
      {active && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    </button>
  );

  return (
    <div className="relative">
      {/* La barra va por encima del velo que cierra al hacer clic afuera, así sus botones se pueden pulsar. */}
      <div className="relative z-20 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className={`${pill} inline-flex items-center gap-2 ${open || activeCount > 0 ? pillOn : pillIdle}`}
        >
          <SlidersHorizontal size={15} />
          Filtros
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/25 px-1 text-[11px]">
              {activeCount}
            </span>
          )}
        </button>
        {/* Los dos grupos se despliegan **a la derecha** del botón; al retraerse el contenedor vuelve a 0. */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex items-center gap-2 overflow-hidden"
            >
              {groupButton("category", "Categorías", categoryActive)}
              {groupButton("price", "Precio", priceActive)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controles del grupo abierto: aparecen debajo con la animación de siempre (opacidad + escala). */}
      <AnimatePresence mode="wait">
        {open && group && (
          <motion.div
            key={group}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="absolute top-full left-0 z-20 mt-3 rounded-2xl border border-[var(--brand-accent)]/30 bg-white p-5 text-[var(--brand-ink)] shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-6">
              <p className="text-xs tracking-[.16em] text-[var(--brand-muted)] uppercase">
                {group === "category" ? "Categorías" : "Precio"}
              </p>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--brand-muted)] transition hover:text-[var(--brand-ink)]"
                >
                  <RotateCcw size={13} />
                  Limpiar
                </button>
              )}
            </div>

            {group === "category" ? (
              <div className="flex max-w-md flex-wrap gap-2">
                {["Todos", ...categories].map((option) => {
                  const value = option === "Todos" ? "" : option;
                  const active = value === category;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onCategory(value)}
                      aria-pressed={active}
                      className={`${pill} ${active ? pillOn : pillIdle}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : bounds[0] === bounds[1] ? (
              <p className="w-80 text-sm text-[var(--brand-muted)]">Todos los productos valen {formatPrice(bounds[0])}.</p>
            ) : (
              <div className="w-80">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{formatPrice(range?.[0] ?? bounds[0])}</span>
                  <span>{formatPrice(range?.[1] ?? bounds[1])}</span>
                </div>
                <Slider.Root
                  value={range ?? bounds}
                  onValueChange={(next) => onRange([next[0], next[1]])}
                  min={bounds[0]}
                  max={bounds[1]}
                  step={step}
                  thumbCollisionBehavior="swap"
                >
                  <Slider.Control className="flex w-full touch-none items-center py-3 select-none">
                    <Slider.Track className="h-1.5 w-full rounded-full bg-[var(--brand-surface)] select-none">
                      <Slider.Indicator className="rounded-full bg-[var(--brand-accent)] select-none" />
                      <Slider.Thumb index={0} aria-label="Precio mínimo" className="size-4 rounded-full border-2 border-white bg-[var(--brand-accent)] shadow outline-none ring-1 ring-[var(--brand-accent)] select-none" />
                      <Slider.Thumb index={1} aria-label="Precio máximo" className="size-4 rounded-full border-2 border-white bg-[var(--brand-accent)] shadow outline-none ring-1 ring-[var(--brand-accent)] select-none" />
                    </Slider.Track>
                  </Slider.Control>
                </Slider.Root>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
            setGroup(null);
          }}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}
    </div>
  );
}
