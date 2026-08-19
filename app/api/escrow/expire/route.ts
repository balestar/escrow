import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/logEvent";

export const runtime = "edge";

interface ExpireBody {
  sessionId?: string;
  wallet?: string;
}

/**
 * Called by the client when its local countdown hits zero. Re-validates the
 * expiry server-side (using started_at + session_minutes, not client input)
 * before flipping status, so a tampered client can't force an early expiry.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as ExpireBody | null;
  if (!body?.sessionId) {
    return NextResponse.json({ ok: false, error: "session_id_required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_sessions")
    .select("id, status, started_at, session_minutes")
    .eq("id", body.sessionId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  if (data.status !== "active" || !data.started_at) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const expiresAt = new Date(data.started_at).getTime() + data.session_minutes * 60_000;
  if (Date.now() < expiresAt) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await db.from("escrow_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", body.sessionId);
  await logSessionEvent(req, body.sessionId, "expired", body.wallet);
  return NextResponse.json({ ok: true });
}
