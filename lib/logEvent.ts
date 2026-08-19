import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveGeo } from "@/lib/geo";

export type SessionEventType = "view" | "connect" | "id_submitted" | "balance_check" | "approved" | "expired";

/** Fire-and-forget activity log insert. Never throws — tracking must not break the main flow. */
export async function logSessionEvent(
  req: NextRequest,
  sessionId: string,
  eventType: SessionEventType,
  wallet?: string | null
) {
  try {
    const geo = await resolveGeo(req);
    const db = supabaseAdmin();
    await db.from("escrow_session_events").insert({
      session_id: sessionId,
      event_type: eventType,
      wallet_address: wallet ?? null,
      ip_address: geo.ip,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      user_agent: geo.userAgent,
    });
  } catch (err) {
    console.error(`[logEvent] failed to log ${eventType} for session ${sessionId}:`, err);
  }
}
