import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mon Étagère — Bibliothèque de mangas",
  description: "Rangez vos mangas, suivez vos séries et retrouvez les livres qui vous sont chers.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Mon Étagère",
    description: "Votre collection, à votre façon.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mon Étagère",
    description: "Votre collection, à votre façon.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
