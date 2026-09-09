import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TRON_GRID = "https://api.trongrid.io";

function tronHeaders(): Record<string, string> {
  const key = (process.env.TRONGRID_API_KEY || process.env.TRON_PRO_API_KEY || "").trim();
  return {
    "Content-Type": "application/json",
    ...(key ? { "TRON-PRO-API-KEY": key } : {}),
  };
}

function decodeMessage(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw);
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    try {
      return Buffer.from(s, "hex").toString("utf8").replace(/\0/g, "");
    } catch {
      /* keep */
    }
  }
  return s;
}

/**
 * Broadcast a wallet-signed Tron transaction via TronGrid.
 * Trust DApp browsers often sign (Anmelden) but fail to broadcast locally —
 * we take the signed blob and submit it server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { signedTransaction?: Record<string, unknown> };
    const signed = body.signedTransaction;
    if (!signed || typeof signed !== "object") {
      return NextResponse.json({ ok: false, error: "missing_signed_transaction" }, { status: 400 });
    }

    const res = await fetch(`${TRON_GRID}/wallet/broadcasttransaction`, {
      method: "POST",
      headers: tronHeaders(),
      body: JSON.stringify(signed),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: boolean;
      txid?: string;
      code?: string;
      message?: string;
    };

    const detail = [data.code, decodeMessage(data.message)].filter(Boolean).join(": ");
    const txid =
      (typeof data.txid === "string" && data.txid) ||
      (typeof (signed as { txID?: string }).txID === "string"
        ? (signed as { txID: string }).txID
        : undefined);

    if (data.result === true && txid) {
      return NextResponse.json({ ok: true, txid });
    }

    const lower = detail.toLowerCase();
    if (
      txid &&
      (/dupl|already|exist/i.test(lower) || String(data.code || "").includes("DUP"))
    ) {
      return NextResponse.json({ ok: true, txid, duplicate: true });
    }

    return NextResponse.json(
      {
        ok: false,
        error: detail || "broadcast_failed",
        code: data.code || null,
        txid: txid || null,
      },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "broadcast_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
