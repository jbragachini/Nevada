import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";

const SITIO = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: "Nevada Producciones · Entradas",
  description: "Entradas online para los eventos de Nevada Producciones — Oncativo, Córdoba.",
  applicationName: "Nevada Producciones",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Nevada Producciones",
    images: [{ url: "/portadas/a-escritorio.jpg", width: 1920, height: 1200, alt: "Nevada Producciones" }],
  },
  twitter: { card: "summary_large_image", images: ["/portadas/a-escritorio.jpg"] },
};

export const viewport: Viewport = {
  themeColor: "#061a36",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
