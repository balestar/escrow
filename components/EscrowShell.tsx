"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

function BrandMark({ className = "h-5 w-5 sm:h-6 sm:w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-label="Coinbase">
      <circle cx="28" cy="28" r="28" fill="#0052FF" />
      <rect x="13.125" y="13.125" width="29.75" height="29.75" fill="#fff" />
    </svg>
  );
}

function short(addr: string, lead = 6, tail = 4) {
  return `${addr.slice(0, lead)}...${addr.slice(-tail)}`;
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
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <div className="flex items-center gap-2">
            <BrandMark className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-[15px] font-semibold tracking-tight sm:text-[17px]">Coinbase</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {authenticated && address ? (
              <button
                onClick={() => logout()}
                className="flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-bg px-3 text-xs font-medium text-ink transition hover:bg-surface-soft sm:h-10 sm:px-4 sm:text-sm"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                <span className="hidden xs:inline">{short(address)}</span>
                <span className="xs:hidden">{short(address, 4, 3)}</span>
              </button>
            ) : (
              connectSlot ?? null
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-hairline bg-bg">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted sm:gap-4">
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
