"use client";

import { useState } from "react";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";

/** Standard Coinbase mark — blue circle + white square. For light/white backgrounds. */
function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-label="Coinbase">
      <circle cx="28" cy="28" r="28" fill="#0052FF" />
      <rect x="13.125" y="13.125" width="29.75" height="29.75" fill="#fff" />
    </svg>
  );
}

/** Inverted Coinbase mark — white circle + blue square. For blue/dark backgrounds. */
function BrandMarkInverted({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-label="Coinbase">
      <circle cx="28" cy="28" r="28" fill="#fff" />
      <rect x="13.125" y="13.125" width="29.75" height="29.75" fill="#0052FF" />
    </svg>
  );
}

export default function CoinbaseSignIn({
  onVerified,
  waitingForWallet = false,
}: {
  onVerified?: () => void;
  onConnectCoinbase?: () => void; // kept for API compat, unused
  onLoginWithWallet?: () => void; // kept for API compat, unused
  loading?: boolean;
  waitingForWallet?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSending(true);
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || !flowId) return;
    setError(null);
    setVerifying(true);
    try {
      await verifyEmailOTP({ flowId, otp: otp.trim() });
      // CDP verified — now open Privy wallet picker
      onVerified?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">

      {/* ── Left panel: large Coinbase branding ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0052FF] px-10 py-12 lg:flex lg:w-[52%] xl:px-16 xl:py-16">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.12),transparent_60%)]" />

        {/* Logo wordmark */}
        <div className="relative flex items-center gap-3">
          <BrandMarkInverted className="h-10 w-10 shrink-0" />
          <span className="text-[22px] font-bold tracking-tight text-white">Coinbase</span>
        </div>

        {/* Hero content */}
        <div className="relative flex flex-col items-start">
          {/* Giant logo — white C mark on blue background */}
          <div className="mb-10">
            <BrandMarkInverted className="h-[120px] w-[120px] drop-shadow-2xl" />
          </div>

          <h1 className="mb-4 font-display text-4xl font-semibold leading-tight tracking-[-0.04em] text-white xl:text-5xl">
            The easiest place<br />to pay with USDC
          </h1>
          <p className="mb-10 max-w-sm text-base leading-relaxed text-white/70">
            Secure, multichain stablecoin payments. Instant settlement across Ethereum, BNB Chain, Polygon, and Base.
          </p>

          {/* Trust signals */}
          <div className="space-y-3">
            {[
              "Institutional-grade custody infrastructure",
              "Real-time on-chain verification",
              "Identity-protected checkout",
            ].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm text-white/80">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Coinbase, Inc. All rights reserved.</p>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex flex-1 flex-col">
        {/* Mobile-only header */}
        <header className="flex items-center gap-2.5 border-b border-hairline px-5 py-4 lg:hidden">
          <BrandMark className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-tight text-ink">Coinbase</span>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[380px]">

            {/* Mobile: show big logo above form */}
            <div className="mb-8 flex justify-center lg:hidden">
              <svg viewBox="0 0 32 32" className="h-20 w-20 drop-shadow-md" fill="none" aria-label="Coinbase">
                <circle cx="16" cy="16" r="16" fill="#0052FF" />
                <rect x="7.5" y="7.5" width="17" height="17" fill="#fff" />
              </svg>
            </div>

            {waitingForWallet ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="text-base font-semibold text-ink">Waiting for wallet confirmation…</p>
                <p className="mt-1.5 text-sm text-muted">Approve the connection in your wallet app</p>
              </div>
            ) : !flowId ? (
              <>
                <h2 className="mb-1.5 text-2xl font-semibold tracking-[-0.03em] text-ink">Sign in to Coinbase</h2>
                <p className="mb-8 text-[15px] text-body">Enter your email to receive a one-time code.</p>

                <form onSubmit={handleSendCode} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-ink">Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      autoFocus
                      autoComplete="email"
                      inputMode="email"
                      className="h-12 w-full rounded-xl border border-hairline bg-bg px-4 text-[15px] text-ink placeholder:text-muted transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-down/10 px-3 py-2.5 text-[13px] text-down">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                  >
                    {sending ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Sending…
                      </>
                    ) : (
                      "Continue with email"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setFlowId(null); setOtp(""); setError(null); }}
                  className="mb-6 flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
                  <svg className="h-7 w-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="mb-1.5 text-2xl font-semibold tracking-[-0.03em] text-ink">Check your email</h2>
                <p className="mb-1 text-[15px] text-body">We sent a 6-digit code to</p>
                <p className="mb-8 text-[15px] font-semibold text-ink">{email}</p>

                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-ink">Verification code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      required
                      autoFocus
                      className="h-12 w-full rounded-xl border border-hairline bg-bg px-4 text-center text-[22px] font-mono tracking-[0.5em] text-ink placeholder:text-muted placeholder:tracking-normal placeholder:text-[15px] transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-down/10 px-3 py-2.5 text-[13px] text-down">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={verifying || otp.length < 6}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                  >
                    {verifying ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Verifying…
                      </>
                    ) : (
                      "Verify code"
                    )}
                  </button>
                </form>
              </>
            )}

            <p className="mt-8 text-[12px] leading-relaxed text-muted">
              By continuing, you agree to Coinbase&apos;s{" "}
              <a href="https://coinbase.com/legal/user_agreement" target="_blank" rel="noopener noreferrer" className="font-medium text-body underline-offset-2 hover:underline">
                User Agreement
              </a>{" "}
              and{" "}
              <a href="https://coinbase.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-body underline-offset-2 hover:underline">
                Privacy Policy
              </a>.
            </p>
          </div>
        </div>

        <footer className="border-t border-hairline px-5 py-4 text-center lg:hidden">
          <p className="text-[11px] text-muted">© {new Date().getFullYear()} Coinbase, Inc.</p>
        </footer>
      </div>
    </div>
  );
}
