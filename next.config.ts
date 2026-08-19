import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
