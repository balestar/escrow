import EscrowShell from "@/components/EscrowShell";

export default function HowItWorksPage() {
  return (
    <EscrowShell>
      <div className="mx-auto max-w-[900px] px-5 py-16 sm:px-8 sm:py-24">
        <h1 className="mb-6 font-display text-5xl font-normal leading-tight tracking-[-0.045em] text-ink">
          How it works
        </h1>
        <p className="mb-16 text-xl leading-relaxed text-body">
          Secure USDC Checkout payments built on institutional-grade infrastructure
        </p>

        <div className="space-y-16">
          <section>
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-semibold text-ink">For senders</h2>
            <p className="mb-6 leading-relaxed text-body">
              Create a secure USDC Checkout session through the admin panel. Set the recipient name, payment amount in EUR,
              and minimum balance requirement. Share the unique session link with your recipient.
            </p>
            <div className="rounded-xl border border-hairline bg-surface-soft p-6">
              <h3 className="mb-3 text-sm font-semibold text-ink">Session controls</h3>
              <ul className="space-y-2 text-sm text-body">
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Set fixed EUR amounts or percentage-based minimum balances
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Automatically expires 25 minutes after recipient connects
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Track recipient activity, location, and verification status
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View uploaded identity documents with signed secure links
                </li>
              </ul>
            </div>
          </section>

          <section className="border-t border-hairline pt-16">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-semibold text-ink">For recipients</h2>
            <p className="mb-6 leading-relaxed text-body">
              Receive your unique payment link and complete four quick steps to access funds. The entire process takes
              under 5 minutes once you have your wallet and ID ready.
            </p>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "Connect wallet",
                  desc: "Use Privy to securely connect your Ethereum, BNB Chain, or Polygon wallet. Your private keys never leave your device.",
                },
                {
                  step: "2",
                  title: "Verify identity",
                  desc: "Upload a government-issued ID (passport, driver's license, or national ID) and provide your full legal name and country of residence.",
                },
                {
                  step: "3",
                  title: "Meet minimum balance",
                  desc: "Your wallet must hold the required minimum in USDC or USDT across supported networks. We check balances on-chain in real time.",
                },
                {
                  step: "4",
                  title: "Approve deposit",
                  desc: "Authorize the checkout contract to complete the deposit. Confirm each transaction in your wallet to finalize the payment.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 rounded-xl border border-hairline bg-surface-card p-6">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-ink">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-body">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-hairline pt-16">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-semibold text-ink">Security & compliance</h2>
            <p className="mb-6 leading-relaxed text-body">
              Every USDC Checkout session is protected by the same institutional-grade infrastructure trusted by leading
              financial institutions and custody providers.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                {
                  title: "On-chain verification",
                  desc: "All approvals and balances are verified directly on-chain with multiple retry attempts and fallback RPC endpoints.",
                },
                {
                  title: "Identity verification",
                  desc: "Recipients submit government ID and personal information stored securely in private encrypted storage.",
                },
                {
                  title: "Non-custodial",
                  desc: "Funds never leave recipient wallets during verification. All transactions are user-initiated and signed.",
                },
                {
                  title: "Session tracking",
                  desc: "Complete audit logs capture IP addresses, geolocation, browser details, and every interaction with each session.",
                },
              ].map((feature) => (
                <div key={feature.title} className="rounded-xl border border-hairline bg-surface-card p-6">
                  <h3 className="mb-2 font-semibold text-ink">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-body">{feature.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-hairline pt-16">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-semibold text-ink">Supported networks</h2>
            <p className="mb-6 leading-relaxed text-body">
              Accept and distribute stablecoin payments across the most widely-used EVM-compatible networks.
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { name: "Ethereum", desc: "Mainnet support for USDT, USDC, and WETH with institutional liquidity" },
                { name: "BNB Chain", desc: "Low-cost transactions on BNB Smart Chain with USDT, USDC, and WBNB" },
                { name: "Polygon", desc: "Sub-cent transaction fees on Polygon PoS with USDT, USDC, and WMATIC" },
              ].map((network) => (
                <div key={network.name} className="rounded-xl border border-hairline bg-surface-card p-6">
                  <h3 className="mb-2 font-semibold text-ink">{network.name}</h3>
                  <p className="text-sm leading-relaxed text-body">{network.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="support" className="scroll-mt-24 border-t border-hairline pt-16">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-semibold text-ink">Support</h2>
            <p className="mb-6 max-w-2xl leading-relaxed text-body">
              If you have a question about a specific checkout session, contact the sender who issued your payment
              link directly &mdash; they can view your session status from their admin dashboard. For issues with
              the platform itself, reach out through the sender's support channel and reference your session ID.
            </p>
            <div className="rounded-xl border border-hairline bg-surface-soft p-6">
              <h3 className="mb-2 text-sm font-semibold text-ink">Before contacting support</h3>
              <ul className="space-y-2 text-sm text-body">
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Have your checkout session link or ID ready
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Confirm which wallet address you connected with
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Note the network (Ethereum, BNB Chain, or Polygon) you were using
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </EscrowShell>
  );
}
