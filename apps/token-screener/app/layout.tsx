import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApeScreener — live tokens on Robinhood Chain",
  description: "ApeScreener is a live token screener for ape.store launches on Robinhood Chain.",
  openGraph: {
    title: "ApeScreener — live tokens on Robinhood Chain",
    description: "ApeScreener is a live token screener for ape.store launches on Robinhood Chain.",
    siteName: "ApeScreener",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ApeScreener — live tokens on Robinhood Chain",
    description: "ApeScreener is a live token screener for ape.store launches on Robinhood Chain.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-canvas font-display antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
