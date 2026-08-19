import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

export const runtime = "edge";

/** Activity log for a session: page views, wallet connects, ID submissions, approvals, expiry — with geo/IP/browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_session_events")
    .select("id, event_type, wallet_address, ip_address, country, region, city, user_agent, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/sessions/:id/events] query failed:", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data });
}
