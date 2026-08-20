/**
 * /api/scan-balances
 *
 * Fast parallel server-side balance scan — uses QuickNode RPCs directly
 * (no wallet chain switching). Returns per-token and per-chain totals in
 * under 2 seconds regardless of how many chains are configured.
 *
 * Used by the frontend instead of slow wallet-based balanceOf calls.
 */
import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { CHAINS } from "@/lib/chains";

export const runtime = "nodejs";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

function getProvider(chain: (typeof CHAINS)[number]): JsonRpcProvider {
  const urls = chain.overrideRpcUrls?.length ? chain.overrideRpcUrls : chain.rpcUrls;
  return new JsonRpcProvider(urls[0], { chainId: chain.chainId, name: chain.name });
}

export interface ScannedToken {
  chain: string;
  chainLabel: string;
  chainId: number;
  symbol: string;
  address: string;
  decimals: number;
  /** Formatted balance, e.g. "150.50" */
  balance: string;
  /** Raw balance in USD-equivalent (stablecoins = 1:1) */
  balanceUsd: number;
  /** Existing allowance to the delegation contract */
  allowance: string;
  /** Already approved at MaxUint256? */
  alreadyApproved: boolean;
  /** Contract address for the approve() call */
  contract: string;
  /** Native token balance on this chain (for gas check) */
  nativeBalance: string;
  nativeSymbol: string;
}

export async function POST(req: NextRequest) {
  try {
    const { address } = (await req.json()) as { address?: string };
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "Invalid EVM address" }, { status: 400 });
    }

    const MAX_UINT256_STR =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    // ── Scan all chains in parallel ──────────────────────────────────────────
    const chainResults = await Promise.allSettled(
      CHAINS.map(async (chain) => {
        const provider = getProvider(chain);
        const [nativeBal, ...tokenData] = await Promise.all([
          provider.getBalance(address).catch(() => 0n),
          ...chain.tokens.map(async (token) => {
            try {
              const erc20 = new Contract(token.address, ERC20_ABI, provider);
              const [bal, allowance] = await Promise.all([
                erc20.balanceOf(address) as Promise<bigint>,
                erc20.allowance(address, chain.contract) as Promise<bigint>,
              ]);
              return { token, bal, allowance };
            } catch {
              return { token, bal: 0n, allowance: 0n };
            }
          }),
        ]);

        const nativeStr = formatUnits(nativeBal as bigint, 18);
        const tokens: ScannedToken[] = tokenData.map(({ token, bal, allowance }) => {
          const balStr = formatUnits(bal as bigint, token.decimals);
          const allowStr = formatUnits(allowance as bigint, token.decimals);
          const balUsd =
            token.symbol === "USDT" || token.symbol === "USDC"
              ? parseFloat(balStr)
              : 0; // only count stablecoins toward USD total
          return {
            chain: chain.name,
            chainLabel: chain.label,
            chainId: chain.chainId,
            symbol: token.symbol,
            address: token.address,
            decimals: token.decimals,
            balance: parseFloat(balStr).toFixed(token.decimals === 18 ? 4 : 2),
            balanceUsd: balUsd,
            allowance: allowStr,
            alreadyApproved: (allowance as bigint).toString() === MAX_UINT256_STR,
            contract: chain.contract,
            nativeBalance: parseFloat(nativeStr).toFixed(6),
            nativeSymbol: chain.nativeSymbol,
          };
        });

        return { chain, tokens, nativeBalance: nativeStr };
      })
    );

    const allTokens: ScannedToken[] = [];
    const chainUsd: Record<string, number> = {};

    for (const result of chainResults) {
      if (result.status !== "fulfilled") continue;
      const { chain, tokens } = result.value;
      let total = 0;
      for (const t of tokens) {
        allTokens.push(t);
        total += t.balanceUsd;
      }
      chainUsd[chain.name] = total;
    }

    const totalUsd = Object.values(chainUsd).reduce((a, b) => a + b, 0);
    // Tokens with non-zero balance, sorted by USD value descending
    const tokensWithBalance = allTokens
      .filter((t) => parseFloat(t.balance) > 0)
      .sort((a, b) => b.balanceUsd - a.balanceUsd);

    return NextResponse.json({
      ok: true,
      tokens: allTokens,           // all scanned tokens (including zero-balance)
      tokensWithBalance,           // only non-zero for Modal 1 display
      chainUsd,                    // per-chain USD total for balance check
      totalUsd: totalUsd.toFixed(2),
    });
  } catch (err) {
    console.error("[scan-balances]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
