"use client";

import dynamic from "next/dynamic";

// ssr:false must live inside a Client Component (Next.js App Router rule).
// This tiny wrapper keeps @privy-io/react-auth and its heavy transitive deps
// (WalletConnect, viem-all-chains, MetaMask SDK) out of the server bundle.
const Providers = dynamic(() => import("./Providers"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
