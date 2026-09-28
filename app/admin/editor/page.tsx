import { StorefrontEditor } from "@/components/storefront-editor";
import { products } from "@/lib/products";

/**
 * Editor visual de la página (D38). Vive bajo `/admin`, así que `proxy.ts` ya exige sesión de rol admin.
 * Muestra el storefront real con los textos de `store_settings` editables al hacer clic.
 */
export default function AdminEditorPage() {
  return <StorefrontEditor products={products}/>;
}
