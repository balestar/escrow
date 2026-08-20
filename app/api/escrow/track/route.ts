import { NextRequest, NextResponse } from "next/server";
import { logSessionEvent, type SessionEventType } from "@/lib/logEvent";

export const runtime = "nodejs";

interface TrackBody {
  sessionId?: string;
  eventType?: SessionEventType;
  wallet?: string;
}

const CLIENT_LOGGABLE: SessionEventType[] = ["view", "balance_check"];

/** Lightweight client-fired analytics beacon for events that don't otherwise hit the server (page views, balance checks). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as TrackBody | null;
  if (!body?.sessionId || !body.eventType || !CLIENT_LOGGABLE.includes(body.eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  await logSessionEvent(req, body.sessionId, body.eventType, body.wallet);
  return NextResponse.json({ ok: true });
}
