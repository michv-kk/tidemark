'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Transaction, ChainId } from '@/lib/types';
import { fetchEtherscanTransactions } from '@/lib/api/etherscan';

// All chains (ETH, BTC, BSC, AVAX, ARB, MATIC) are now fetched server-side
// inside /api/whale-txs and accumulated in Redis. One endpoint, one source of truth.

export type SourceKey = 'etherscan' | 'mempool' | 'solana';
export type SourceStatus = 'loading' | 'ok' | 'error';

export interface ApiStatus {
  etherscan: SourceStatus;
  mempool: SourceStatus;
  solana: SourceStatus;
}

export interface TransactionStats {
  totalVolume: number;
  biggestTx: Transaction | null;
  activeChains: ChainId[];
  txPerMinute: number;
}

export interface UseRealTransactionsResult {
  transactions: Transaction[];
  newTransactions: Transaction[];
  stats: TransactionStats;
  apiStatus: ApiStatus;
  isLoading: boolean;
  isUsingFallback: boolean;
}

const POLL_INTERVAL = 30_000;
const MAX_TXS       = 1000;

// ── Stats ─────────────────────────────────────────────────────────────────────

function calcStats(txs: Transaction[]): TransactionStats {
  const oneDayAgo = Date.now() - 86_400_000;
  const last24h = txs.filter(t => t.timestamp > oneDayAgo);
  const totalVolume = last24h.reduce((sum, t) => sum + t.value, 0);
  const biggestTx = txs.length > 0
    ? txs.reduce((max, t) => (t.value > max.value ? t : max), txs[0])
    : null;
  const activeChains = Array.from(
    new Set(last24h.map(t => t.chain))
  ) as ChainId[];
  // 6-hour rolling average per hour — stable across all browsers, not noisy 60s snapshots
  const sixHAgo     = Date.now() - 6 * 3_600_000;
  const txPerMinute = Math.round(txs.filter(t => t.timestamp > sixHAgo).length / 6);
  return { totalVolume, biggestTx, activeChains, txPerMinute };
}

function mergeTxs(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const existingIds = new Set(existing.map(t => t.id));
  const newOnes = incoming.filter(t => !existingIds.has(t.id));
  // Sort newest-first across everything
  const merged = [...newOnes, ...existing];
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged.slice(0, MAX_TXS);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealTransactions(): UseRealTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [newTransactions, setNewTransactions] = useState<Transaction[]>([]);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    etherscan: 'loading',
    mempool:   'loading',
    solana:    'loading',
  });
  const [isLoading, setIsLoading] = useState(true);

  const sourceSuccess = useRef({ etherscan: false, mempool: false, solana: false });
  const isMounted     = useRef(true);
  const initialDone   = useRef(false);
  const seenIds       = useRef(new Set<string>());

  const setStatus = useCallback((key: SourceKey, status: SourceStatus) => {
    if (!isMounted.current) return;
    setApiStatus(prev => ({ ...prev, [key]: status }));
  }, []);

  const addTxs = useCallback((incoming: Transaction[]) => {
    if (!isMounted.current || incoming.length === 0) return;
    const brandNew = incoming.filter(t => !seenIds.current.has(t.id));
    brandNew.forEach(t => seenIds.current.add(t.id));
    if (brandNew.length > 0) setNewTransactions(brandNew);
    setTransactions(prev => mergeTxs(prev, incoming));
  }, []);

  // ── Single fetch — all chains come from the Redis-backed /api/whale-txs ──

  const fetchAll = useCallback(async (initial = false) => {
    if (initial) {
      setStatus('etherscan', 'loading');
      setStatus('mempool', 'loading');
      setStatus('solana', 'loading');
    }
    try {
      const txs = await fetchEtherscanTransactions(); // calls /api/whale-txs
      if (txs.length > 0) {
        sourceSuccess.current.etherscan = true;
        sourceSuccess.current.mempool   = true;
        sourceSuccess.current.solana    = true;
        addTxs(txs);
      }
      setStatus('etherscan', 'ok');
      setStatus('mempool',   'ok');
      setStatus('solana',    'ok');
    } catch {
      setStatus('etherscan', 'error');
      setStatus('mempool',   'error');
      setStatus('solana',    'error');
    }
  }, [setStatus, addTxs]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    try { localStorage.removeItem('tidemark_whale_txs'); } catch {}
  }, []);

  useEffect(() => {
    isMounted.current = true;
    if (initialDone.current) return;
    initialDone.current = true;

    fetchAll(true).then(() => {
      if (isMounted.current) setIsLoading(false);
    });

    return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => fetchAll(false), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  const isUsingFallback =
    !isLoading &&
    !sourceSuccess.current.etherscan;

  return {
    transactions,
    newTransactions,
    stats: calcStats(transactions),
    apiStatus,
    isLoading,
    isUsingFallback,
  };
}
