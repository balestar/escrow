import { NextRequest } from "next/server";

/**
 * Minimal bearer-token check for the admin API. The admin UI collects the
 * secret once client-side (kept in sessionStorage, never written to disk)
 * and sends it as `Authorization: Bearer <secret>` on every admin request.
 * No secret configured server-side means the admin surface is disabled.
 */
export function isAuthorizedAdmin(req: NextRequest): boolean {
  const configured = process.env.ESCROW_ADMIN_SECRET;
  if (!configured) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && token === configured;
}
