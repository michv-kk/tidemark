'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Transaction, ChainId } from '@/lib/types';
import { fetchEtherscanTransactions } from '@/lib/api/etherscan';
import { fetchMempoolTransactions } from '@/lib/api/mempool';

export type SourceKey = 'etherscan' | 'mempool';
export type SourceStatus = 'loading' | 'ok' | 'error';

export interface ApiStatus {
  etherscan: SourceStatus;
  mempool: SourceStatus;
}

export interface TransactionStats {
  totalVolume: number;
  biggestTx: Transaction | null;
  activeChains: ChainId[];
  txPerMinute: number;
}

export interface UseRealTransactionsResult {
  transactions: Transaction[];
  newTransactions: Transaction[]; // transactions added since last render
  stats: TransactionStats;
  apiStatus: ApiStatus;
  isLoading: boolean;
  isUsingFallback: boolean;
}

const ETHERSCAN_INTERVAL = 15_000;
const MEMPOOL_INTERVAL = 20_000;
const MAX_TXS = 200;

function calcStats(txs: Transaction[]): TransactionStats {
  const totalVolume = txs.reduce((sum, t) => sum + t.value, 0);
  const biggestTx = txs.length > 0
    ? txs.reduce((max, t) => (t.value > max.value ? t : max), txs[0])
    : null;
  const oneHourAgo = Date.now() - 3_600_000;
  const activeChains = Array.from(
    new Set(txs.filter(t => t.timestamp > oneHourAgo).map(t => t.chain))
  ) as ChainId[];
  const oneMinAgo = Date.now() - 60_000;
  const txPerMinute = txs.filter(t => t.timestamp > oneMinAgo).length;

  return { totalVolume, biggestTx, activeChains, txPerMinute };
}

function mergeTxs(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const existingIds = new Set(existing.map(t => t.id));
  const newOnes = incoming.filter(t => !existingIds.has(t.id));
  return [...newOnes, ...existing].slice(0, MAX_TXS);
}

export function useRealTransactions(): UseRealTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [newTransactions, setNewTransactions] = useState<Transaction[]>([]);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    etherscan: 'loading',
    mempool: 'loading',
  });
  const [isLoading, setIsLoading] = useState(true);

  // Track which sources successfully returned data
  const sourceSuccess = useRef({ etherscan: false, mempool: false });
  const isMounted = useRef(true);
  // Track IDs we've already seen to detect truly new transactions
  const seenIds = useRef(new Set<string>());

  const setStatus = useCallback((key: SourceKey, status: SourceStatus) => {
    if (!isMounted.current) return;
    setApiStatus(prev => ({ ...prev, [key]: status }));
  }, []);

  const addTxs = useCallback((incoming: Transaction[]) => {
    if (!isMounted.current || incoming.length === 0) return;

    // Find genuinely new transactions (not seen before)
    const brandNew = incoming.filter(t => !seenIds.current.has(t.id));
    brandNew.forEach(t => seenIds.current.add(t.id));

    if (brandNew.length > 0) {
      setNewTransactions(brandNew);
    }

    setTransactions(prev => mergeTxs(prev, incoming));
  }, []);

  const fetchEtherscan = useCallback(async () => {
    setStatus('etherscan', 'loading');
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

  const fetchMempool = useCallback(async () => {
    setStatus('mempool', 'loading');
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

  // Initial load — fetch from all real sources simultaneously, no fake data
  useEffect(() => {
    isMounted.current = true;

    const init = async () => {
      // Fetch all real sources in parallel — no fake seed data
      await Promise.allSettled([fetchEtherscan(), fetchMempool()]);
      if (!isMounted.current) return;
      setIsLoading(false);
    };

    init();

    return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Etherscan polling — every 15s
  useEffect(() => {
    const id = setInterval(fetchEtherscan, ETHERSCAN_INTERVAL);
    return () => clearInterval(id);
  }, [fetchEtherscan]);

  // Mempool polling — every 20s
  useEffect(() => {
    const id = setInterval(fetchMempool, MEMPOOL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchMempool]);

  const isUsingFallback =
    !isLoading &&
    !sourceSuccess.current.etherscan &&
    !sourceSuccess.current.mempool;

  const stats = calcStats(transactions);

  return { transactions, newTransactions, stats, apiStatus, isLoading, isUsingFallback };
}
