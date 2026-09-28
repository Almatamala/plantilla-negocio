import { apiFetch } from "@/lib/api";
import { mapApiProduct, type ApiProduct, type Product } from "@/lib/products";

/**
 * Lectura del catálogo: productos + categorías.
 *
 * La tienda, la ficha y el checkout pedían los dos listados por su cuenta y cada uno armaba el mapa de
 * categorías a mano (y el checkout además las omitía, así que todos sus productos caían a
 * «Productos»). Acá queda una sola forma de pedirlos y de resolver el nombre de la categoría.
 */

/** Categoría mínima para resolver el nombre de un producto. */
export type CategoryOption = { id: string; name: string };

/** Producto del panel: además del modelo de la tienda, conserva el id de su categoría para editarlo. */
export type AdminProduct = Product & { category_id: string | null };

/** Nombre de categoría por id, para `mapApiProduct`. */
export function categoryNames(categories: CategoryOption[]): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

/** Catálogo público (`GET /api/products`): solo los productos activos, con su categoría resuelta. */
export async function fetchCatalog(): Promise<Product[]> {
  const [rows, categories] = await Promise.all([
    apiFetch<ApiProduct[]>("/api/products"),
    apiFetch<CategoryOption[]>("/api/categories"),
  ]);
  const names = categoryNames(categories);
  return rows.map((row, index) => mapApiProduct(row, index, names));
}

/**
 * Catálogo del panel (`?include_inactive=true`): incluye los inactivos y conserva el id de la categoría.
 * Cuando un producto no tiene categoría el panel muestra «Sin categoría» (la tienda usa «Productos»).
 */
export function mapAdminProducts(rows: ApiProduct[], categories: CategoryOption[]): AdminProduct[] {
  const names = categoryNames(categories);
  return rows.map((row, index) => ({
    ...mapApiProduct(row, index, names),
    category: names.get(row.category_id ?? "") ?? "Sin categoría",
    category_id: row.category_id ?? null,
  }));
}
