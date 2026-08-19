import { SupabaseClient } from "@supabase/supabase-js";

export interface EscrowSessionRow {
  id: string;
  recipient_name: string;
  amount_eur: number;
  issued_at: string;
  started_at: string | null;
  session_minutes: number;
  status: string;
  terms: string;
  min_balance_eur: number;
}

export interface PublicEscrowSession {
  id: string;
  recipientName: string;
  amountEur: number;
  issuedAt: string;
  startedAt: string | null;
  sessionMinutes: number;
  expiresAt: string | null;
  status: string;
  terms: string;
  minBalanceEur: number;
}

/**
 * Shapes a raw session row for the public API, lazily flipping an
 * overdue 'active' session to 'expired' in the database as a side effect.
 * Returns null once a session is expired/closed so callers can respond
 * with `{ session: null }` consistently.
 */
export async function shapePublicSession(
  db: SupabaseClient,
  data: EscrowSessionRow
): Promise<PublicEscrowSession | null> {
  let expiresAt: string | null = null;

  if (data.status === "active" && data.started_at) {
    const startedAt = new Date(data.started_at).getTime();
    const computedExpiry = startedAt + data.session_minutes * 60_000;
    if (Date.now() >= computedExpiry) {
      await db.from("escrow_sessions").update({ status: "expired" }).eq("id", data.id);
      return null;
    }
    expiresAt = new Date(computedExpiry).toISOString();
  }

  if (data.status === "cancelled" || data.status === "expired") {
    return null;
  }

  return {
    id: data.id,
    recipientName: data.recipient_name,
    amountEur: Number(data.amount_eur),
    issuedAt: data.issued_at,
    startedAt: data.started_at,
    sessionMinutes: data.session_minutes,
    expiresAt,
    status: data.status,
    terms: data.terms,
    minBalanceEur: Number(data.min_balance_eur),
  };
}

export const PUBLIC_SESSION_COLUMNS =
  "id, recipient_name, amount_eur, issued_at, started_at, session_minutes, status, terms, min_balance_eur";
