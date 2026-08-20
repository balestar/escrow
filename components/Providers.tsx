"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { mainnet, bsc, polygon, base } from "viem/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-red-400">
          Missing <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code>. Add it to your
          environment and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#0052FF",
          logo: "/logos/brand-mark.svg",
          landingHeader: "Connect to USDC Pay",
          loginMessage: "Select your wallet to continue.",
          showWalletLoginFirst: true,
          walletList: [
            "coinbase_wallet",
            "metamask",
            "rainbow",
            "zerion",
            "okx_wallet",
            "wallet_connect",
          ],
          walletChainType: "ethereum-only",
        },
        loginMethods: ["wallet"],
        supportedChains: [mainnet, bsc, polygon, base],
        defaultChain: mainnet,
      }}
    >
      {children}
    </PrivyProvider>
  );
}
