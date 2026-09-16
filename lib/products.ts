export type ProductStatus = "draft" | "active" | "sold_out" | "preorder";

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
  allow_backorder?: boolean;
};

export const products: Product[] = [
  {
    id: "1", slug: "producto-uno", name: "Producto Uno", price: 34990, category: "Destacados",
    description: "Una descripción breve y clara de este producto.", tone: "warm", badge: "Más vendido",
    ingredients: "Harina de trigo, mantequilla, azúcar de caña, huevos de campo.",
    allergens: ["gluten", "lacteos", "huevo"],
    inventory: 8, status: "active", allow_backorder: false,
  },
  {
    id: "2", slug: "producto-dos", name: "Producto Dos", price: 42990, category: "Novedades",
    description: "Ideal para presentar una nueva línea o colección.", tone: "light",
    ingredients: "Harina, frutos secos tostados, miel local.",
    allergens: ["gluten", "frutos-secos"],
    inventory: 3, status: "active", allow_backorder: true,
  },
  {
    id: "3", slug: "producto-tres", name: "Producto Tres", price: 48990, category: "Destacados",
    description: "Información adaptable a cualquier tipo de inventario.", tone: "deep", badge: "Edición limitada",
    ingredients: "Masa madre, chocolate, avellanas.", allergens: ["gluten", "frutos-secos"],
    inventory: 0, status: "preorder", allow_backorder: true,
  },
  {
    id: "4", slug: "producto-cuatro", name: "Producto Cuatro", price: 37990, category: "Colección",
    description: "Un producto más para completar tu catálogo inicial.", tone: "classic",
    ingredients: "Harina integral, semillas.", allergens: ["gluten", "sesamo"],
    inventory: 0, status: "sold_out", allow_backorder: false,
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
  allow_backorder: boolean;
  images: string[];
  image_url: string | null;
  ingredients?: string | null;
  allergens: string[];
  category_id: string | null;
};

export const productTones = ["warm", "light", "deep", "classic"] as const;

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
    allow_backorder: row.allow_backorder ?? false,
  };
}

export const formatPrice = (price: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(price);

export function stockLabel(product: Pick<Product, "inventory" | "status" | "allow_backorder">): { label: string; className: string; available: boolean } {
  if (product.status === "sold_out" || (product.inventory <= 0 && !product.allow_backorder)) {
    return { label: "Agotado", className: "bg-[#f3e2e0] text-[#8a4a44]", available: false };
  }
  if (product.inventory <= 0 && product.allow_backorder) {
    return { label: "Bajo Pedido", className: "bg-[#fff0d8] text-[#8a6420]", available: true };
  }
  return { label: "Disponible", className: "bg-[#e2f0e2] text-[#3c6b3f]", available: true };
}
