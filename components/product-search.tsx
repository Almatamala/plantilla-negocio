"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatPrice, type Product } from "@/lib/products";
import { suggestProducts } from "@/lib/search";

/**
 * Buscador de productos **con autocompletado** (D55).
 *
 * Es un input **controlado** (el texto vive en quien lo usa, la carta, porque es el mismo filtro de la
 * grilla) que al escribir abre una lista de coincidencias con foto, nombre y precio. Se navega con
 * **flechas y Enter** o con el mouse, y elegir una lleva a su ficha `/producto/[slug]`.
 *
 * El catálogo ya está en el navegador (lectura compartida, D41), así que filtrar es instantáneo: **no hay
 * endpoint ni una petición por tecla**, y funciona incluso con la última versión conocida (D20). Las
 * coincidencias las resuelve `lib/search.ts`, la **misma regla** que después aplica la grilla, así que una
 * sugerencia siempre deja un resultado visible.
 *
 * El botón de la lupa del header enfoca este input por su `id` (`buscador`), y al recibir el foco la lista
 * se abre sola.
 */
const MAX_SUGGESTIONS = 6;

export function ProductSearch({
  products,
  value,
  onChange,
  id = "buscador",
  placeholder = "Buscar productos",
}: {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = useMemo(() => suggestProducts(products, value, MAX_SUGGESTIONS), [products, value]);
  // La lista solo tiene sentido con algo escrito: al vaciar el buscador se cierra.
  const showList = open && value.trim().length > 0;

  const choose = (product: Product) => {
    setOpen(false);
    setActive(-1);
    router.push(`/producto/${product.slug}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, -1));
    } else if (event.key === "Enter") {
      const product = suggestions[active];
      if (product) {
        event.preventDefault();
        choose(product);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <label className="flex items-center gap-2 border-b border-[var(--brand-accent)] pb-2 text-sm">
        <Search size={16} />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            // Al cambiar la consulta, la selección de teclado vuelve al principio (antes vivía en un
            // efecto, que disparaba renders en cascada; acá es parte del propio cambio).
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          className="w-44 bg-transparent outline-none placeholder:text-[var(--brand-muted)]"
        />
      </label>
      {showList && (
        <>
          {/* Botón invisible a pantalla completa que cierra la lista al hacer clic afuera (mismo recurso que
              el selector de forma del logo); va **antes** del panel para que este quede por encima. */}
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-20 cursor-default" />
          <div
            id={`${id}-suggestions`}
            role="listbox"
            className="absolute right-0 z-30 mt-3 w-80 overflow-hidden rounded-2xl border border-[var(--brand-accent)]/30 bg-white text-[var(--brand-ink)] shadow-xl"
          >
            {suggestions.length > 0 ? (
              <ul className="max-h-96 overflow-y-auto">
                {suggestions.map((product, index) => {
                  const photo = product.images?.[0] ?? product.image_url;
                  return (
                    <li
                      key={product.id}
                      role="option"
                      aria-selected={index === active}
                      id={`${id}-option-${index}`}
                    >
                      <Link
                        href={`/producto/${product.slug}`}
                        onClick={() => {
                          setOpen(false);
                          setActive(-1);
                        }}
                        onMouseEnter={() => setActive(index)}
                        className={`flex items-center gap-3 px-4 py-3 transition ${index === active ? "bg-[var(--brand-surface)]" : ""}`}
                      >
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--brand-surface)]">
                          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{product.name}</span>
                          <span className="block truncate text-xs text-[var(--brand-muted)]">{product.category}</span>
                        </span>
                        <span className="shrink-0 text-sm">{formatPrice(product.price)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-[var(--brand-muted)]">
                No encontramos productos con «{value.trim()}».
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
