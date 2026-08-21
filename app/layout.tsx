import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import ClientProviders from "@/components/ClientProviders";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Coinbase | USDC Checkout",
  description: "Securely connect your wallet to receive a USDC payment via Coinbase.",
  icons: {
    icon: [
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/icon?v=3", sizes: "64x64", type: "image/png" },
    ],
    shortcut: "/favicon.svg?v=3",
    apple: "/icon?v=3",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0052FF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Tells the Coinbase Base SDK what COOP policy this page uses so it
            can correctly pass the value through to the Smart Wallet popup.
            Must match the header set in middleware.ts. */}
        <meta name="cross-origin-opener-policy" content="same-origin-allow-popups" />
      </head>
      <body className="bg-bg font-sans antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
