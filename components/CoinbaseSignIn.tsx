"use client";

import { useEffect, useState } from "react";

function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="11" y="11" width="10" height="10" rx="3" fill="#fff" />
    </svg>
  );
}

export default function CoinbaseSignIn({
  onConnectCoinbase,
  onLoginWithWallet,
  loading,
}: {
  onConnectCoinbase: () => void;
  onLoginWithWallet: () => void;
  loading?: boolean;
}) {
  // After a short delay, reveal the fallback buttons in case the OAuth
  // popup was blocked by the browser. The auto-redirect fires in EscrowFlow
  // via useEffect — this screen is just what the user sees while waiting.
  const [showFallback, setShowFallback] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowFallback(true), 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Nav */}
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Coinbase</span>
          </div>
        </div>
      </header>

      {/* Centered sign-in card */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-hairline bg-surface-card p-8 shadow-card-lg text-center">
            {/* Logo */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
              <BrandMark className="h-16 w-16" />
            </div>

            <h2 className="mb-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Sign in to Coinbase</h2>
            <p className="mb-7 text-sm leading-relaxed text-body">
              {loading
                ? "Connecting to Coinbase…"
                : showFallback
                ? "If the sign-in window didn't open, use the options below."
                : "Redirecting you to Coinbase to complete sign-in…"}
            </p>

            {/* Redirect indicator */}
            {!showFallback && (
              <div className="mb-6 flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="text-xs text-muted">Opening Coinbase sign-in…</p>
              </div>
            )}

            {/* Fallback buttons — shown if popup/redirect was blocked */}
            {showFallback && (
              <div className="space-y-3">
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

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-hairline" />
                  <span className="text-xs font-medium text-muted">or</span>
                  <div className="h-px flex-1 bg-hairline" />
                </div>

                <button
                  onClick={onLoginWithWallet}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-pill border border-hairline bg-bg text-[15px] font-semibold text-ink transition hover:bg-surface-soft disabled:opacity-50"
                >
                  Log in with wallet
                </button>
              </div>
            )}

            {loading && showFallback && (
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />
                Waiting for confirmation…
              </p>
            )}

            <p className="mt-6 text-xs leading-relaxed text-muted">
              By continuing, you agree to Coinbase&apos;s{" "}
              <a href="/legal/terms" className="font-medium text-body hover:text-ink">User Agreement</a>{" "}
              and{" "}
              <a href="/legal/privacy" className="font-medium text-body hover:text-ink">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-hairline py-5">
        <p className="text-center text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
      </footer>
    </div>
  );
}
