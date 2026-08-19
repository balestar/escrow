import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/logEvent";

export const runtime = "edge";

interface StartBody {
  sessionId?: string;
  wallet?: string;
}

/**
 * Called once the recipient successfully connects a wallet. Idempotent:
 * if the session is already active, just returns its existing timer instead
 * of restarting the clock (a page refresh shouldn't reset the countdown).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StartBody | null;
  if (!body?.sessionId) {
    return NextResponse.json({ ok: false, error: "session_id_required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing, error: fetchError } = await db
    .from("escrow_sessions")
    .select("id, status, started_at, session_minutes")
    .eq("id", body.sessionId)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  if (existing.status === "expired" || existing.status === "cancelled" || existing.status === "completed") {
    return NextResponse.json({ ok: false, error: "session_closed" }, { status: 409 });
  }

  if (existing.status === "active" && existing.started_at) {
    await logSessionEvent(req, body.sessionId, "connect", body.wallet);
    const expiresAt = new Date(existing.started_at).getTime() + existing.session_minutes * 60_000;
    return NextResponse.json({ ok: true, startedAt: existing.started_at, expiresAt: new Date(expiresAt).toISOString() });
  }

  const startedAt = new Date().toISOString();
  const { data, error } = await db
    .from("escrow_sessions")
    .update({
      status: "active",
      started_at: startedAt,
      recipient_wallet: body.wallet ?? null,
      updated_at: startedAt,
    })
    .eq("id", body.sessionId)
    .select("started_at, session_minutes")
    .single();

  if (error || !data) {
    console.error("[escrow/start] update failed:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  await logSessionEvent(req, body.sessionId, "connect", body.wallet);

  const expiresAt = new Date(data.started_at).getTime() + data.session_minutes * 60_000;
  return NextResponse.json({ ok: true, startedAt: data.started_at, expiresAt: new Date(expiresAt).toISOString() });
}
