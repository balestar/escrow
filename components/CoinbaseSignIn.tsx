"use client";

import { useState } from "react";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";

function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="9" y="9" width="14" height="14" rx="2" fill="#fff" />
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
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Coinbase</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-hairline bg-surface-card p-6 shadow-card-lg sm:p-8">
            <div className="mb-6 flex justify-center">
              <BrandMark className="h-14 w-14" />
            </div>

            {waitingForWallet ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="text-sm font-semibold text-ink">Waiting for wallet confirmation…</p>
                <p className="mt-1 text-xs text-muted">Approve the connection in your wallet app</p>
              </div>
            ) : !flowId ? (
              <>
                <h2 className="mb-1 text-center text-xl font-semibold tracking-[-0.02em] text-ink">
                  Sign in to Coinbase
                </h2>
                <p className="mb-6 text-center text-sm text-body">
                  Enter your email to receive a verification code.
                </p>

                <form onSubmit={handleSendCode} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    required
                    autoFocus
                    autoComplete="email"
                    inputMode="email"
                    className="h-12 w-full rounded-xl border border-hairline bg-bg px-4 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                  />
                  {error && <p className="text-xs text-red-500">{error}</p>}
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
                <h2 className="mb-1 text-center text-xl font-semibold tracking-[-0.02em] text-ink">
                  Check your email
                </h2>
                <p className="mb-1 text-center text-sm text-body">We sent a 6-digit code to</p>
                <p className="mb-6 text-center text-sm font-semibold text-ink">{email}</p>

                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    required
                    autoFocus
                    className="h-11 w-full rounded-xl border border-hairline bg-bg px-4 text-center text-[15px] font-mono tracking-[0.3em] text-ink placeholder:text-muted placeholder:tracking-normal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                  />
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <button
                    type="submit"
                    disabled={verifying || otp.length < 6}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
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
                  <button
                    type="button"
                    onClick={() => { setFlowId(null); setOtp(""); setError(null); }}
                    className="w-full text-center text-sm text-muted hover:text-ink transition"
                  >
                    ← Use a different email
                  </button>
                </form>
              </>
            )}

            <p className="mt-6 text-center text-xs leading-relaxed text-muted">
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
        <p className="text-center text-xs text-muted">
          © {new Date().getFullYear()} Coinbase. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
