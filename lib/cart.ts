"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Carrito de la tienda. Vive en `localStorage` bajo una única clave y se expone
 * como store externo, así la carta, la ficha de producto y el checkout siempre
 * leen y escriben lo mismo.
 *
 * Antes cada pantalla se guardaba el carrito por su cuenta: la ficha escribía el
 * `localStorage` a mano y el storefront lo pisaba con un carrito vacío antes de
 * restaurarlo, por lo que los ítems desaparecían al volver a la tienda desde la
 * ficha de producto (bug «seguir comprando»).
 */
const CART_KEY = "store-cart";

type Cart = Record<string, number>;

const EMPTY_CART: Cart = {};

let snapshot: Cart = EMPTY_CART;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): Cart {
  if (!raw) return EMPTY_CART;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_CART;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, quantity]) => typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0,
      ),
    ) as Cart;
  } catch {
    return EMPTY_CART;
  }
}

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CART_KEY);
  } catch {
    return null;
  }
}

/** Carrito actual (referencia estable mientras no cambie). */
function getCart(): Cart {
  if (!loaded) {
    snapshot = parse(readStorage());
    loaded = true;
  }
  return snapshot;
}

function emit() {
  for (const listener of listeners) listener();
}

/** Reemplaza el carrito y lo persiste. */
function setCart(next: Cart) {
  snapshot = next;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento disponible */
    }
  }
  emit();
}

/** Vuelve a leer lo guardado (por ejemplo tras un cambio en otra pestaña). */
function reloadCart() {
  snapshot = parse(readStorage());
  loaded = true;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_KEY) reloadCart();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((total, quantity) => total + quantity, 0);
}

/**
 * Saca del carrito los productos que ya no existen en el catálogo.
 *
 * Un producto **eliminado** (o pasado a inactivo) deja su id huérfano en `localStorage`: el carrito solo
 * dibuja lo que recorre del catálogo, así que ese ítem no se ve *y tampoco tiene botón para sacarlo*, y
 * quedaba ahí para siempre (además de sumar al contador del header). Se limpia cuando llega el catálogo
 * **real**. Es idempotente y no escribe nada si no hay nada que sacar.
 */
export function pruneCart(validIds: Iterable<string>): void {
  const current = getCart();
  const valid = validIds instanceof Set ? validIds : new Set(validIds);
  const kept = Object.entries(current).filter(([id]) => valid.has(id));
  if (kept.length === Object.keys(current).length) return;
  setCart(Object.fromEntries(kept));
}

/** Carrito compartido: leer y escribir siempre pasa por el store. */
export function useCart() {
  const cart = useSyncExternalStore(subscribe, getCart, () => EMPTY_CART);

  const add = useCallback((id: string, quantity = 1) => {
    const current = getCart();
    setCart({ ...current, [id]: (current[id] ?? 0) + quantity });
  }, []);

  const change = useCallback((id: string, delta: number) => {
    const current = getCart();
    const next = Math.max(0, (current[id] ?? 0) + delta);
    const copy = { ...current };
    if (next === 0) delete copy[id];
    else copy[id] = next;
    setCart(copy);
  }, []);

  const clear = useCallback(() => setCart({}), []);

  return { cart, add, change, clear, count: cartCount(cart) };
}
