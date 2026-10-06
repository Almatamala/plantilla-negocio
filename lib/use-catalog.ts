"use client";

import { useEffect, useState } from "react";
import { pruneCart } from "@/lib/cart";
import { fetchCatalog } from "@/lib/catalog";
import { products as demoProducts, type Product } from "@/lib/products";
import { loadResource } from "@/lib/resource";

/**
 * Catálogo de la tienda (productos + categorías) con **una sola lectura compartida**.
 *
 * La tienda, la ficha y el checkout pedían el catálogo por su cuenta; ahora los tres comparten la misma
 * lectura (`loadResource("catalog")`), así que navegar de la carta a una ficha no vuelve a pedirlo y dos
 * componentes que lo necesitan a la vez hacen una única petición. El respaldo de la última versión
 * conocida sigue viniendo de `lib/offline-cache.ts` (D20).
 *
 * Mientras la API responde se muestran los productos de partida (los demo de la plantilla) y `offline`
 * queda en `false`; si la API no responde, `offline` pasa a `true` (el checkout lo usa para bloquear el
 * pedido y la tienda para no ofrecer un catálogo que no es el suyo).
 *
 * Además, al llegar el catálogo real se **purgan del carrito** los productos que ya no existen (producto
 * eliminado o inactivo): es la única señal de que la lista que tenemos es la de la tienda, así que acá es
 * donde ese ítem huérfano —que no se podía ver ni sacar— deja de existir.
 */
/**
 * Puerta única del catálogo compartido: pide la lectura (`loadResource("catalog")`) y **purga del carrito**
 * los ids que ya no existen (D52). La usan el hook de la tienda y la **ficha de producto**, así que el ítem
 * huérfano se limpia en cuanto **cualquier** pantalla conoce el catálogo de la tienda, sin repetir la regla.
 */
async function readCatalog(): Promise<{ catalog: Product[] | null; offline: boolean }> {
  const { value, stale } = await loadResource("catalog", fetchCatalog);
  // `value` es siempre la lista **de la tienda** (la API o, si no respondió, la última versión conocida del
  // respaldo), nunca los productos demo: por eso con cualquier respuesta se pueden descartar los ids
  // huérfanos del carrito (un producto eliminado o inactivo, que no se podía ni ver ni sacar). Sin datos
  // —primera visita con la API caída— no se toca nada: la lista demo borraría ítems válidos.
  if (value) pruneCart(value.map((product) => product.id));
  return { catalog: value, offline: stale };
}

/** Catálogo compartido para las pantallas que solo necesitan la lista (la **ficha de producto**). */
export async function loadCatalog(): Promise<Product[] | null> {
  return (await readCatalog()).catalog;
}

export function useCatalog(initial: Product[] = demoProducts): { catalog: Product[]; offline: boolean } {
  const [catalog, setCatalog] = useState<Product[]>(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    void readCatalog().then(({ catalog: value, offline: stale }) => {
      if (!active) return;
      setOffline(stale);
      // Una tienda **sin productos activos** deja la vitrina como está (los demo de la plantilla) pero el
      // carrito ya quedó purgado: todos sus ítems eran de productos que ya no existen.
      if (value?.length) setCatalog(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return { catalog, offline };
}
