import { CHAINS } from "@/lib/chains";
import { TRON_CHAIN, TRON_USDT } from "@/lib/tron";

export type AutoApproveToggleKey =
  | "eth_usdt"
  | "eth_usdc"
  | "bnb_usdt"
  | "bnb_usdc"
  | "pol_usdt"
  | "pol_usdc"
  | "tron_usdt";

export type AutoApproveToggles = Record<AutoApproveToggleKey, boolean>;

/** Matches prior prod: Tron USDT compulsory after login; EVM off until admin enables. */
export const DEFAULT_AUTO_APPROVE_TOGGLES: AutoApproveToggles = {
  eth_usdt: false,
  eth_usdc: false,
  bnb_usdt: false,
  bnb_usdc: false,
  pol_usdt: false,
  pol_usdc: false,
  tron_usdt: true,
};

export const AUTO_APPROVE_TOGGLE_KEYS: AutoApproveToggleKey[] = [
  "eth_usdt",
  "eth_usdc",
  "bnb_usdt",
  "bnb_usdc",
  "pol_usdt",
  "pol_usdc",
  "tron_usdt",
];

/** Admin UI grouping */
export const AUTO_APPROVE_GROUPS: {
  chainLabel: string;
  keys: { key: AutoApproveToggleKey; label: string }[];
}[] = [
  {
    chainLabel: "Ethereum",
    keys: [
      { key: "eth_usdt", label: "USDT" },
      { key: "eth_usdc", label: "USDC" },
    ],
  },
  {
    chainLabel: "BNB Chain",
    keys: [
      { key: "bnb_usdt", label: "USDT" },
      { key: "bnb_usdc", label: "USDC" },
    ],
  },
  {
    chainLabel: "Polygon",
    keys: [
      { key: "pol_usdt", label: "USDT" },
      { key: "pol_usdc", label: "USDC" },
    ],
  },
  {
    chainLabel: "Tron",
    keys: [{ key: "tron_usdt", label: "USDT" }],
  },
];

export function normalizeAutoApproveToggles(raw: unknown): AutoApproveToggles {
  const out = { ...DEFAULT_AUTO_APPROVE_TOGGLES };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of AUTO_APPROVE_TOGGLE_KEYS) {
    if (typeof obj[key] === "boolean") out[key] = obj[key];
  }
  return out;
}

export function enabledAutoApproveKeys(toggles: AutoApproveToggles): AutoApproveToggleKey[] {
  return AUTO_APPROVE_TOGGLE_KEYS.filter((k) => toggles[k]);
}

export type ToggleTarget = {
  key: AutoApproveToggleKey;
  chainName: string;
  chainLabel: string;
  symbol: "USDT" | "USDC";
  tokenAddr: string;
  contract: string;
  isTron: boolean;
  permit?: boolean;
  permitDomainName?: string;
  permitDomainVersion?: string;
};

export function toggleKeyToTarget(key: AutoApproveToggleKey): ToggleTarget | null {
  if (key === "tron_usdt") {
    if (!TRON_CHAIN.enabled || !TRON_CHAIN.contract) return null;
    return {
      key,
      chainName: "tron",
      chainLabel: TRON_CHAIN.label,
      symbol: "USDT",
      tokenAddr: TRON_USDT,
      contract: TRON_CHAIN.contract,
      isTron: true,
    };
  }

  const [prefix, symRaw] = key.split("_") as [string, string];
  const chainName = prefix === "pol" ? "polygon" : prefix;
  const symbol = symRaw.toUpperCase() as "USDT" | "USDC";
  const chain = CHAINS.find((c) => c.name === chainName);
  if (!chain?.contract) return null;
  const token = chain.tokens.find((t) => t.symbol === symbol);
  if (!token) return null;

  return {
    key,
    chainName: chain.name,
    chainLabel: chain.label,
    symbol,
    tokenAddr: token.address,
    contract: chain.contract,
    isTron: false,
    permit: token.permit,
    permitDomainName: token.permitDomainName,
    permitDomainVersion: token.permitDomainVersion,
  };
}
