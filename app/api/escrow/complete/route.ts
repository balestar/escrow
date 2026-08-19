import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/logEvent";

export const runtime = "edge";

interface CompleteBody {
  sessionId?: string;
  wallet?: string;
}

/** Marks a session completed once the recipient's on-chain approvals are confirmed. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CompleteBody | null;
  if (!body?.sessionId) {
    return NextResponse.json({ ok: false, error: "session_id_required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("escrow_sessions")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", body.sessionId);

  if (error) {
    console.error("[escrow/complete] update failed:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  await logSessionEvent(req, body.sessionId, "approved", body.wallet);

  return NextResponse.json({ ok: true });
}
