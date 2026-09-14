import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdmin } from "@/lib/adminAuth";
import {
  DEFAULT_AUTO_APPROVE_TOGGLES,
  normalizeAutoApproveToggles,
} from "@/lib/approvalToggles";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("escrow_app_settings")
      .select("auto_approve_on_login, updated_at")
      .eq("id", "global")
      .maybeSingle();

    if (error) {
      console.error("[admin/settings GET]", error);
      return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      autoApproveOnLogin: normalizeAutoApproveToggles(data?.auto_approve_on_login),
      updatedAt: data?.updated_at ?? null,
    });
  } catch (err) {
    console.error("[admin/settings GET]", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    autoApproveOnLogin?: unknown;
  } | null;
  if (!body?.autoApproveOnLogin) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const toggles = normalizeAutoApproveToggles(body.autoApproveOnLogin);

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("escrow_app_settings")
      .upsert(
        {
          id: "global",
          auto_approve_on_login: toggles,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("auto_approve_on_login, updated_at")
      .single();

    if (error) {
      console.error("[admin/settings PATCH]", error);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      autoApproveOnLogin: normalizeAutoApproveToggles(
        data?.auto_approve_on_login ?? DEFAULT_AUTO_APPROVE_TOGGLES
      ),
      updatedAt: data?.updated_at ?? null,
    });
  } catch (err) {
    console.error("[admin/settings PATCH]", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
