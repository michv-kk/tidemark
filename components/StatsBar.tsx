'use client';
import React, { useMemo } from 'react';
import { Transaction, ChainId } from '@/lib/types';
import { useCurrency } from '@/contexts/SettingsContext';
import { TrendingUp, Zap, Activity, Layers, Radio } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  isLive?: boolean;
  isLoading?: boolean;
}

function calcTotalVolume(txs: Transaction[]): { volume: number; count: number } {
  const oneDayAgo = Date.now() - 86_400_000;
  const recent = txs.filter(t => t.timestamp > oneDayAgo);
  return { volume: recent.reduce((sum, t) => sum + t.value, 0), count: recent.length };
}

function calcMaxTransaction(txs: Transaction[]): Transaction | null {
  if (txs.length === 0) return null;
  return txs.reduce((max, t) => (t.value > max.value ? t : max), txs[0]);
}

function calcActiveChains(txs: Transaction[]): ChainId[] {
  // Use 24h window — "active" means we received data from that chain today
  const oneDayAgo = Date.now() - 86_400_000;
  const active = new Set(txs.filter(t => t.timestamp > oneDayAgo).map(t => t.chain));
  return Array.from(active) as ChainId[];
}

function calcTransactionsPerHour(txs: Transaction[]): number {
  // Use a 6-hour rolling window for a smooth, stable rate — not a noisy 60s snapshot.
  // Divide by 6 to get avg transactions per hour.
  const sixHAgo = Date.now() - 6 * 3_600_000;
  const count   = txs.filter(t => t.timestamp > sixHAgo).length;
  return Math.round(count / 6);
}

export default function StatsBar({ transactions, isLive, isLoading }: Props) {
  const fmt = useCurrency();
  const stats = useMemo(() => ({
    vol24h: calcTotalVolume(transactions),
    maxTx: calcMaxTransaction(transactions),
    chains: calcActiveChains(transactions),
    txPerMin: calcTransactionsPerHour(transactions),
  }), [transactions]);

  const cards = [
    {
      icon: <TrendingUp size={18} className="text-cyan-400" />,
      label: 'Total Volume 24h',
      value: fmt(stats.vol24h.volume, true),
      sub: `${stats.vol24h.count} transactions (24h)`,
    },
    {
      icon: <Zap size={18} className="text-yellow-400" />,
      label: 'Largest TX (session)',
      value: stats.maxTx ? fmt(stats.maxTx.value, true) : '—',
      sub: stats.maxTx ? `${stats.maxTx.token} on ${stats.maxTx.chain}` : 'No data',
    },
    {
      icon: <Layers size={18} className="text-purple-400" />,
      label: 'Active Chains',
      value: stats.chains.length.toString(),
      sub: stats.chains.join(' · ') || 'Scanning...',
    },
    {
      icon: <Activity size={18} className="text-green-400" />,
      label: 'TX / Hour (avg)',
      value: `${stats.txPerMin}`,
      sub: isLive ? (
        <span className="flex items-center gap-1 text-green-400">
          <Radio size={9} />
          6h rolling avg
        </span>
      ) : '6h rolling avg',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-24" />
            </div>
            <div className="h-8 bg-white/5 rounded w-28 mb-1" />
            <div className="h-3 bg-white/5 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c, i) => (
        <div key={i} className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            {c.icon}
            <span className="text-xs text-gray-400 uppercase tracking-wider">{c.label}</span>
          </div>
          <div className="text-2xl font-bold text-white">{c.value}</div>
          <div className="text-xs text-gray-500 mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
