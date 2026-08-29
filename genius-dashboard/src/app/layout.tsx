import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGOS GENIUS — Executive Project Dashboard",
  description:
    "Painel executivo de projetos, JVs e inovações do ecossistema TaxCo — Módulo Genius do Argos Core.",
};

export const viewport: Viewport = {
  themeColor: "#0B0F17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter é carregada em runtime (e não via next/font) para que o build
            funcione offline; a stack de sistema cobre o fallback. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
