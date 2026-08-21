"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

function BrandMark({ className = "h-5 w-5 sm:h-6 sm:w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-label="Coinbase">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="7.5" y="7.5" width="17" height="17" fill="#fff" />
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
  connectSlot?: React.ReactNode;
}) {
  const { ready, authenticated, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

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
              <div className="relative" ref={menuRef}>
                {/* Wallet pill button */}
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-bg px-3 text-xs font-medium text-ink transition hover:bg-surface-soft sm:h-10 sm:px-4 sm:text-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-up" />
                  <span className="hidden xs:inline">{short(address)}</span>
                  <span className="xs:hidden">{short(address, 4, 3)}</span>
                  <svg
                    className={`ml-0.5 h-3 w-3 text-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {menuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-hairline bg-white shadow-lg">
                    {/* Address row */}
                    <div className="border-b border-hairline px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Connected</p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink">{short(address, 8, 6)}</p>
                    </div>
                    {/* Sign out */}
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-medium text-down transition hover:bg-surface-soft"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
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
