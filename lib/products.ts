/** Solo dos estados: `active` (visible en la tienda) e `inactive` (oculto en la tienda, visible en el panel). */
export type ProductStatus = "active" | "inactive";

export type Product = {
  id: string;
  slug: string;
  name: string;
  price: number;
  category: string;
  description: string;
  tone: "warm" | "deep" | "light" | "classic";
  badge?: string;
  images?: string[];
  image_url?: string | null;
  ingredients?: string;
  allergens?: string[];
  inventory: number;
  status: ProductStatus;
  /** Días de preparación antes de poder retirar el pedido (D35). */
  preparation_days: number;
};

export const products: Product[] = [
  {
    id: "1", slug: "producto-uno", name: "Producto Uno", price: 34990, category: "Destacados",
    description: "Una descripción breve y clara de este producto.", tone: "warm", badge: "Más vendido",
    ingredients: "Harina de trigo, mantequilla, azúcar de caña, huevos de campo.",
    allergens: ["gluten", "lacteos", "huevo"],
    inventory: 8, status: "active", preparation_days: 1,
  },
  {
    id: "2", slug: "producto-dos", name: "Producto Dos", price: 42990, category: "Novedades",
    description: "Ideal para presentar una nueva línea o colección.", tone: "light",
    ingredients: "Harina, frutos secos tostados, miel local.",
    allergens: ["gluten", "frutos-secos"],
    inventory: 3, status: "active", preparation_days: 2,
  },
  {
    id: "3", slug: "producto-tres", name: "Producto Tres", price: 48990, category: "Destacados",
    description: "Información adaptable a cualquier tipo de inventario.", tone: "deep", badge: "Edición limitada",
    ingredients: "Masa madre, chocolate, avellanas.", allergens: ["gluten", "frutos-secos"],
    inventory: 0, status: "active", preparation_days: 3,
  },
  {
    id: "4", slug: "producto-cuatro", name: "Producto Cuatro", price: 37990, category: "Colección",
    description: "Un producto más para completar tu catálogo inicial.", tone: "classic",
    ingredients: "Harina integral, semillas.", allergens: ["gluten", "sesamo"],
    inventory: 0, status: "active", preparation_days: 2,
  },
];

/** Producto tal como lo devuelve la API (`/api/products`). */
export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  description: string | null;
  status: ProductStatus;
  inventory: number;
  preparation_days: number;
  images: string[];
  image_url: string | null;
  ingredients?: string | null;
  allergens: string[];
  category_id: string | null;
};

const productTones = ["warm", "light", "deep", "classic"] as const;

/** Normaliza un producto de la API al modelo que usan las pantallas. */
export function mapApiProduct(row: ApiProduct, index: number, categories: Map<string, string> = new Map()): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: row.price,
    category: categories.get(row.category_id ?? "") ?? "Productos",
    tone: productTones[index % productTones.length],
    description: row.description ?? "",
    images: row.images ?? [],
    image_url: row.image_url,
    ingredients: row.ingredients ?? undefined,
    allergens: row.allergens ?? [],
    status: row.status,
    inventory: row.inventory,
    preparation_days: row.preparation_days ?? 0,
  };
}

export const formatPrice = (price: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(price);
