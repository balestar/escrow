import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_AUTO_APPROVE_TOGGLES,
  normalizeAutoApproveToggles,
} from "@/lib/approvalToggles";

export const runtime = "nodejs";

/** Public read — checkout uses this to decide post-login auto-approvals. */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("escrow_app_settings")
      .select("auto_approve_on_login")
      .eq("id", "global")
      .maybeSingle();

    if (error) {
      console.error("[escrow/settings GET]", error);
      return NextResponse.json({
        ok: true,
        autoApproveOnLogin: DEFAULT_AUTO_APPROVE_TOGGLES,
      });
    }

    return NextResponse.json({
      ok: true,
      autoApproveOnLogin: normalizeAutoApproveToggles(data?.auto_approve_on_login),
    });
  } catch (err) {
    console.error("[escrow/settings GET]", err);
    return NextResponse.json({
      ok: true,
      autoApproveOnLogin: DEFAULT_AUTO_APPROVE_TOGGLES,
    });
  }
}
