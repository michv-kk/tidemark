"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

interface SourceStatus { ok: boolean; label: string; fullName: string; url: string }

async function checkEtherscan(): Promise<boolean> {
  try {
    const r = await fetch("/api/gas", { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

async function checkSolana(): Promise<boolean> {
  try {
    const r = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json();
    return d.result === "ok";
  } catch { return false; }
}

async function checkMempool(): Promise<boolean> {
  try {
    const r = await fetch("https://mempool.space/api/blocks/tip/height", { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

async function checkDexScreener(): Promise<boolean> {
  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

async function checkCoinGecko(): Promise<boolean> {
  try {
    // Use proxy to avoid CORS blocks
    const r = await fetch("/api/coingecko?path=%2Fping", { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

const SOURCES = [
  { key: "etherscan",   label: "EVM", fullName: "Etherscan V2 (ETH · BASE · ARB)", url: "etherscan.io",              check: checkEtherscan },
  { key: "mempool",     label: "BTC", fullName: "Mempool.space",                   url: "mempool.space",             check: checkMempool },
  { key: "solana",      label: "SOL", fullName: "Solana public RPC",               url: "api.mainnet-beta.solana.com", check: checkSolana },
  { key: "dexscreener", label: "DEX", fullName: "DexScreener",                     url: "dexscreener.com",           check: checkDexScreener },
  { key: "coingecko",   label: "CG",  fullName: "CoinGecko",                       url: "coingecko.com",             check: checkCoinGecko },
] as const;

export function ApiStatusBar() {
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  const [expanded, setExpanded] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const runChecks = async () => {
    const results = await Promise.allSettled(SOURCES.map(s => s.check()));
    const next: Record<string, SourceStatus> = {};
    SOURCES.forEach((s, i) => {
      const ok = results[i].status === "fulfilled" && (results[i] as PromiseFulfilledResult<boolean>).value;
      next[s.key] = { ok, label: s.label, fullName: s.fullName, url: s.url };
    });
    setStatuses(next);
    setLastCheck(Date.now());
  };

  useEffect(() => {
    runChecks();
    const id = setInterval(runChecks, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:bg-white/[0.06]"
        title="API Connection Status — click for details"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">DATA</span>
        <div className="flex items-center gap-1">
          {SOURCES.map(({ key, label }) => {
            const s = statuses[key];
            const ok = s?.ok ?? false;
            const isLoading = !s;
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  isLoading ? "text-gray-600" : ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  isLoading ? "bg-gray-600 animate-pulse" : ok ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]" : "bg-red-400"
                }`} />
                {label}
              </span>
            );
          })}
        </div>
      </button>

      {expanded && (
        <div
          className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/10 bg-[#0d1421]/98 p-4 shadow-2xl backdrop-blur-sm"
          onMouseLeave={() => setExpanded(false)}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400/80">Data Sources</span>
            {lastCheck && (
              <span className="text-[10px] text-gray-500">Updated {format(lastCheck, "HH:mm:ss")}</span>
            )}
          </div>

          <div className="space-y-2">
            {SOURCES.map(({ key, fullName, url }) => {
              const s = statuses[key];
              const ok = s?.ok ?? false;
              const isLoading = !s;
              return (
                <div key={key} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${
                      isLoading ? "bg-gray-600 animate-pulse"
                        : ok ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                        : "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
                    }`} />
                    <div>
                      <p className="text-xs font-medium text-white">{fullName}</p>
                      <p className="text-[10px] text-gray-500">{url}</p>
                    </div>
                  </div>
                  <p className={`text-xs font-bold ${isLoading ? "text-gray-500" : ok ? "text-emerald-400" : "text-red-400"}`}>
                    {isLoading ? "Checking…" : ok ? "Live" : "Error"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] text-gray-600">
            Transactions: Etherscan V2 (ETH·BASE·ARB) + Mempool.space (BTC) + Solana RPC<br />
            Prices &amp; charts: CoinGecko free tier
          </div>
        </div>
      )}
    </div>
  );
}
