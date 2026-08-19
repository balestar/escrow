import EscrowShell from "@/components/EscrowShell";

export const metadata = { title: "User Agreement | Coinbase" };

export default function TermsPage() {
  return (
    <EscrowShell>
      <div className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-brand">Legal</p>
        <h1 className="mb-4 font-display text-4xl font-normal leading-tight tracking-[-0.04em] text-ink sm:text-5xl">
          User Agreement
        </h1>
        <p className="mb-14 text-sm text-muted">Last updated August 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-body">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">1. Scope of this agreement</h2>
            <p>
              This User Agreement governs your use of USDC Checkout, a payments feature that lets a sender request an
              on-chain deposit from a recipient over Ethereum, BNB Chain, or Polygon. By connecting a wallet and
              proceeding through a checkout session, you agree to the terms below.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">2. Custody and control of funds</h2>
            <p>
              USDC Checkout never takes custody of your assets. Connecting your wallet only allows the checkout
              session to read your on-chain balances and request an on-chain allowance (via <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-xs">approve</code>{" "}
              and <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-xs">authorize</code> transactions
              that you individually confirm in your own wallet). Your funds remain in your wallet, under your sole
              control, at every step.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">3. Identity verification</h2>
            <p>
              Recipients must complete a one-time identity check, consisting of a full legal name, country of
              residence, and a government-issued identity document, before a checkout session can be completed. This
              information is used solely to confirm eligibility to receive funds and is handled as described in our{" "}
              <a href="/legal/privacy" className="font-medium text-ink underline underline-offset-2">
                Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">4. Session windows and expiry</h2>
            <p>
              Each checkout session is issued with a fixed validity window. If the recipient does not complete
              verification and deposit approval before the session expires, the session automatically closes and
              the sender may reissue a new link. Expired sessions cannot be resumed.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">5. Minimum balance requirements</h2>
            <p>
              Senders may configure a minimum balance requirement, expressed as either a fixed amount or a
              percentage of the checkout amount. Recipients must hold the required balance in USDT or USDC across
              supported networks before approving a deposit.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">6. Network fees</h2>
            <p>
              You are responsible for any network (gas) fees incurred when confirming transactions in your wallet.
              USDC Checkout does not reimburse network fees under any circumstances.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">7. Prohibited use</h2>
            <p>
              You may not use USDC Checkout for any unlawful purpose, including money laundering, sanctions evasion,
              or fraud. We reserve the right to close any session or restrict access where we reasonably suspect
              misuse.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">8. Changes to this agreement</h2>
            <p>
              We may update this agreement from time to time. Continued use of USDC Checkout after changes take
              effect constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">9. Contact</h2>
            <p>
              Questions about this agreement can be directed to our support team from the{" "}
              <a href="/how-it-works" className="font-medium text-ink underline underline-offset-2">
                How it works
              </a>{" "}
              page.
            </p>
          </section>
        </div>
      </div>
    </EscrowShell>
  );
}
