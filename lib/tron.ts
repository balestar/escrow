// ---------------------------------------------------------------------------
// Tron support (scaffold — not yet wired into the live UI)
// ---------------------------------------------------------------------------
// Tron is NOT an EVM chain: addresses are base58 (start with "T"), wallets are
// TronLink (not MetaMask/Coinbase Wallet/WalletConnect), and Privy — which
// drives every other chain in this app — does not manage Tron wallets at all.
// That means Tron can't just be added as another entry looped over alongside
// Base/Ethereum/BNB/Polygon; it needs its own connect UI backed by TronLink's
// injected `window.tronWeb`, running in parallel to (not instead of) the
// existing Privy-based flow. This file provides the pieces for that follow-up:
// chain/token config + a thin TronLink connector. It is intentionally not
// imported anywhere yet.
//
// To wire it in:
//   1. Deploy contracts/Tron.sol via deploy/tron (see contracts/README.md),
//      fill in TRON_CHAIN.contract below, flip TRON_CHAIN.enabled to true.
//   2. Add a "Connect Tron wallet" step to the UI that uses connectTronLink()
//      below instead of Privy, then mirrors the same authorize()/approve()
//      calls VerifyWallet.tsx already does for EVM chains — but signed via
//      window.tronWeb instead of an ethers Signer.

export interface TronToken {
  symbol: string;
  address: string; // base58 TRC20 address
  decimals: number;
  mandatory?: boolean;
}

export interface TronChainConfig {
  name: "tron";
  label: string;
  contract: string; // deployed Tron.sol address (base58), fill in after deploying
  enabled: boolean;
  explorer: string;
  tokens: TronToken[];
  // SERVER-SIDE ONLY auth'd provider URL (e.g. QuickNode). Populated from
  // QUICKNODE_TRON_RPC_URL only when running on the server — never shipped to
  // the client bundle, so the credentials can't leak to browsers.
  overrideRpcUrl?: string;
}

// Token notes (see contracts/README.md for the full writeup):
//   - USDT is real and official: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (6 decimals).
//     This is the single most-transferred stablecoin contract in crypto.
//   - Circle discontinued official USDC support on Tron in February 2025 —
//     there is no legitimate native USDC to list here anymore.
export const TRON_CHAIN: TronChainConfig = {
  name: "tron",
  label: "Tron",
  contract: "TCmTc2WbtGbDuL6b5iFEkD2EzmjyG8ZnJy",
  enabled: true,
  explorer: "https://tronscan.org",
  tokens: [
    { symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, mandatory: true },
  ],
  // QuickNode (server-side only — process.env reads as undefined on client)
  overrideRpcUrl: process.env.QUICKNODE_TRON_RPC_URL || undefined,
};

// Same relayer address used across every EVM deployment (RELAYER_ADDRESS in
// lib/chains.ts). Tron's TVM accepts the hex form of an address identically to
// the EVM chains — TronLink/TronWeb just display it as base58 by convention.
export const TRON_RELAYER_HEX = "0x1826d8D10F6a6deadDB401Fe2843fdBf34855414";

// ---------------------------------------------------------------------------
// TronLink connector
// ---------------------------------------------------------------------------

interface TronWebLike {
  ready?: boolean;
  defaultAddress?: { base58?: string; hex?: string };
  trx: {
    getBalance?: (address: string) => Promise<number>;
  };
  contract: () => {
    at: (address: string) => Promise<Record<string, unknown>>;
  };
}

declare global {
  interface Window {
    tronWeb?: TronWebLike;
    tronLink?: {
      request: (args: { method: string }) => Promise<unknown>;
    };
  }
}

export function isTronProviderPresent(): boolean {
  if (typeof window === "undefined") return false;
  // Trust Wallet DApp browser, TronLink extension, and some others inject
  // either tronLink, tronWeb, or both. Check both.
  return Boolean(window.tronLink) || Boolean(window.tronWeb);
}

export function isTronLinkInstalled(): boolean {
  return isTronProviderPresent();
}

/** Read a Tron base58 address if the provider already exposed one. */
export function getConnectedTronAddress(): string | null {
  if (typeof window === "undefined") return null;
  const tw = window.tronWeb as
    | { ready?: boolean; defaultAddress?: { base58?: string } }
    | undefined;
  const addr = tw?.defaultAddress?.base58;
  // Trust Wallet often sets defaultAddress before `ready` flips true —
  // accept any valid T… address even if ready is still false.
  if (addr && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return addr;
  return null;
}

/**
 * Wait briefly for Trust Wallet / TronLink to inject window.tronWeb.
 * DApp browsers often inject it 100–800ms after page load.
 */
async function waitForTronWeb(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.tronWeb || window.tronLink) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 150));
    if (window.tronWeb || window.tronLink) return true;
  }
  return false;
}

/**
 * Ensure we have a Tron address for scanning/approving.
 * Works with TronLink extension AND Trust Wallet / TokenPocket DApp browsers.
 * Returns null if no Tron provider is present (e.g. desktop WalletConnect QR).
 */
export async function ensureTronAddress(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // Already have an address — use it immediately
  const existing = getConnectedTronAddress();
  if (existing) return existing;

  // Wait for late injection (common in mobile DApp browsers)
  const present = await waitForTronWeb(3000);
  if (!present) return null;

  // Try again after injection
  const afterWait = getConnectedTronAddress();
  if (afterWait) return afterWait;

  // Request account access — TronLink / Trust Wallet both support this
  try {
    if (window.tronLink?.request) {
      await window.tronLink.request({ method: "tron_requestAccounts" });
    } else {
      // Some DApp browsers put request on tronWeb instead of tronLink
      const tw = window.tronWeb as unknown as { request?: (a: { method: string }) => Promise<unknown> } | undefined;
      if (tw?.request) {
        await tw.request({ method: "tron_requestAccounts" });
      }
    }
  } catch {
    // User rejected or provider doesn't support request — keep polling below
  }

  // Poll until address appears (injection + account unlock can take a moment)
  for (let i = 0; i < 24; i++) {
    const addr = getConnectedTronAddress();
    if (addr) return addr;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/// Requests account access from TronLink / Trust Wallet and returns the
/// connected base58 address, or null if no Tron provider / user rejects.
export async function connectTronLink(): Promise<string | null> {
  return ensureTronAddress();
}

// ---------------------------------------------------------------------------
// Address conversion helpers
// ---------------------------------------------------------------------------
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

/**
 * Convert a Tron base58 address (T…) to checksummed EVM hex (0x…).
 * Tron mainnet addresses are 0x41 + 20 bytes; EVM is 0x + 20 bytes — same
 * underlying bytes, different prefix and encoding.
 */
export function tronBase58ToHex(base58Addr: string): string {
  if (base58Addr.startsWith("0x") && base58Addr.length === 42) return base58Addr;
  const decoded = base58Decode(base58Addr); // [0x41, ...20 bytes, ...4 byte checksum]
  const addrBytes = decoded.slice(1, 21); // drop 0x41 prefix; ignore checksum
  return "0x" + Array.from(addrBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
