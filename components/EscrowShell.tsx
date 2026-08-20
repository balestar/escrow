"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

function BrandMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="9" y="9" width="14" height="14" rx="2" fill="#fff" />
    </svg>
  );
}

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function EscrowShell({
  children,
  connectSlot,
}: {
  children: React.ReactNode;
  /** Optional custom button node from the inner flow (e.g. to trigger Privy login with its own handler). */
  connectSlot?: React.ReactNode;
}) {
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-ink">
      <header className="sticky top-0 z-50 border-b border-hairline bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[17px] font-semibold tracking-tight">Coinbase</span>
          </div>

          <div className="flex items-center gap-3">
            {authenticated && address ? (
              <button
                onClick={() => logout()}
                className="flex h-10 items-center gap-2 rounded-pill border border-hairline bg-bg px-4 text-sm font-medium text-ink transition hover:bg-surface-soft"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                {short(address)}
              </button>
            ) : (
              connectSlot ?? (
                <div className="h-10 rounded-pill bg-brand-disabled px-5 text-sm font-semibold text-on-brand/80" />
              )
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-hairline bg-bg">
        <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-muted">
              <a href="/how-it-works" className="transition hover:text-ink">How it works</a>
              <a href="/legal/terms" className="transition hover:text-ink">User Agreement</a>
              <a href="/legal/privacy" className="transition hover:text-ink">Privacy Policy</a>
              <a href="/how-it-works#support" className="transition hover:text-ink">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
