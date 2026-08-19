import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { shapePublicSession, PUBLIC_SESSION_COLUMNS } from "@/lib/publicSession";

export const runtime = "edge";

/** Public read of one specific session by ID — what a recipient's shareable link resolves to. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("escrow_sessions")
      .select(PUBLIC_SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[escrow/session/:id] query failed:", error);
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: true, session: null });
    }

    const session = await shapePublicSession(db, data);
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    console.error("[escrow/session/:id] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
