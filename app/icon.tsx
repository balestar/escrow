import { ImageResponse } from "next/og";

// Coinbase favicon — blue circle #0052FF with centred white square cutout.
// Exact brand proportions: square = 53.125% of diameter (Coinbase 2022 spec).
// Output at 64×64 for crisp display on retina screens.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#0052FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* 34px = 53.125% of 64px — exact Coinbase brand spec */}
        <div style={{ width: 34, height: 34, background: "#ffffff", flexShrink: 0 }} />
      </div>
    ),
    { ...size }
  );
}
