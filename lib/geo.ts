import { NextRequest } from "next/server";

export interface RequestGeo {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
}

/**
 * Best-effort geolocation for an incoming request. Netlify's Next.js runtime
 * forwards a base64-encoded `x-nf-geo` header (same shape as Edge Function
 * `context.geo`) on every request, so production reads are free and instant.
 * Local dev has no such header, so we fall back to a public IP-geolocation
 * lookup keyed off the client IP — best-effort only, never blocks the caller
 * for long and swallows failures.
 */
export async function resolveGeo(req: NextRequest): Promise<RequestGeo> {
  const userAgent = req.headers.get("user-agent");
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  const nfGeo = req.headers.get("x-nf-geo");
  if (nfGeo) {
    try {
      const decoded = JSON.parse(atob(nfGeo));
      return {
        ip,
        country: decoded.country?.name ?? decoded.country?.code ?? null,
        region: decoded.subdivision?.name ?? null,
        city: decoded.city ?? null,
        userAgent,
      };
    } catch {
      // fall through to IP lookup
    }
  }

  if (ip && ip !== "127.0.0.1" && ip !== "::1") {
    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          return {
            ip,
            country: data.country_name ?? null,
            region: data.region ?? null,
            city: data.city ?? null,
            userAgent,
          };
        }
      }
    } catch {
      // best-effort only
    }
  }

  return { ip, country: null, region: null, city: null, userAgent };
}

/** Rough browser label from a user-agent string, for a compact admin table. */
export function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" :
    "Unknown";
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" :
    "Unknown OS";
  return `${browser} · ${os}`;
}
