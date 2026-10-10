import type { Product } from "@/lib/products";

/**
 * Búsqueda de productos (D55): una sola regla, compartida por el **autocompletado** de la carta y por el
 * **filtro de la grilla**.
 *
 * El texto se normaliza **sin tildes ni mayúsculas** («piña» y «PINA» buscan lo mismo, que en Chile se
 * agradece al escribir rápido) y se compara contra el contenido que un cliente usaría para encontrar un
 * producto: nombre, categoría, descripción e ingredientes. Al vivir en un solo lugar, una sugerencia del
 * autocompletado **siempre** deja un resultado en la grilla: no puede ofrecer algo que el filtro después
 * no muestre.
 */

/** Normaliza un texto para comparar: sin tildes, en minúsculas y sin espacios en los bordes. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Todo el contenido de un producto que la búsqueda considera. */
function searchableText(product: Product): string {
  return normalizeSearch(
    [product.name, product.category, product.description, product.ingredients].filter(Boolean).join(" "),
  );
}

/** ¿El producto coincide con la consulta? Sin consulta, todo coincide. */
export function matchesProduct(product: Product, query: string): boolean {
  const term = normalizeSearch(query);
  if (!term) return true;
  return searchableText(product).includes(term);
}

/**
 * Sugerencias del autocompletado: los primeros `limit` productos que coinciden con la consulta.
 * Sin consulta devuelve una lista vacía (no tiene sentido sugerir «todo» al abrir el buscador).
 */
export function suggestProducts(products: Product[], query: string, limit = 6): Product[] {
  const term = normalizeSearch(query);
  if (!term) return [];
  return products.filter((product) => searchableText(product).includes(term)).slice(0, limit);
}

/**
 * Filtros **combinables** de la carta (D56): se aplican todos a la vez (AND) y cualquiera puede quedar
 * fuera.
 */
export type ProductFilters = {
  query?: string;
  /** Categoría exacta; vacío = todas. */
  category?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
};

/** Aplica los filtros de la carta y devuelve los productos que sobreviven a todos. */
export function filterProducts(products: Product[], filters: ProductFilters = {}): Product[] {
  const { query = "", category = "", minPrice = null, maxPrice = null } = filters;
  return products.filter((product) => {
    if (category && product.category !== category) return false;
    if (!matchesProduct(product, query)) return false;
    if (minPrice != null && product.price < minPrice) return false;
    if (maxPrice != null && product.price > maxPrice) return false;
    return true;
  });
}

/** Extremos de precio del catálogo, para los límites del rango (sin productos, un rango vacío). */
export function priceBounds(products: Product[]): [number, number] {
  if (products.length === 0) return [0, 0];
  const prices = products.map((product) => product.price);
  return [Math.min(...prices), Math.max(...prices)];
}
