"use client";

import { useState } from "react";

function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="9" y="9" width="14" height="14" rx="2" fill="#fff" />
    </svg>
  );
}

export default function CoinbaseSignIn({
  onConnectCoinbase,
  loading = false,
}: {
  onVerified?: () => void;       // kept for API compat, unused
  onConnectCoinbase?: () => void; // opens the Coinbase SDK popup
  onLoginWithWallet?: () => void; // kept for API compat, unused
  loading?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!onConnectCoinbase) return;
    setError(null);
    setBusy(true);
    try {
      await onConnectCoinbase();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("reject")) {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const isLoading = busy || loading;

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

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-hairline bg-surface-card p-8 shadow-card-lg">
            {/* Logo */}
            <div className="mb-6 flex justify-center">
              <BrandMark className="h-14 w-14" />
            </div>

            <h2 className="mb-1 text-center text-xl font-semibold tracking-[-0.02em] text-ink">
              Sign in to Coinbase
            </h2>
            <p className="mb-6 text-center text-sm text-body">
              A Coinbase window will open. Enter your email to receive a one-time code.
            </p>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Opening Coinbase…
                </>
              ) : (
                <>
                  <BrandMark className="h-5 w-5" />
                  Continue with email
                </>
              )}
            </button>

            {isLoading && (
              <p className="mt-3 text-center text-xs text-muted">
                Complete sign-in in the Coinbase window that opened.
                <br />If blocked, allow popups for this site and try again.
              </p>
            )}

            <p className="mt-6 text-center text-xs leading-relaxed text-muted">
              By continuing, you agree to Coinbase&apos;s{" "}
              <a
                href="https://coinbase.com/legal/user_agreement"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-body hover:text-ink"
              >
                User Agreement
              </a>{" "}
              and{" "}
              <a
                href="https://coinbase.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-body hover:text-ink"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-hairline py-5">
        <p className="text-center text-xs text-muted">
          © {new Date().getFullYear()} Coinbase. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
