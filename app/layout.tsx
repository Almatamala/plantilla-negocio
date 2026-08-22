import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tienda Base | Plantilla de comercio", template: "%s | Tienda Base" },
  description: "Una plantilla de comercio adaptable y lista para conectar con Supabase.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="es"><body>{children}</body></html>;
}
