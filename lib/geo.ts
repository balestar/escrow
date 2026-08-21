import { NextRequest } from "next/server";

export interface RequestGeo {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
}

/** Convert ISO-3166-1 alpha-2 code → full English country name. */
function codeToCountryName(code: string | null): string | null {
  if (!code || code === "XX" || code === "T1") return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Best-effort geolocation for an incoming request.
 *
 * Priority order:
 *  1. Cloudflare Pages/Workers — cf-connecting-ip + cf-ipcountry + cf-ipcity + cf-region
 *     (free, accurate, zero latency — always present on Cloudflare)
 *  2. Netlify runtime — x-nf-client-connection-ip + x-nf-geo base64 blob
 *  3. x-forwarded-for + ip-api.com lookup (local dev / other hosts, best-effort)
 */
export async function resolveGeo(req: NextRequest): Promise<RequestGeo> {
  const userAgent = req.headers.get("user-agent");

  // ── 1. Cloudflare ────────────────────────────────────────────────────────
  const cfIp = req.headers.get("cf-connecting-ip");
  const cfCountryCode = req.headers.get("cf-ipcountry");
  const cfCity = req.headers.get("cf-ipcity");
  const cfRegion =
    req.headers.get("cf-region") ??
    req.headers.get("cf-region-code") ??
    null;

  if (cfIp || cfCountryCode) {
    return {
      ip: cfIp,
      country: codeToCountryName(cfCountryCode),
      region: cfRegion,
      city: cfCity,
      userAgent,
    };
  }

  // ── 2. Netlify ───────────────────────────────────────────────────────────
  const nfIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  const nfGeo = req.headers.get("x-nf-geo");
  if (nfGeo) {
    try {
      const decoded = JSON.parse(atob(nfGeo));
      return {
        ip: nfIp,
        country: decoded.country?.name ?? codeToCountryName(decoded.country?.code) ?? null,
        region: decoded.subdivision?.name ?? null,
        city: decoded.city ?? null,
        userAgent,
      };
    } catch {
      // fall through
    }
  }

  // ── 3. Fallback: ip-api.com (no key needed, 45 req/min free) ─────────────
  const fallbackIp =
    nfIp ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  if (fallbackIp && fallbackIp !== "127.0.0.1" && fallbackIp !== "::1") {
    try {
      const res = await fetch(
        `http://ip-api.com/json/${fallbackIp}?fields=status,country,regionName,city`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          return {
            ip: fallbackIp,
            country: data.country ?? null,
            region: data.regionName ?? null,
            city: data.city ?? null,
            userAgent,
          };
        }
      }
    } catch {
      // best-effort only
    }
  }

  return { ip: fallbackIp, country: null, region: null, city: null, userAgent };
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
