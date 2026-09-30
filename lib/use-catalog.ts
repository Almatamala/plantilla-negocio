"use client";

import { useEffect, useState } from "react";
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
 */
export function useCatalog(initial: Product[] = demoProducts): { catalog: Product[]; offline: boolean } {
  const [catalog, setCatalog] = useState<Product[]>(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    void loadResource("catalog", fetchCatalog).then(({ value, stale }) => {
      if (!active) return;
      if (value?.length) setCatalog(value);
      setOffline(stale);
    });
    return () => {
      active = false;
    };
  }, []);

  return { catalog, offline };
}
