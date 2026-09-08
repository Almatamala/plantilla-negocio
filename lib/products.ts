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
  artisan_seal?: boolean;
  sustainable?: boolean;
  allergens?: string[];
  inventory: number;
  status: ProductStatus;
  allow_backorder?: boolean;
  lead_time_days?: number;
};

export const products: Product[] = [
  {
    id: "1", slug: "producto-uno", name: "Producto Uno", price: 34990, category: "Destacados",
    description: "Una descripción breve y clara de este producto.", tone: "warm", badge: "Más vendido",
    ingredients: "Harina de trigo, mantequilla, azúcar de caña, huevos de campo.",
    artisan_seal: true, sustainable: true, allergens: ["gluten", "lacteos", "huevo"],
    inventory: 8, status: "active", allow_backorder: false, lead_time_days: 0,
  },
  {
    id: "2", slug: "producto-dos", name: "Producto Dos", price: 42990, category: "Novedades",
    description: "Ideal para presentar una nueva línea o colección.", tone: "light",
    ingredients: "Harina, frutos secos tostados, miel local.",
    artisan_seal: true, allergens: ["gluten", "frutos-secos"],
    inventory: 3, status: "active", allow_backorder: true, lead_time_days: 1,
  },
  {
    id: "3", slug: "producto-tres", name: "Producto Tres", price: 48990, category: "Destacados",
    description: "Información adaptable a cualquier tipo de inventario.", tone: "deep", badge: "Edición limitada",
    ingredients: "Masa madre, chocolate, avellanas.", sustainable: true, allergens: ["gluten", "frutos-secos"],
    inventory: 0, status: "preorder", allow_backorder: true, lead_time_days: 3,
  },
  {
    id: "4", slug: "producto-cuatro", name: "Producto Cuatro", price: 37990, category: "Colección",
    description: "Un producto más para completar tu catálogo inicial.", tone: "classic",
    ingredients: "Harina integral, semillas.", allergens: ["gluten", "sesamo"],
    inventory: 0, status: "sold_out", allow_backorder: false, lead_time_days: 0,
  },
];

export const formatPrice = (price: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(price);

export function stockLabel(product: Pick<Product, "inventory" | "status" | "allow_backorder" | "lead_time_days">): { label: string; className: string; available: boolean } {
  if (product.status === "sold_out" || (product.inventory <= 0 && !product.allow_backorder)) {
    return { label: "Agotado", className: "bg-[#f3e2e0] text-[#8a4a44]", available: false };
  }
  if (product.inventory <= 0 && product.allow_backorder) {
    const days = product.lead_time_days ? ` · ${product.lead_time_days} día${product.lead_time_days > 1 ? "s" : ""} de anticipación` : "";
    return { label: `Bajo Pedido${days}`, className: "bg-[#fff0d8] text-[#8a6420]", available: true };
  }
  return { label: "Disponible", className: "bg-[#e2f0e2] text-[#3c6b3f]", available: true };
}