'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Transaction, ChainId } from '@/lib/types';
import { fetchEtherscanTransactions } from '@/lib/api/etherscan';
import { fetchMempoolTransactions } from '@/lib/api/mempool';
import { fetchSolanaTransactions } from '@/lib/api/solana';

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
const SOLANA_INTERVAL    = 30_000;
const MAX_TXS            = 1000;
const STORAGE_KEY        = 'tidemark_whale_txs';
const STORAGE_MAX        = 500; // save fewer to localStorage (browser limit)

// ── localStorage helpers (SSR-safe) ──────────────────────────────────────────

function loadFromStorage(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Transaction[] = JSON.parse(raw);
    // Only keep transactions from the last 48 hours (avoid stale data)
    const cutoff = Date.now() - 48 * 3_600_000;
    return parsed.filter(t => t.timestamp > cutoff);
  } catch {
    return [];
  }
}

function saveToStorage(txs: Transaction[]) {
  try {
    // Save the newest STORAGE_MAX transactions
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, STORAGE_MAX)));
  } catch {
    // localStorage full — ignore
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function calcStats(txs: Transaction[]): TransactionStats {
  const totalVolume = txs.reduce((sum, t) => sum + t.value, 0);
  const biggestTx = txs.length > 0
    ? txs.reduce((max, t) => (t.value > max.value ? t : max), txs[0])
    : null;
  const oneDayAgo = Date.now() - 86_400_000;
  const activeChains = Array.from(
    new Set(txs.filter(t => t.timestamp > oneDayAgo).map(t => t.chain))
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

  // Load persisted transactions on first mount (before any API call)
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved.length > 0) {
      saved.forEach(t => seenIds.current.add(t.id));
      setTransactions(saved);
    }
  }, []);

  const setStatus = useCallback((key: SourceKey, status: SourceStatus) => {
    if (!isMounted.current) return;
    setApiStatus(prev => ({ ...prev, [key]: status }));
  }, []);

  const addTxs = useCallback((incoming: Transaction[]) => {
    if (!isMounted.current || incoming.length === 0) return;
    const brandNew = incoming.filter(t => !seenIds.current.has(t.id));
    brandNew.forEach(t => seenIds.current.add(t.id));
    if (brandNew.length > 0) setNewTransactions(brandNew);
    setTransactions(prev => {
      const merged = mergeTxs(prev, incoming);
      saveToStorage(merged); // persist after every update
      return merged;
    });
  }, []);

  // ── Fetch functions (loading status only on first call) ───────────────────

  const fetchEtherscan = useCallback(async (initial = false) => {
    if (initial) setStatus('etherscan', 'loading');
    try {
      const txs = await fetchEtherscanTransactions();
      if (txs.length > 0) {
        sourceSuccess.current.etherscan = true;
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

  const fetchSolana = useCallback(async (initial = false) => {
    if (initial) setStatus('solana', 'loading');
    try {
      const txs = await fetchSolanaTransactions();
      if (txs.length > 0) {
        sourceSuccess.current.solana = true;
        addTxs(txs);
      }
      setStatus('solana', 'ok');
    } catch {
      setStatus('solana', 'error');
    }
  }, [setStatus, addTxs]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true;
    if (initialDone.current) return;
    initialDone.current = true;

    Promise.allSettled([
      fetchEtherscan(true),
      fetchMempool(true),
      fetchSolana(true),
    ]).then(() => {
      if (isMounted.current) setIsLoading(false);
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

  useEffect(() => {
    const id = setInterval(() => fetchSolana(false), SOLANA_INTERVAL);
    return () => clearInterval(id);
  }, [fetchSolana]);

  const isUsingFallback =
    !isLoading &&
    !sourceSuccess.current.etherscan &&
    !sourceSuccess.current.mempool &&
    !sourceSuccess.current.solana;

  return {
    transactions,
    newTransactions,
    stats: calcStats(transactions),
    apiStatus,
    isLoading,
    isUsingFallback,
  };
}
