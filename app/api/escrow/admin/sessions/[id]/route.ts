import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

export const runtime = "edge";

interface PatchBody {
  status?: "pending" | "active" | "completed" | "expired" | "cancelled";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body?.status) return NextResponse.json({ ok: false, error: "status_required" }, { status: 400 });

  const allowed = ["pending", "active", "completed", "expired", "cancelled"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_sessions")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[admin/sessions/:id PATCH] update failed:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, session: data });
}
