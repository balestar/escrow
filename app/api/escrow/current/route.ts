import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { shapePublicSession, PUBLIC_SESSION_COLUMNS } from "@/lib/publicSession";

export const runtime = "nodejs";

/**
 * Public read of the single most relevant escrow session shown to
 * recipients — the newest one that's still pending or active. Superseded
 * for multi-recipient use by /api/escrow/session/[id], which targets one
 * specific session via its shareable link; this route remains as a
 * convenience "whatever's live right now" fallback for the bare homepage.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("escrow_sessions")
      .select(PUBLIC_SESSION_COLUMNS)
      .in("status", ["pending", "active"])
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[escrow/current] query failed:", error);
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: true, session: null });
    }

    const session = await shapePublicSession(db, data);
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    console.error("[escrow/current] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
