import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Escrow | Secure Crypto Custody",
  description: "Professional escrow service with verified on-chain approvals",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-coinbase-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
