import EscrowShell from "@/components/EscrowShell";

export const metadata = { title: "Privacy Policy | Coinbase" };

export default function PrivacyPage() {
  return (
    <EscrowShell>
      <div className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-brand">Legal</p>
        <h1 className="mb-4 font-display text-4xl font-normal leading-tight tracking-[-0.04em] text-ink sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mb-14 text-sm text-muted">Last updated August 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-body">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">1. Information we collect</h2>
            <p>
              To complete a USDC Checkout session, we collect the wallet address you connect, on-chain balances
              needed to confirm minimum balance requirements, and the identity information you submit during
              verification: your full legal name, country of residence, and a government-issued identity document.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">2. Technical and session data</h2>
            <p>
              We automatically log session activity for security and compliance purposes, including approximate
              geographic location (derived from IP address), browser and device details, and timestamps of key
              actions (session view, identity submission, balance checks, deposit approval).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">3. How we use this information</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>Confirming a recipient's eligibility to receive funds through identity verification</li>
              <li>Enforcing minimum balance and session-expiry rules configured by the sender</li>
              <li>Detecting and preventing fraud, abuse, or unauthorized use</li>
              <li>Maintaining an auditable record of each checkout session for compliance purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">4. Identity documents</h2>
            <p>
              Uploaded identity documents are stored in an access-controlled, encrypted storage bucket and are only
              accessible to authorized administrators reviewing a specific session. Documents are retained only for
              as long as needed to satisfy compliance obligations.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">5. What we never collect</h2>
            <p>
              We never request, store, or have access to your wallet's private keys or seed phrase. All on-chain
              transactions are signed locally in your own wallet.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">6. Sharing of information</h2>
            <p>
              We do not sell personal information. Session and identity data is only shared with the sender who
              issued a given checkout session, and with service providers strictly as needed to operate the
              platform (for example, secure document storage).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">7. Your rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal information, subject to our
              legal and compliance retention obligations, by contacting support.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">8. Changes to this policy</h2>
            <p>
              We may update this policy periodically. Material changes will be reflected by updating the "last
              updated" date above.
            </p>
          </section>
        </div>
      </div>
    </EscrowShell>
  );
}
