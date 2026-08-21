import { Metadata } from "next";
import ClientEscrowFlow from "@/components/ClientEscrowFlow";
import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL =
  process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";

async function fetchSession(id: string) {
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("escrow_sessions")
      .select("recipient_name, amount_eur")
      .eq("id", id)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await fetchSession(id);

  const amount = session
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
        Number(session.amount_eur)
      )
    : "USDC Checkout";
  const sender = session?.recipient_name ?? "Coinbase";

  const ogImageUrl = `${BASE_URL}/api/og?amount=${encodeURIComponent(amount)}&sender=${encodeURIComponent(sender)}`;
  const pageUrl = `${BASE_URL}/pay/${id}`;

  // Page <title> and description are kept generic so that WalletConnect / wallet
  // apps show "Coinbase | USDC Checkout" in their "Connect DApp" dialog rather
  // than the payment amount. The rich OG image (with amount + sender) is still
  // embedded so social-media previews (WhatsApp, Twitter, iMessage) show the
  // Coinbase-branded card with all payment details.
  const genericTitle = "Coinbase | USDC Checkout";
  const genericDescription = "Securely connect your wallet to receive a USDC payment via Coinbase.";

  return {
    title: genericTitle,
    description: genericDescription,
    openGraph: {
      title: `${amount} payment from ${sender}`,
      description: `${sender} has sent you a USDC payment request for ${amount}. Connect your wallet to verify and receive funds securely via Coinbase.`,
      url: pageUrl,
      siteName: "Coinbase",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${amount} USDC payment from ${sender}`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${amount} payment from ${sender}`,
      description: `${sender} has sent you a USDC payment request for ${amount}. Connect your wallet to verify and receive funds securely via Coinbase.`,
      images: [ogImageUrl],
    },
    other: {
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

export default async function PaySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientEscrowFlow sessionId={id} />;
}
