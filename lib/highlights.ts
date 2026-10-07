"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { mapApiProduct, type ApiProduct, type Product } from "@/lib/products";
import { loadResource } from "@/lib/resource";

/**
 * Destacados de la vitrina (D54): los **cuatro productos más recientes** y los **cuatro más vendidos**, que
 * son los dos grupos que muestra la sección que reemplazó a las tarjetas de beneficios.
 *
 * Los calcula la **API** (`GET /api/products/highlights`, D7/D54) porque las ventas salen de los pedidos:
 * el navegador tendría que bajarse el historial completo para sumarlas, que es justo lo que se quitó de
 * Reportes (D42). Acá queda el espejo del contrato y la lectura, con el mismo criterio que el resto de las
 * pantallas: lectura **compartida** por clave (D41) y, si la API no responde, la última versión conocida
 * (D20).
 */

/**
 * Cuántos productos muestra cada grupo (D54): cuatro recientes y cuatro más vendidos. Es el mismo tope que
 * aplica la API (`HIGHLIGHTS_PER_GROUP` en `backend/app/main.py`), y acá se usa para repartir el respaldo.
 */
export const HIGHLIGHTS_PER_GROUP = 4;

/** Producto tal como lo devuelve la API (`/api/products`); es el mismo de la vitrina. */
export type ApiHighlights = {
  new: ApiProduct[];
  best_sellers: ApiProduct[];
};

/** Los dos grupos ya normalizados al modelo que usan las pantallas. */
export type Highlights = {
  /** Los cuatro más recientes, del más nuevo al más antiguo. */
  recent: Product[];
  /** Los cuatro más vendidos, del que más unidades sumó al que menos. */
  bestSellers: Product[];
};

/**
 * Pide los dos grupos y los normaliza. Los productos **no traen su categoría**, pero acá no se dibuja (la
 * tarjeta muestra foto, nombre y precio), así que se mapean sin el mapa de categorías.
 */
async function fetchHighlights(): Promise<Highlights> {
  const data = await apiFetch<ApiHighlights>("/api/products/highlights");
  return {
    recent: data.new.map((row, index) => mapApiProduct(row, index)),
    bestSellers: data.best_sellers.map((row, index) => mapApiProduct(row, index)),
  };
}

/**
 * Grupos de respaldo mientras la API no responde y no hay nada guardado: los productos que la pantalla ya
 * tiene (el catálogo de la tienda, o los demo de la plantilla) partidos en dos, así la sección nunca queda
 * vacía en una instalación nueva. Con catálogo de sobra son **cuatro y cuatro** (el tope del grupo, D54);
 * con un catálogo corto —los cuatro demo de la plantilla, por ejemplo— se reparte mitad y mitad, para que
 * igual haya dos grupos y el título alcance a cambiar.
 */
function fallbackGroups(list: Product[]): Highlights {
  const half = Math.ceil(Math.min(list.length, HIGHLIGHTS_PER_GROUP * 2) / 2);
  return { recent: list.slice(0, half), bestSellers: list.slice(half, half * 2) };
}

/**
 * Destacados de la vitrina. `fallback` es el catálogo que la pantalla ya cargó: mientras el endpoint no
 * responda —y no haya respaldo— la sección muestra esos productos en lugar de quedarse en blanco.
 */
export function useHighlights(fallback: Product[] = []): Highlights {
  const [loaded, setLoaded] = useState<Highlights | null>(null);

  useEffect(() => {
    let active = true;
    void loadResource("highlights", fetchHighlights).then(({ value }) => {
      if (active && value) setLoaded(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return loaded ?? fallbackGroups(fallback);
}
