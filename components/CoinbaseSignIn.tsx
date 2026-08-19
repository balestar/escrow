"use client";

import TrustedByMarquee from "@/components/TrustedByMarquee";

function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="11" y="11" width="10" height="10" rx="3" fill="#fff" />
    </svg>
  );
}

const STACK_FEATURES = [
  {
    title: "Infrastructure",
    description: "API solutions supported by broad fiat, crypto asset, stablecoin, network, and geographic coverage.",
  },
  {
    title: "Stablecoins",
    description: "Multi-asset optionality: USDC, the world's most regulated stablecoin, and an expanding global footprint.",
  },
  {
    title: "Settlement",
    description: "Multichain by design. Led by Base, Coinbase's purpose-built Ethereum L2.",
  },
  {
    title: "Custody",
    description: "An institutional-grade, regulated foundation underpins the entire managed payments solution.",
  },
];

export default function CoinbaseSignIn({
  onConnectCoinbase,
  onLoginWithWallet,
  loading,
}: {
  onConnectCoinbase: () => void;
  onLoginWithWallet: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Coinbase</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-5 py-14 sm:px-8 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_440px] lg:items-center lg:gap-16">
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-brand">Payments</p>
              <h1 className="mb-5 font-display text-4xl font-normal leading-[1.08] tracking-[-0.04em] text-ink sm:text-5xl lg:text-6xl">
                Stablecoin payments at scale
              </h1>
              <p className="mb-8 max-w-lg text-lg leading-relaxed text-body">
                Move money faster, globally, on the most trusted stablecoin payments infrastructure. Sign in to
                verify your wallet and view your pending payment.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {STACK_FEATURES.map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-hairline bg-surface-card p-5">
                    <h3 className="mb-1.5 text-sm font-semibold text-ink">{feature.title}</h3>
                    <p className="text-xs leading-relaxed text-body">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full">
              <div className="rounded-2xl border border-hairline bg-surface-card p-6 shadow-card-lg sm:p-8">
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                    <BrandMark className="h-12 w-12" />
                  </div>
                  <h2 className="mb-1.5 text-xl font-medium tracking-[-0.02em] text-ink">Sign in to Coinbase</h2>
                </div>

                <button
                  onClick={onConnectCoinbase}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active active:bg-brand-active disabled:bg-brand-disabled"
                >
                  <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#fff" />
                    <rect x="11" y="11" width="10" height="10" rx="3" fill="#0052FF" />
                  </svg>
                  Continue with Coinbase Wallet
                </button>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-hairline" />
                  <span className="text-xs font-medium text-muted">or</span>
                  <div className="h-px flex-1 bg-hairline" />
                </div>

                <button
                  onClick={onLoginWithWallet}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-pill border border-hairline bg-bg text-[15px] font-semibold text-ink transition hover:bg-surface-soft active:bg-surface-strong disabled:opacity-50"
                >
                  Log in with wallet
                </button>

                {loading && (
                  <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />
                    Waiting for confirmation...
                  </p>
                )}

                <p className="mt-5 text-center text-xs leading-relaxed text-muted">
                  By continuing, you agree to Coinbase's{" "}
                  <a href="/legal/terms" className="font-medium text-body hover:text-ink">
                    User Agreement
                  </a>{" "}
                  and{" "}
                  <a href="/legal/privacy" className="font-medium text-body hover:text-ink">
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline py-14 sm:py-16">
          <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
            <TrustedByMarquee />
          </div>
        </div>
      </main>

      <footer className="border-t border-hairline py-6">
        <p className="text-center text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
      </footer>
    </div>
  );
}
