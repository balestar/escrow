import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_PUBLIC_* vars must be baked in at build time for client-side (ssr:false) components.
  // Cloudflare wrangler.toml [vars] are only available at Worker runtime, not during `next build`.
  // These are all public/non-secret values so it is safe to hard-code them here as fallbacks.
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID:
      process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmponqxux002e0dl1wo63dd60",
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lrvuasndxgkulquwcocn.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "zqBqigsMh0jMc8NShsCPUMTEDQO3rOpejiIc3f0CG8kVcNa/M78anOp1l/w6HhS9YkwmiBoiWrAMb0cI7M3QnA==",
    // Coinbase Developer Platform project ID — whitelists domains in keys.coinbase.com
    NEXT_PUBLIC_COINBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_COINBASE_PROJECT_ID ?? "09aafa9f-85e4-46f8-a1da-bc60ecee3345",
    // CDP Client API key — domain-restricted to coinbase.usdc-pay.com
    NEXT_PUBLIC_COINBASE_CLIENT_API_KEY:
      process.env.NEXT_PUBLIC_COINBASE_CLIENT_API_KEY ?? "MAwf8wLv2TUe6NXL5Y6myV3MyvjVvsPK",
    // Primary domain — all session links and redirects use this
    NEXT_PUBLIC_ENTRY_DOMAIN:
      process.env.NEXT_PUBLIC_ENTRY_DOMAIN ?? "https://coinbase.usdc-pay.com",
    NEXT_PUBLIC_COINBASE_DOMAIN:
      process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com",
  },

  // Coinbase Smart Wallet / Base Auth uses window.opener to pass the OAuth
  // result back to the parent window. Next.js defaults to COOP: same-origin
  // which blocks that channel. Changing to same-origin-allow-popups lets
  // popups opened by this page still talk back via window.opener while still
  // isolating this page from external navigations.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Optional Privy features we don't use — stub them out to keep builds clean.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@farcaster/mini-app-solana": false,
      "@stripe/crypto": false,
      "@stripe/react-connect-js": false,
    };
    return config;
  },
};

export default nextConfig;
