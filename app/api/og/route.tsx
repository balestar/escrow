import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const amount = searchParams.get("amount") ?? "—";
  const sender = searchParams.get("sender") ?? "Coinbase";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "1200px",
          height: "630px",
          background: "#ffffff",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Left blue panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            width: "420px",
            height: "630px",
            background: "#0052FF",
          }}
        >
          {/* Coinbase logo mark — inverted (white circle + blue square) for blue panel */}
          <svg width="120" height="120" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="28" fill="white" />
            <rect x="13.125" y="13.125" width="29.75" height="29.75" fill="#0052FF" />
          </svg>
          <div
            style={{
              color: "white",
              fontSize: "32px",
              fontWeight: "700",
              marginTop: "20px",
              letterSpacing: "-0.5px",
            }}
          >
            Coinbase
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: "16px",
              marginTop: "8px",
              letterSpacing: "0.5px",
            }}
          >
            USDC Pay
          </div>
        </div>

        {/* Right content panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 72px",
            flex: 1,
          }}
        >
          {/* "Payment request" badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#EEF3FF",
              borderRadius: "100px",
              padding: "6px 16px",
              width: "fit-content",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#0052FF",
              }}
            />
            <span style={{ color: "#0052FF", fontSize: "15px", fontWeight: "600" }}>
              Payment request
            </span>
          </div>

          {/* Amount */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: "700",
              color: "#0f172a",
              letterSpacing: "-2px",
              lineHeight: "1",
              marginBottom: "16px",
            }}
          >
            {amount}
          </div>

          {/* "From" sender */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "40px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "#0052FF",
                color: "white",
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              {sender.slice(0, 1).toUpperCase()}
            </div>
            <span style={{ color: "#64748b", fontSize: "20px" }}>
              From <span style={{ color: "#0f172a", fontWeight: "600" }}>{sender}</span>
            </span>
            {/* Verified badge */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#0052FF">
              <path
                fillRule="evenodd"
                d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* CTA button look */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0052FF",
              color: "white",
              fontSize: "18px",
              fontWeight: "600",
              borderRadius: "100px",
              padding: "18px 40px",
              width: "fit-content",
              gap: "10px",
            }}
          >
            Connect wallet to receive
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* Footer trust line */}
          <div
            style={{
              marginTop: "32px",
              color: "#94a3b8",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Secured by Coinbase · Multichain stablecoin checkout
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
