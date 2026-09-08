import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tienda Base | Plantilla de comercio", template: "%s | Tienda Base" },
  description: "Tienda de panadería artesanal con pedidos agendados, conectada a la API dockerizada.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="es"><body>{children}</body></html>;
}
