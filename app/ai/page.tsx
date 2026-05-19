'use client';
import React, { useState, useMemo } from 'react';
import { useRealTransactions } from '@/hooks/useRealTransactions';
import { Transaction, ChainId } from '@/lib/types';
import { formatUSD, formatTimeAgo } from '@/lib/formatters';
import { lookupWallet } from '@/lib/knownWallets';
import { Sparkles, Brain, Loader2, TrendingUp, Zap, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';

interface AiResult {
  insight: string;
  model: string;
  txCount: number;
  isMock: boolean;
  error?: string;
}

const CHAIN_COLORS: Record<ChainId, string> = {
  ETH: '#627EEA',
  BTC: '#F7931A',
  BSC: '#F0B90B',
  SOL: '#9945FF',
  ARB: '#28A0F0',
  MATIC: '#8247E5',
  AVAX: '#E84142',
  OP: '#FF0420',
  BASE: '#0052FF',
};

function ChainPie({ transactions }: { transactions: Transaction[] }) {
  const chainCounts = useMemo(() => {
    const counts: Record<string, { count: number; volume: number }> = {};
    for (const tx of transactions) {
      if (!counts[tx.chain]) counts[tx.chain] = { count: 0, volume: 0 };
      counts[tx.chain].count++;
      counts[tx.chain].volume += tx.value;
    }
    return Object.entries(counts)
      .map(([chain, data]) => ({ chain: chain as ChainId, ...data }))
      .sort((a, b) => b.volume - a.volume);
  }, [transactions]);

  const totalVolume = chainCounts.reduce((s, c) => s + c.volume, 0);

  // Simple CSS-based horizontal bar chart
  return (
    <div className="space-y-2.5">
      {chainCounts.slice(0, 6).map(({ chain, volume, count }) => {
        const pct = totalVolume > 0 ? (volume / totalVolume) * 100 : 0;
        const color = CHAIN_COLORS[chain] ?? '#6b7280';
        return (
          <div key={chain}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium text-white">{chain}</span>
                <span className="text-xs text-gray-500">{count} txs</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white">{pct.toFixed(1)}%</span>
                <span className="text-xs text-gray-500 ml-2">{formatUSD(volume, true)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopWhales({ transactions }: { transactions: Transaction[] }) {
  const whales = useMemo(() => {
    const addressMap = new Map<string, { volume: number; txCount: number; lastSeen: number }>();
    for (const tx of transactions) {
      for (const addr of [tx.from, tx.to]) {
        if (!addr || addr === 'unknown') continue;
        const existing = addressMap.get(addr) ?? { volume: 0, txCount: 0, lastSeen: 0 };
        existing.volume += tx.value;
        existing.txCount++;
        existing.lastSeen = Math.max(existing.lastSeen, tx.timestamp);
        addressMap.set(addr, existing);
      }
    }
    return Array.from(addressMap.entries())
      .map(([addr, data]) => ({ addr, ...data, label: lookupWallet(addr)?.label }))
      .filter(w => w.volume >= 1_000_000)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8);
  }, [transactions]);

  if (whales.length === 0) {
    return <p className="text-gray-500 text-sm">No whale wallets detected yet</p>;
  }

  return (
    <div className="space-y-2">
      {whales.map(({ addr, volume, txCount, lastSeen, label }, i) => (
        <div
          key={addr}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
        >
          <span className="text-xs text-gray-600 font-mono w-4">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">
                {label ?? `${addr.slice(0, 8)}...${addr.slice(-6)}`}
              </span>
              {label && (
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 flex-shrink-0">
                  Known
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 font-mono">{addr.slice(0, 16)}...</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-white">{formatUSD(volume, true)}</div>
            <div className="text-xs text-gray-500">{txCount} txs · {formatTimeAgo(lastSeen)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BiggestTxs({ transactions }: { transactions: Transaction[] }) {
  const top = useMemo(
    () => [...transactions].sort((a, b) => b.value - a.value).slice(0, 5),
    [transactions]
  );

  return (
    <div className="space-y-2">
      {top.map(tx => (
        <div
          key={tx.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: (CHAIN_COLORS[tx.chain] ?? '#6b7280') + '22', color: CHAIN_COLORS[tx.chain] ?? '#6b7280' }}
          >
            {tx.chain}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">
              {tx.amount.toFixed(2)} {tx.token}
            </div>
            <div className="text-xs text-gray-500">
              {tx.type} · {formatTimeAgo(tx.timestamp)}
              {tx.source && tx.source !== 'generated' && (
                <span className="ml-1.5 text-[9px] uppercase font-bold text-cyan-400/70">{tx.source}</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-yellow-400">{formatUSD(tx.value, true)}</div>
            <div className="text-xs text-gray-600 font-mono">{tx.hash.slice(0, 10)}...</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AiInsightsPage() {
  const { transactions, stats, isLoading, isUsingFallback } = useRealTransactions();
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<number | null>(null);

  const analyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: transactions.slice(0, 20) }),
      });
      const data = await res.json();
      setAiResult(data);
      setLastAnalyzed(Date.now());
    } catch (err) {
      setAiResult({
        insight: 'Failed to connect to AI analysis service. Please try again.',
        model: 'error',
        txCount: 0,
        isMock: true,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const realTxCount = transactions.filter(t => t.source && t.source !== 'generated').length;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-purple-400" />
          <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider">AI Powered</span>
        </div>
        <h1 className="text-2xl font-bold text-white">AI Whale Insights</h1>
        <p className="text-gray-500 text-sm mt-1">
          Claude AI analyzes whale patterns, accumulation signals and market impact
        </p>
      </div>

      {/* AI Analysis Card */}
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <div className="text-white font-semibold">Claude Whale Analyst</div>
              <div className="text-xs text-gray-500">
                {aiResult
                  ? `Analyzed ${aiResult.txCount} txs · Model: ${aiResult.model}`
                  : `${transactions.length} transactions ready to analyze`}
              </div>
            </div>
          </div>
          <button
            onClick={analyze}
            disabled={analyzing || isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              analyzing
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-400 hover:to-pink-500 shadow-lg shadow-purple-500/20'
            }`}
          >
            {analyzing ? (
              <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles size={14} /> {aiResult ? 'Re-analyze' : 'Analyze Feed'}</>
            )}
          </button>
        </div>

        {/* Insight result */}
        {aiResult ? (
          <div className="space-y-3">
            {aiResult.isMock ? (
              <div className="flex items-center gap-2 text-xs text-orange-400/80 bg-orange-400/10 border border-orange-400/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />
                {aiResult.error ? '⚠ Demo — AI service error, showing sample insight' : '⚠ Demo — add ANTHROPIC_API_KEY for live analysis'}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-green-400/80 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                <Sparkles size={12} />
                ✓ Powered by Claude · {aiResult.model}
              </div>
            )}
            <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              {aiResult.insight}
            </div>
            {lastAnalyzed && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <RefreshCw size={10} />
                Updated {formatTimeAgo(lastAnalyzed)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Brain size={32} className="mx-auto mb-3 text-purple-500/30" />
            <p className="text-sm">Click &quot;Analyze Feed&quot; to get AI-powered whale insights</p>
            <p className="text-xs text-gray-600 mt-1">
              {isUsingFallback ? 'Live feeds unavailable — no data yet' : `${realTxCount} real transactions loaded`}
            </p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-cyan-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">Total Volume</span>
          </div>
          <div className="text-xl font-bold text-white">{formatUSD(stats.totalVolume, true)}</div>
          <div className="text-xs text-gray-500 mt-1">{transactions.length} transactions</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-yellow-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">Largest TX</span>
          </div>
          <div className="text-xl font-bold text-white">
            {stats.biggestTx ? formatUSD(stats.biggestTx.value, true) : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.biggestTx ? `${stats.biggestTx.token} on ${stats.biggestTx.chain}` : 'No data'}
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <ChevronRight size={16} className="text-green-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">Live Sources</span>
          </div>
          <div className="text-xl font-bold text-white">{realTxCount}</div>
          <div className="text-xs text-gray-500 mt-1">real transactions</div>
        </div>
      </div>

      {/* Bottom grid: Chain distribution + Whales + Largest txs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Chain distribution */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Chain Distribution
          </h2>
          <ChainPie transactions={transactions} />
        </div>

        {/* Largest transactions */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" />
            Largest Transactions
          </h2>
          <BiggestTxs transactions={transactions} />
        </div>
      </div>

      {/* Top whale wallets */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-purple-400" />
          Top Whale Wallets (by session volume)
        </h2>
        <TopWhales transactions={transactions} />
      </div>
    </div>
  );
}
