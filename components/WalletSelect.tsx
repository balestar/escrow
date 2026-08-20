"use client";

const WALLETS = [
  {
    id: "metamask",
    name: "MetaMask",
    description: "Available in your browser",
    icon: (
      <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
        <rect width="40" height="40" rx="10" fill="#F6851B" />
        <path d="M32 8L22.4 15.2l1.8-4.4L32 8z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 8l9.5 7.3-1.7-4.5L8 8zM28.8 27.2l-2.6 3.9 5.5 1.5 1.6-5.3-4.5-.1zM6.8 27.3l1.5 5.3 5.5-1.5-2.6-3.9-4.4.1z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 19.2l-1.5 2.3 5.4.2-.2-5.8-3.7 3.3zM26.5 19.2l-3.8-3.4-.2 5.9 5.4-.2-1.4-2.3zM13.8 31.1l3.2-1.6-2.8-2.2-.4 3.8zM23 29.5l3.3 1.6-.5-3.8-2.8 2.2z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26.3 31.1l-3.3-1.6.3 2.2-.1.7 3.1-1.3zM13.8 31.1l3.1 1.3-.1-.7.3-2.2-3.3 1.6z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 25.6l-2.7-.8 1.9-.9.8 1.7zM23 25.6l.8-1.7 2 .9-2.8.8z" fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.8 31.1l.4-3.9-2.9.1 2.5 3.8zM25.8 27.2l.4 3.9 2.5-3.8-2.9-.1zM28.2 21.5l-5.4.2.5 2.8.8-1.7 2 .9 2.1-2.2zM14.3 23.7l2 -.9.8 1.7.5-2.8-5.4-.2 2.1 2.2z" fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.7 21.5l2.3 4.4-.1-2.2-2.2-2.2zM26.2 23.7l-.1 2.2 2.3-4.4-2.2 2.2zM17.2 21.7l-.5 2.8.6 3.2.1-4.2-.2-1.8zM22.8 21.7l-.2 1.8.1 4.2.7-3.2-.6-2.8z" fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 25.6l-.7 3.2.5.3 2.8-2.2.1-2.2L23 25.6zM14.3 24.7l.1 2.2 2.8 2.2.5-.3-.6-3.2-2.8-.9z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.1 32.4l.1-.7-.3-.2H17l-.3.2.1.7-3.1-1.3 1.1.9 2.1 1.5h3.9l2.2-1.5 1.1-.9-3.1 1.3z" fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22.7 29.5l-.5-.3h-3.4l-.5.3-.3 2.2.3-.2H23l.3.2-.6-2.2z" fill="#161616" stroke="#161616" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32.8 15.7l.8-3.8L32 8l-9.3 6.9 3.6 3 5 1.5 1.1-1.3-.5-.3.8-.7-.6-.5.8-.6-.8-.7-.3.3zM6.4 11.9l.8 3.8-.5.4.8.6-.6.5.8.7-.5.3 1.1 1.3 5-1.5 3.6-3L8 8l-1.6 3.9z" fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M31.3 18.4l-5-1.5 1.5 2.3-2.2 4.4 2.9-.1h4.3l-1.5-5.1zM13.7 16.9l-5-1.5-1.5 5.1H11.4l2.9.1-2.3-4.4 2.7.7zM22.8 21.7l-.5-2.8 2.3-.5H15.4l2.2.5-.5 2.8-.2 1.8v4.2l2.6-1.3h2l2.6 1.3.1-4.2-.4-1.8z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    description: "Coinbase Wallet app or extension",
    icon: (
      <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
        <rect width="40" height="40" rx="10" fill="#0052FF" />
        <rect x="11" y="11" width="18" height="18" rx="3" fill="white" />
      </svg>
    ),
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    description: "Scan with any compatible wallet",
    icon: (
      <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
        <rect width="40" height="40" rx="10" fill="#3B99FC" />
        <path d="M12.5 17.5c4.1-4 10.9-4 15 0l.5.5c.2.2.2.5 0 .7l-1.7 1.7c-.1.1-.3.1-.4 0l-.7-.7c-2.9-2.8-7.5-2.8-10.4 0l-.7.7c-.1.1-.3.1-.4 0l-1.7-1.7c-.2-.2-.2-.5 0-.7l.5-.5zm18.5 3.5l1.5 1.5c.2.2.2.5 0 .7l-6.8 6.7c-.2.2-.5.2-.7 0l-4.8-4.7c-.1-.1-.2-.1-.4 0L15 29.9c-.2.2-.5.2-.7 0l-6.8-6.7c-.2-.2-.2-.5 0-.7L9 21c.2-.2.5-.2.7 0l4.8 4.7c.1.1.2.1.4 0l4.8-4.7c.2-.2.5-.2.7 0l4.8 4.7c.1.1.2.1.4 0L30.3 21c.2-.2.5-.2.7 0z" fill="white" />
      </svg>
    ),
  },
  {
    id: "rainbow",
    name: "Rainbow",
    description: "The fun, simple Ethereum wallet",
    icon: (
      <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
        <rect width="40" height="40" rx="10" fill="url(#rbow)" />
        <defs>
          <linearGradient id="rbow" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF6B6B" />
            <stop offset=".33" stopColor="#FFD93D" />
            <stop offset=".66" stopColor="#6BCB77" />
            <stop offset="1" stopColor="#4D96FF" />
          </linearGradient>
        </defs>
        <text x="20" y="27" textAnchor="middle" fontSize="18">🌈</text>
      </svg>
    ),
  },
];

export default function WalletSelect({
  onSelect,
  loading,
}: {
  onSelect: (walletId: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Nav */}
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none">
              <circle cx="16" cy="16" r="16" fill="#0052FF" />
              <rect x="9" y="9" width="14" height="14" rx="2" fill="#fff" />
            </svg>
            <span className="text-[17px] font-semibold tracking-tight text-ink">Coinbase</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Verified badge */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00C087]">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm font-medium text-[#00C087]">Email verified</span>
          </div>

          <div className="rounded-2xl border border-hairline bg-surface-card shadow-card-lg overflow-hidden">
            <div className="px-6 pt-6 pb-4 text-center">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Select your wallet</h2>
              <p className="mt-1.5 text-sm text-body">Connect the wallet you want to use for this payment.</p>
            </div>

            <div className="divide-y divide-hairline border-t border-hairline">
              {WALLETS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onSelect(w.id)}
                  disabled={loading}
                  className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-surface-soft disabled:opacity-50 active:bg-surface-soft"
                >
                  <div className="shrink-0">{w.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{w.name}</p>
                    <p className="text-xs text-muted">{w.description}</p>
                  </div>
                  {loading ? (
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-brand" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            <div className="px-6 py-4 text-center">
              <p className="text-xs leading-relaxed text-muted">
                By connecting, you agree to Coinbase&apos;s{" "}
                <a href="https://coinbase.com/legal/user_agreement" target="_blank" rel="noopener noreferrer" className="font-medium text-body hover:text-ink">
                  User Agreement
                </a>.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-hairline py-5">
        <p className="text-center text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
      </footer>
    </div>
  );
}
