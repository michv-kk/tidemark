'use client';
import React, { useMemo } from 'react';
import { Transaction } from '@/lib/types';
import { formatUSD } from '@/lib/formatters';
import { calcTotalVolume, calcMaxTransaction, calcActiveChains, calcTransactionsPerMinute } from '@/lib/transactionGenerator';
import { TrendingUp, Zap, Activity, Layers } from 'lucide-react';

interface Props { transactions: Transaction[] }

export default function StatsBar({ transactions }: Props) {
  const stats = useMemo(() => ({
    volume: calcTotalVolume(transactions),
    maxTx: calcMaxTransaction(transactions),
    chains: calcActiveChains(transactions),
    txPerMin: calcTransactionsPerMinute(transactions),
  }), [transactions]);

  const cards = [
    {
      icon: <TrendingUp size={18} className="text-cyan-400" />,
      label: 'Total Volume 24h',
      value: formatUSD(stats.volume, true),
      sub: `${transactions.length} transactions`,
    },
    {
      icon: <Zap size={18} className="text-yellow-400" />,
      label: 'Largest TX (session)',
      value: stats.maxTx ? formatUSD(stats.maxTx.value, true) : '—',
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
      label: 'TX / Minute',
      value: `${stats.txPerMin}`,
      sub: 'Live rate',
    },
  ];

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
