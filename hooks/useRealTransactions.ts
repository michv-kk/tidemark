'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Transaction, ChainId } from '@/lib/types';
import { fetchEtherscanTransactions } from '@/lib/api/etherscan';
import { fetchMempoolTransactions } from '@/lib/api/mempool';

// Solana is now fetched server-side inside /api/whale-txs and included
// in the same Redis-backed response — no separate client-side Solana call needed.

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

const ETHERSCAN_INTERVAL = 30_000;
const MEMPOOL_INTERVAL   = 20_000;
const MAX_TXS            = 1000;

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
  const oneMinAgo = Date.now() - 60_000;
  const txPerMinute = txs.filter(t => t.timestamp > oneMinAgo).length;
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

  // ── Fetch functions ───────────────────────────────────────────────────────

  const fetchEtherscan = useCallback(async (initial = false) => {
    if (initial) setStatus('etherscan', 'loading');
    try {
      const txs = await fetchEtherscanTransactions();
      if (txs.length > 0) {
        sourceSuccess.current.etherscan = true;
        // Solana txs are bundled inside the whale-txs response — mark solana ok too
        if (txs.some(t => t.chain === 'SOL')) {
          sourceSuccess.current.solana = true;
          setStatus('solana', 'ok');
        }
        addTxs(txs);
      }
      setStatus('etherscan', 'ok');
    } catch {
      setStatus('etherscan', 'error');
    }
  }, [setStatus, addTxs]);

  const fetchMempool = useCallback(async (initial = false) => {
    if (initial) setStatus('mempool', 'loading');
    try {
      const txs = await fetchMempoolTransactions();
      if (txs.length > 0) {
        sourceSuccess.current.mempool = true;
        addTxs(txs);
      }
      setStatus('mempool', 'ok');
    } catch {
      setStatus('mempool', 'error');
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

    Promise.allSettled([
      fetchEtherscan(true),
      fetchMempool(true),
    ]).then(() => {
      if (isMounted.current) {
        setIsLoading(false);
        // Solana is bundled in whale-txs; mark ok if not already set
        setStatus('solana', 'ok');
      }
    });

    return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => fetchEtherscan(false), ETHERSCAN_INTERVAL);
    return () => clearInterval(id);
  }, [fetchEtherscan]);

  useEffect(() => {
    const id = setInterval(() => fetchMempool(false), MEMPOOL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchMempool]);

  const isUsingFallback =
    !isLoading &&
    !sourceSuccess.current.etherscan &&
    !sourceSuccess.current.mempool;

  return {
    transactions,
    newTransactions,
    stats: calcStats(transactions),
    apiStatus,
    isLoading,
    isUsingFallback,
  };
}
