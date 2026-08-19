import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Coinbase Smart Wallet / Base Auth uses window.opener to send the OAuth
// result back to the tab that opened the popup. Next.js defaults to
// Cross-Origin-Opener-Policy: same-origin which breaks window.opener entirely.
// same-origin-allow-popups preserves the protection against external navigation
// while still allowing popups this page opens to communicate back via
// window.opener — which is exactly what the Coinbase auth popup requires.
//
// This middleware runs in both `next dev` and production, ensuring the header
// is present in every environment without relying on platform-specific config.
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: "/(.*)",
};
