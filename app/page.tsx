'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TransactionCard from '@/components/TransactionCard';
import TransactionModal from '@/components/TransactionModal';
import StatsBar from '@/components/StatsBar';
import { Transaction, ChainId } from '@/lib/types';
import { generateTransaction, generateInitialTransactions } from '@/lib/transactionGenerator';
import { useAlerts } from '@/contexts/AlertsContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Filter, Pause, Play } from 'lucide-react';

const CHAINS: ChainId[] = ['ETH', 'BTC', 'BSC', 'SOL', 'ARB', 'MATIC', 'AVAX', 'OP'];
const MIN_VALUES = [
  { label: 'All', value: 0 },
  { label: '$100K+', value: 100_000 },
  { label: '$500K+', value: 500_000 },
  { label: '$1M+', value: 1_000_000 },
  { label: '$10M+', value: 10_000_000 },
];

export default function DashboardPage() {
  const { addTransactionAlert } = useAlerts();
  const { settings } = useSettings();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [paused, setPaused] = useState(false);
  const [chainFilter, setChainFilter] = useState<ChainId | 'ALL'>('ALL');
  const [minValue, setMinValue] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    setTxs(generateInitialTransactions(50));
  }, []);

  useEffect(() => {
    if (paused) { clearInterval(intervalRef.current); return; }
    const delay = Math.max(800, (settings.autoRefresh * 1000) / 8);
    intervalRef.current = setInterval(() => {
      const tx = generateTransaction();
      setTxs(prev => [tx, ...prev].slice(0, 200));
      if (tx.isWhale && tx.value >= settings.minWhaleSize) {
        addTransactionAlert(tx);
      }
    }, delay);
    return () => clearInterval(intervalRef.current);
  }, [paused, settings.autoRefresh, settings.minWhaleSize, addTransactionAlert]);

  const filtered = useMemo(() => {
    return txs.filter(tx => {
      if (chainFilter !== 'ALL' && tx.chain !== chainFilter) return false;
      if (tx.value < minValue) return false;
      return true;
    });
  }, [txs, chainFilter, minValue]);

  return (
    <div className="page-container">
      {/* Hero */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="live-dot" />
          <span className="text-xs text-green-400 font-semibold uppercase tracking-wider">Live Feed</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Whale Transaction Monitor</h1>
        <p className="text-gray-500 text-sm mt-1">
          Real-time blockchain activity across ETH, BTC, SOL, ARB and more
        </p>
      </div>

      {/* Stats */}
      <StatsBar transactions={txs} />

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

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">
          Showing <span className="text-white font-semibold">{filtered.length}</span> of {txs.length} transactions
        </span>
        <button
          onClick={() => setTxs(generateInitialTransactions(50))}
          className="text-xs text-gray-500 hover:text-cyan-400 transition-colors"
        >
          Reset feed
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
            <Filter size={20} className="text-gray-500" />
          </div>
          <p className="text-gray-400 font-medium">No transactions match your filters</p>
          <p className="text-gray-600 text-sm mt-1">Try adjusting the chain or value filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => (
            <TransactionCard key={tx.id} tx={tx} onClick={setSelectedTx} />
          ))}
        </div>
      )}

      <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
