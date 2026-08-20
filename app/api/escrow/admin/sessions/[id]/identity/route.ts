import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

/** Submitted ID records for a session, each with a short-lived signed URL for the private document. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("escrow_identity_verifications")
    .select("id, wallet_address, full_name, country, document_path, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/sessions/:id/identity] query failed:", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const records = await Promise.all(
    (data ?? []).map(async (record) => {
      const { data: signed } = await db.storage
        .from("kyc-documents")
        .createSignedUrl(record.document_path, 300);
      return { ...record, documentUrl: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ ok: true, records });
}
