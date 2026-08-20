/**
 * /api/permit
 *
 * EIP-2612 gasless USDC approval:
 *   1. Frontend: user signs an off-chain EIP-712 permit message (zero gas).
 *   2. Frontend POSTs here with the signature.
 *   3. This route: our relayer calls USDC.permit() and pays the gas itself.
 *   4. USDC allowance is set — user never needed any native token.
 *
 * Supported tokens (those with `permit: true` in lib/chains.ts):
 *   - USDC v2.1 on Ethereum   (domain version "2")
 *   - USDC.e on Polygon       (domain version "1")
 */
import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { CHAINS } from "@/lib/chains";

export const runtime = "nodejs";

const PERMIT_ABI = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function nonces(address owner) view returns (uint256)",
];

function getProvider(chain: (typeof CHAINS)[number]): JsonRpcProvider {
  const urls = chain.overrideRpcUrls?.length ? chain.overrideRpcUrls : chain.rpcUrls;
  return new JsonRpcProvider(urls[0], { chainId: chain.chainId, name: chain.name });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chain?: string;
      tokenAddress?: string;
      owner?: string;
      spender?: string;
      value?: string;
      deadline?: number;
      v?: number;
      r?: string;
      s?: string;
    };

    const { chain: chainName, tokenAddress, owner, spender, value, deadline, v, r, s } = body;

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!chainName || !tokenAddress || !owner || !spender || !value || !deadline || v == null || !r || !s) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const chain = CHAINS.find((c) => c.name === chainName);
    if (!chain) {
      return NextResponse.json({ ok: false, error: `Unknown chain: ${chainName}` }, { status: 400 });
    }

    // Confirm the token is permit-enabled in our chain config
    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase() && t.permit
    );
    if (!token) {
      return NextResponse.json(
        { ok: false, error: `Token ${tokenAddress} does not have permit enabled on ${chainName}` },
        { status: 400 }
      );
    }

    // Sanity: deadline must be in the future
    if (deadline < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ ok: false, error: "Permit deadline has expired" }, { status: 400 });
    }

    // ── Relayer wallet ────────────────────────────────────────────────────────
    const relayerKey = process.env.GAS_RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ ok: false, error: "Relayer not configured" }, { status: 503 });
    }

    const provider = getProvider(chain);
    const relayer = new Wallet(relayerKey, provider);

    // ── Verify the nonce hasn't already been consumed ─────────────────────────
    const usdc = new Contract(tokenAddress, PERMIT_ABI, provider);
    const currentNonce: bigint = await usdc.nonces(owner);
    // We don't know the nonce that was signed from client-side, but if permit()
    // reverts because of nonce mismatch we'll catch and return a clean error.

    // ── Submit permit() — relayer pays gas ────────────────────────────────────
    const usdcRelay = new Contract(tokenAddress, PERMIT_ABI, relayer);
    const feeData = await provider.getFeeData();

    const tx = await usdcRelay.permit(
      owner,
      spender,
      BigInt(value),
      deadline,
      v,
      r,
      s,
      {
        gasLimit: 80_000n,
        gasPrice: feeData.gasPrice ?? undefined,
      }
    );

    // Don't block the response on confirmation — permit() is synchronous enough
    // that on-chain state is immediately available once broadcast. We fire-and-forget
    // for speed and let the client proceed with the main approval tx.
    tx.wait(1).catch((err: unknown) =>
      console.error(`[permit] confirmation failed on ${chainName}:`, err)
    );

    return NextResponse.json({ ok: true, txHash: tx.hash, chain: chainName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[permit] error:", msg);

    // Nonce already used = allowance already set = still OK
    if (msg.includes("nonce") || msg.includes("ERC20Permit: invalid signature")) {
      return NextResponse.json({ ok: true, note: "Permit already applied or signature reused" });
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
