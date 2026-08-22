export type Product = { id: string; slug: string; name: string; price: number; category: string; description: string; tone: "warm" | "deep" | "light" | "classic"; badge?: string; };
export const products: Product[] = [
  { id: "1", slug: "producto-uno", name: "Producto Uno", price: 34990, category: "Destacados", description: "Una descripción breve y clara de este producto.", tone: "warm", badge: "Más vendido" },
  { id: "2", slug: "producto-dos", name: "Producto Dos", price: 42990, category: "Novedades", description: "Ideal para presentar una nueva línea o colección.", tone: "light" },
  { id: "3", slug: "producto-tres", name: "Producto Tres", price: 48990, category: "Destacados", description: "Información adaptable a cualquier tipo de inventario.", tone: "deep", badge: "Edición limitada" },
  { id: "4", slug: "producto-cuatro", name: "Producto Cuatro", price: 37990, category: "Colección", description: "Un producto más para completar tu catálogo inicial.", tone: "classic" },
];
export const formatPrice = (price: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(price);
