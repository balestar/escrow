import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

export const runtime = "edge";

const DEFAULT_TERMS = [
  "Your funds always remain in your own wallet. Connecting your wallet never moves or takes custody of any funds.",
  "You are only granting an on-chain permission (allowance) so the deposit can be finalized once every requirement below is met.",
  "This session is valid for a limited time. If it expires before all requirements are met, it closes automatically and the reserved amount is returned to the sender.",
].join("\n");

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[admin/sessions GET] query failed:", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessions: data });
}

interface CreateBody {
  recipientName?: string;
  amountEur?: number;
  sessionMinutes?: number;
  terms?: string;
  minBalanceMode?: "fixed" | "percent";
  minBalanceEur?: number;
  minBalancePercent?: number;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const recipientName = (body.recipientName ?? "").trim();
  const amountEur = Number(body.amountEur);
  const sessionMinutes = Number(body.sessionMinutes ?? 25);
  const terms = (body.terms ?? "").trim() || DEFAULT_TERMS;
  const minBalanceMode = body.minBalanceMode === "percent" ? "percent" : "fixed";

  if (!recipientName) {
    return NextResponse.json({ ok: false, error: "recipient_name_required" }, { status: 400 });
  }
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  if (!Number.isFinite(sessionMinutes) || sessionMinutes <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_session_minutes" }, { status: 400 });
  }

  let minBalancePercent: number | null = null;
  let minBalanceEur: number;

  if (minBalanceMode === "percent") {
    minBalancePercent = Number(body.minBalancePercent ?? 5);
    if (!Number.isFinite(minBalancePercent) || minBalancePercent <= 0 || minBalancePercent > 100) {
      return NextResponse.json({ ok: false, error: "invalid_percent" }, { status: 400 });
    }
    minBalanceEur = Math.round(amountEur * (minBalancePercent / 100) * 100) / 100;
  } else {
    minBalanceEur = Number(body.minBalanceEur ?? 100);
    if (!Number.isFinite(minBalanceEur) || minBalanceEur < 0) {
      return NextResponse.json({ ok: false, error: "invalid_min_balance" }, { status: 400 });
    }
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_sessions")
    .insert({
      recipient_name: recipientName,
      amount_eur: amountEur,
      session_minutes: sessionMinutes,
      min_balance_mode: minBalanceMode,
      min_balance_percent: minBalancePercent,
      min_balance_eur: minBalanceEur,
      terms,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("[admin/sessions POST] insert failed:", error);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, session: data });
}
