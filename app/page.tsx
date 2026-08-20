import Link from "next/link";

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9" fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="9" y="9" width="14" height="14" rx="2" fill="#fff" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: <ShieldIcon />,
    title: "Institutional-grade security",
    desc: "Every checkout is backed by Coinbase's regulated custody infrastructure.",
  },
  {
    icon: <BoltIcon />,
    title: "Real-time settlement",
    desc: "USDC transfers settle instantly across Ethereum, BNB Chain, Polygon, and Base.",
  },
  {
    icon: <GlobeIcon />,
    title: "Multichain by design",
    desc: "One checkout link. Any wallet. Any supported chain. No network switching needed.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-ink">
      {/* ── Header ── */}
      <header className="border-b border-hairline bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center px-4 sm:h-16 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[17px] font-semibold tracking-tight">Coinbase</span>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex flex-1 flex-col">
        <section className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center sm:py-32">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand shadow-lg shadow-brand/20">
            <svg viewBox="0 0 32 32" className="h-10 w-10" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="3" fill="#fff" />
            </svg>
          </div>

          <h1 className="mb-4 max-w-xl font-display text-4xl font-normal leading-[1.08] tracking-[-0.04em] text-ink sm:text-5xl">
            USDC Checkout
          </h1>
          <p className="mb-10 max-w-md text-base leading-relaxed text-body sm:text-lg">
            Secure, multichain stablecoin payments powered by Coinbase infrastructure.
            You need a payment link from your sender to continue.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="flex items-center gap-2.5 rounded-pill border border-hairline bg-surface-card px-5 py-3 text-sm text-body shadow-sm">
              <svg className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Your link looks like:&nbsp;
              <span className="font-mono text-[13px] text-ink">coinbase.usdc-pay.com/pay/...</span>
            </div>
          </div>
        </section>

        {/* ── Feature cards ── */}
        <section className="border-t border-hairline bg-surface-soft px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-[1000px]">
            <div className="grid gap-5 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-hairline bg-surface-card p-6 shadow-card"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    {f.icon}
                  </div>
                  <h3 className="mb-1.5 text-[15px] font-semibold text-ink">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-body">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-hairline bg-bg">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-xs text-muted">© {new Date().getFullYear()} Coinbase. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted sm:gap-4">
              <Link href="/how-it-works" className="transition hover:text-ink">How it works</Link>
              <Link href="/legal/terms" className="transition hover:text-ink">User Agreement</Link>
              <Link href="/legal/privacy" className="transition hover:text-ink">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
