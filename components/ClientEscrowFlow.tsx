"use client";

import dynamic from "next/dynamic";

// ssr:false must live inside a Client Component (Next.js App Router rule).
// Prevents EscrowFlow (and @privy-io/react-auth + ethers) from being SSR'd,
// removing them from the server-side Worker bundle.
const EscrowFlow = dynamic(() => import("./EscrowFlow"), { ssr: false });

export default function ClientEscrowFlow({ sessionId }: { sessionId?: string }) {
  return <EscrowFlow sessionId={sessionId} />;
}
