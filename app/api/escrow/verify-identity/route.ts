import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/logEvent";

export const runtime = "edge";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Accepts a multipart form with the recipient's legal name, country, wallet
 * address, session id, and a photo/scan of their ID document. The document
 * is stored in the private `kyc-documents` bucket (never public), and a
 * verification record is written referencing its storage path.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sessionId = String(form.get("sessionId") ?? "");
    const wallet = String(form.get("wallet") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    const country = String(form.get("country") ?? "").trim();
    const file = form.get("document");

    if (!sessionId || !wallet || !fullName || !country) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "document_required" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "document_too_large" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "unsupported_file_type" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] ?? "bin";
    const path = `${sessionId}/${wallet.toLowerCase()}-${Date.now()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("kyc-documents")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[verify-identity] storage upload failed:", uploadError);
      return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
    }

    const { error: insertError } = await db.from("escrow_identity_verifications").insert({
      session_id: sessionId,
      wallet_address: wallet,
      full_name: fullName,
      country,
      document_path: path,
    });

    if (insertError) {
      console.error("[verify-identity] insert failed:", insertError);
      return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
    }

    await logSessionEvent(req, sessionId, "id_submitted", wallet);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[verify-identity] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
