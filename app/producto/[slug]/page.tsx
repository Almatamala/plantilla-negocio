import { ProductDetail } from "@/components/product-detail";

export const metadata = { title: "Producto" };

export default async function ProductoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetail slug={slug} />;
}