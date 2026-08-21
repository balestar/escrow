import { ImageResponse } from "next/og";

// Favicon rendered as the correct Coinbase logomark:
// blue circle #0052FF with a centred white square (no rounded corners),
// square is ~53% of the circle diameter — matching the official 2022 mark.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#0052FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* 17 × 17 white square — 53 % of 32 px diameter, no border-radius */}
        <div style={{ width: 17, height: 17, background: "#ffffff" }} />
      </div>
    ),
    { ...size }
  );
}
