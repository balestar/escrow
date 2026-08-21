import { NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import crypto from "crypto";

export const runtime = "nodejs";

// Coinbase Developer Platform Onramp v2 — session token endpoint
// Requires CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY env vars.
// Without them, falls back to the legacy appId URL.

interface DestinationWallet {
  address: string;
  blockchains: string[];
  assets: string[];
}

async function buildJWT(keyName: string, privateKeyPem: string): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyName, nonce: crypto.randomBytes(16).toString("hex") })
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("2m")
    .setSubject(keyName)
    .setIssuer(keyName)
    .setAudience(["cdp_service"])
    .sign(privateKey);
}

export async function POST(req: NextRequest) {
  try {
    const { address, blockchains = ["ethereum", "polygon", "base"], assets = ["USDT", "USDC"] } =
      await req.json();

    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    const keyName = process.env.CDP_API_KEY_NAME;
    const privateKeyPem = process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const projectId = process.env.NEXT_PUBLIC_COINBASE_PROJECT_ID;

    const destinationWallets: DestinationWallet[] = [{ address, blockchains, assets }];

    // If we have server-side CDP credentials, generate a session token (v2 approach)
    if (keyName && privateKeyPem) {
      const jwt = await buildJWT(keyName, privateKeyPem);

      const response = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ destination_wallets: destinationWallets }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Coinbase Onramp token error:", err);
        // Fall through to appId fallback below
      } else {
        const { token } = await response.json();
        const url = `https://pay.coinbase.com/buy?sessionToken=${token}`;
        return NextResponse.json({ url });
      }
    }

    // Fallback: use appId + destinationWallets (v1 — no server auth needed)
    if (projectId) {
      const url = `https://pay.coinbase.com/buy/select-asset?appId=${projectId}&defaultAsset=USDT&defaultNetwork=ethereum&destinationWallets=${encodeURIComponent(JSON.stringify(destinationWallets))}`;
      return NextResponse.json({ url });
    }

    // Last resort — generic Coinbase buy page
    return NextResponse.json({ url: "https://www.coinbase.com/buy/usdt" });
  } catch (err) {
    console.error("onramp-token route error:", err);
    return NextResponse.json({ url: "https://www.coinbase.com/buy/usdt" });
  }
}
