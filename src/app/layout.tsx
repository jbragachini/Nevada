import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navidad con Nevada 2026 · Entradas",
  description: "Comprá tus entradas para Navidad con Nevada 2026 — Nevada Producciones.",
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
