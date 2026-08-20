"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";
import { mainnet, bsc, polygon, base } from "viem/chains";

const CDP_PROJECT_ID =
  process.env.NEXT_PUBLIC_COINBASE_PROJECT_ID ?? "09aafa9f-85e4-46f8-a1da-bc60ecee3345";

const cdpConfig = {
  projectId: CDP_PROJECT_ID,
  // EOA wallet created on login (no Smart Wallet / no backup step)
  network: { ethereum: { createOnLogin: "eoa" as const } },
};

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
    <CDPHooksProvider config={cdpConfig}>
      <PrivyProvider
        appId={appId}
        config={{
          appearance: {
            theme: "light",
            accentColor: "#0052FF",
            logo: "/logos/brand-mark.svg",
            landingHeader: "Connect your wallet",
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
          walletConnectCloudProjectId: "64885145ac9a11f78a13e8083472cad7",
        }}
      >
        {children}
      </PrivyProvider>
    </CDPHooksProvider>
  );
}
