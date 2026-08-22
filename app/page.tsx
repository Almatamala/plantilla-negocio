import { Storefront } from "@/components/storefront";
import { products } from "@/lib/products";

export default function Home() {
  return <Storefront products={products} />;
}
