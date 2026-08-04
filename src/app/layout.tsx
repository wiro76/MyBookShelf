import type { Metadata } from "next";
import "./globals.css";
import { requireRuntimeEnvironment } from "@/shared/config/environment";

export const metadata: Metadata = {
  title: "My BookShelf",
  description: "Ta bibliothèque personnelle, calme et fidèle à tes livres.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireRuntimeEnvironment();
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
