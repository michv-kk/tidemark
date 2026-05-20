'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import TransactionCard from '@/components/TransactionCard';
import TransactionModal from '@/components/TransactionModal';
import StatsBar from '@/components/StatsBar';
import { Transaction, ChainId } from '@/lib/types';
import { useRealTransactions } from '@/hooks/useRealTransactions';
import { useAlerts } from '@/contexts/AlertsContext';
import { Filter, Pause, Play, Radio, AlertTriangle, Loader2, Wifi, WifiOff, ExternalLink } from 'lucide-react';

const CHAINS: ChainId[] = ['ETH', 'BTC', 'BSC', 'SOL', 'ARB', 'MATIC', 'AVAX', 'OP'];
const MIN_VALUES = [
  { label: 'All', value: 0 },
  { label: '$100K+', value: 100_000 },
  { label: '$500K+', value: 500_000 },
  { label: '$1M+', value: 1_000_000 },
  { label: '$10M+', value: 10_000_000 },
];

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { symbol: string; name: string };
  quoteToken: { symbol: string };
  volume: { h24: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  url?: string;
}

const CHAIN_BADGE_COLORS: Record<string, string> = {
  ethereum: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  bsc: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  arbitrum: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  polygon: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  base: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

function formatVol(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function LiveDexMarkets() {
  const [pairs, setPairs] = useState<DexPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        // Fetch top pairs for WETH and USDC to get a broad view
        const [ethRes, usdcRes] = await Promise.allSettled([
          fetch('https://api.dexscreener.com/latest/dex/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', { signal: AbortSignal.timeout(10000) }),
          fetch('https://api.dexscreener.com/latest/dex/tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', { signal: AbortSignal.timeout(10000) }),
        ]);

        const allPairs: DexPair[] = [];
        const seen = new Set<string>();

        for (const result of [ethRes, usdcRes]) {
          if (result.status !== 'fulfilled' || !result.value.ok) continue;
          const data = await result.value.json();
          const pairList: DexPair[] = data?.pairs ?? [];
          for (const p of pairList) {
            if (seen.has(p.pairAddress)) continue;
            seen.add(p.pairAddress);
            if ((p.volume?.h24 ?? 0) > 0) allPairs.push(p);
          }
        }

        // Sort by 24h volume, take top 5
        allPairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
        const top5 = allPairs.slice(0, 5);

        if (!cancelled) {
          setPairs(top5);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mb-5 rounded-xl border border-white/8 bg-white/2 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div>
          <span className="text-white text-sm font-semibold">24h DEX Pool Volumes</span>
          <span className="ml-2 text-xs text-gray-500">Top pairs by volume (not individual transactions)</span>
        </div>
        {loading && <Loader2 size={13} className="text-cyan-400 animate-spin" />}
      </div>

      {error ? (
        <div className="px-4 py-3 text-xs text-orange-400">Unable to load DEX data</div>
      ) : loading ? (
        <div className="divide-y divide-white/5">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
              <div className="w-12 h-4 bg-white/5 rounded" />
              <div className="flex-1 h-4 bg-white/5 rounded" />
              <div className="w-20 h-4 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : pairs.length === 0 ? (
        <div className="px-4 py-3 text-xs text-gray-500">No pairs found</div>
      ) : (
        <div className="divide-y divide-white/5">
          {pairs.map((pair, i) => {
            const chainKey = pair.chainId?.toLowerCase() ?? '';
            const badgeCls = CHAIN_BADGE_COLORS[chainKey] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';
            const chainLabel = chainKey.slice(0, 3).toUpperCase();
            const pairName = `${pair.baseToken.symbol}/${pair.quoteToken.symbol}`;
            const txCount = (pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0);
            const dexUrl = `https://dexscreener.com/${chainKey}/${pair.pairAddress}`;

            return (
              <div key={pair.pairAddress} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors">
                <span className="text-gray-600 text-xs w-4 text-center">{i + 1}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeCls} flex-shrink-0`}>{chainLabel}</span>
                <span className="text-white text-sm font-mono flex-1">{pairName}</span>
                <span className="text-green-400 text-sm font-semibold tabular-nums">{formatVol(pair.volume?.h24 ?? 0)}</span>
                <span className="text-gray-500 text-xs tabular-nums w-20 text-right">{txCount.toLocaleString()} txns</span>
                <a
                  href={dexUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-cyan-400 transition-colors ml-1"
                  title="View on DexScreener"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array(8).fill(0).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-white/2 p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/5 rounded w-32" />
              <div className="h-3 bg-white/5 rounded w-48" />
            </div>
            <div className="text-right space-y-1.5">
              <div className="h-4 bg-white/5 rounded w-20" />
              <div className="h-3 bg-white/5 rounded w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { addTransactionAlert } = useAlerts();
  const [paused, setPaused] = useState(false);
  const [chainFilter, setChainFilter] = useState<ChainId | 'ALL'>('ALL');
  const [minValue, setMinValue] = useState(0);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const { transactions, newTransactions, apiStatus, isLoading, isUsingFallback } = useRealTransactions();

  // Fire alerts for new whale transactions coming in from real sources
  const alertedIds = useRef(new Set<string>());
  useEffect(() => {
    if (newTransactions.length === 0) return;
    for (const tx of newTransactions) {
      if (alertedIds.current.has(tx.id)) continue;
      if (tx.source === 'generated') continue; // never alert on fake data
      if (tx.value >= 500_000) { // alert on transactions >= $500K
        addTransactionAlert(tx);
        alertedIds.current.add(tx.id);
      }
    }
  }, [newTransactions, addTransactionAlert]);

  const handleTxClick = useCallback((tx: Transaction) => {
    setSelectedTx(tx);
  }, []);

  const filtered = useMemo(() => {
    if (paused) return [];
    return transactions.filter(tx => {
      if (chainFilter !== 'ALL' && tx.chain !== chainFilter) return false;
      if (tx.value < minValue) return false;
      return true;
    });
  }, [transactions, chainFilter, minValue, paused]);

  const anyOk = apiStatus.etherscan === 'ok' || apiStatus.mempool === 'ok';
  const isLive = anyOk && !isUsingFallback;
  const realTxCount = transactions.filter(t => t.source !== 'generated').length;

  return (
    <div className="page-container">
      {/* Hero */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={11} className="text-cyan-400 animate-spin" />
              <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">Connecting to APIs...</span>
            </span>
          ) : isLive ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="text-xs text-green-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Radio size={11} />
                Live Feed
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <WifiOff size={11} className="text-orange-400" />
              <span className="text-xs text-orange-400 font-semibold uppercase tracking-wider">APIs Unavailable</span>
            </span>
          )}

          {/* Per-source status pills — only ETH and BTC */}
          <div className="flex gap-1 ml-1">
            {(['etherscan', 'mempool'] as const).map(src => (
              <span
                key={src}
                title={src === 'etherscan' ? 'Ethereum whale txs' : 'Bitcoin mempool'}
                className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                  apiStatus[src] === 'ok'
                    ? 'text-green-400 border-green-500/30 bg-green-500/10'
                    : apiStatus[src] === 'loading'
                    ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                    : 'text-red-400 border-red-500/30 bg-red-500/10'
                }`}
              >
                {src === 'etherscan' ? 'ETH' : 'BTC'}
              </span>
            ))}
          </div>

          {!isLoading && (
            <span className="text-xs text-gray-600 ml-1">
              {realTxCount} real transactions
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-white">Whale Transaction Monitor</h1>
        <p className="text-gray-500 text-sm mt-1">
          {isLive
            ? 'Live blockchain data from Etherscan & Mempool.space'
            : isLoading
            ? 'Fetching real-time blockchain data...'
            : 'Unable to connect to blockchain APIs'}
        </p>
      </div>

      {/* Stats — show real data only (zeros if loading) */}
      <StatsBar transactions={transactions} isLive={isLive} isLoading={isLoading} />

      {/* Live DEX Markets panel */}
      <LiveDexMarkets />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`filter-pill ${chainFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setChainFilter('ALL')}
          >
            All Chains
          </button>
          {CHAINS.map(c => (
            <button
              key={c}
              className={`filter-pill ${chainFilter === c ? 'active' : ''}`}
              onClick={() => setChainFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-gray-500" />
          {MIN_VALUES.map(v => (
            <button
              key={v.value}
              className={`filter-pill ${minValue === v.value ? 'active' : ''}`}
              onClick={() => setMinValue(v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPaused(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            paused
              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
        >
          {paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}
        </button>
      </div>

      {!isLoading && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">
            Showing <span className="text-white font-semibold">{filtered.length}</span> of{' '}
            <span className="text-white font-semibold">{transactions.length}</span> transactions
          </span>
          <span className="text-xs text-gray-600">
            {realTxCount > 0 ? (
              <span className="flex items-center gap-1 text-green-500/70">
                <Wifi size={10} />
                {realTxCount} live · auto-refreshing
              </span>
            ) : (
              <span className="text-orange-400/70 flex items-center gap-1">
                <AlertTriangle size={10} />
                API rate limited — retrying
              </span>
            )}
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : paused ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-3">
            <Pause size={20} className="text-yellow-400" />
          </div>
          <p className="text-gray-400 font-medium">Feed paused</p>
          <p className="text-gray-600 text-sm mt-1">Click Resume to continue monitoring</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
            <Filter size={20} className="text-gray-500" />
          </div>
          {transactions.length === 0 ? (
            <>
              <p className="text-gray-400 font-medium">Waiting for blockchain data</p>
              <p className="text-gray-600 text-sm mt-1">APIs are connected — transactions will appear momentarily</p>
            </>
          ) : (
            <>
              <p className="text-gray-400 font-medium">No transactions match your filters</p>
              <p className="text-gray-600 text-sm mt-1">Try adjusting the chain or value filters</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => (
            <TransactionCard key={tx.id} tx={tx} onClick={handleTxClick} />
          ))}
        </div>
      )}

      <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
