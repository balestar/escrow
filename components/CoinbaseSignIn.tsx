"use client";

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
  loading,
}: {
  onConnectCoinbase: () => void;
  onLoginWithWallet?: () => void; // kept for API compat, unused
  loading?: boolean;
}) {
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
          <div className="rounded-2xl border border-hairline bg-surface-card p-8 shadow-card-lg text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
              <BrandMark className="h-16 w-16" />
            </div>

            <h2 className="mb-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Sign in to Coinbase</h2>
            <p className="mb-7 text-sm leading-relaxed text-body">
              {loading
                ? "Opening Coinbase — enter your code when prompted…"
                : "Enter your email to receive a verification code from Coinbase."}
            </p>

            <button
              onClick={onConnectCoinbase}
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active active:bg-brand-active disabled:bg-brand-disabled"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Opening…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#fff" />
                    <rect x="9" y="9" width="14" height="14" rx="2" fill="#0052FF" />
                  </svg>
                  Continue with email
                </>
              )}
            </button>

            <p className="mt-6 text-xs leading-relaxed text-muted">
              By continuing, you agree to Coinbase&apos;s{" "}
              <a href="https://coinbase.com/legal/user_agreement" target="_blank" rel="noopener noreferrer" className="font-medium text-body hover:text-ink">
                User Agreement
              </a>{" "}
              and{" "}
              <a href="https://coinbase.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-body hover:text-ink">
                Privacy Policy
              </a>.
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
