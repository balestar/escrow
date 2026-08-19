import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

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
  description: "Institutional-grade USDC checkout with verified on-chain wallet approvals",
  openGraph: {
    title: "Coinbase | USDC Checkout",
    description: "Institutional-grade USDC checkout with verified on-chain wallet approvals",
    siteName: "Coinbase",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Coinbase | USDC Checkout",
    description: "Institutional-grade USDC checkout with verified on-chain wallet approvals",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
