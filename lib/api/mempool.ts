import { Transaction } from '../types';

const BTC_PRICE_FALLBACK = 77000; // updated May 2025
const MIN_BTC_VALUE = 0.5; // 0.5 BTC minimum (~$38K)

interface MempoolTx {
  txid: string;
  vin: Array<{
    prevout?: {
      scriptpubkey_address?: string;
      value?: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value?: number;
  }>;
  fee?: number;
  status?: {
    block_height?: number;
    block_time?: number;
    confirmed?: boolean;
  };
  weight?: number;
}

interface MempoolBlock {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
}

async function getBtcPrice(): Promise<number> {
  try {
    // Use proxy to avoid CORS blocks and share rate-limit budget
    const res = await fetch(
      '/api/coingecko?path=%2Fsimple%2Fprice&ids=bitcoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return BTC_PRICE_FALLBACK;
    const data = await res.json();
    return data?.bitcoin?.usd ?? BTC_PRICE_FALLBACK;
  } catch {
    return BTC_PRICE_FALLBACK;
  }
}

async function fetchBlockTxs(blockHash: string, btcPrice: number): Promise<Transaction[]> {
  const results: Transaction[] = [];
  try {
    // Fetch first page of block transactions (25 per page)
    const res = await fetch(`https://mempool.space/api/block/${blockHash}/txs/0`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const txs: MempoolTx[] = await res.json();
    if (!Array.isArray(txs)) return [];

    for (const tx of txs) {
      const totalSats = tx.vout.reduce((sum, out) => sum + (out.value ?? 0), 0);
      const btcAmount = totalSats / 1e8;
      if (btcAmount < MIN_BTC_VALUE) continue;

      const usdValue = btcAmount * btcPrice;
      const fromAddr = tx.vin?.[0]?.prevout?.scriptpubkey_address ?? 'unknown';
      const toAddr = tx.vout?.[0]?.scriptpubkey_address ?? 'unknown';
      const blockTime = tx.status?.block_time;
      const blockHeight = tx.status?.block_height ?? 0;

      // All transactions fetched from confirmed blocks must have a real block_time.
      // Skip any tx without it rather than falling back to a fabricated timestamp.
      if (!blockTime) continue;
      const timestamp = blockTime * 1000;

      results.push({
        id: `btc-${tx.txid}`,
        hash: tx.txid,
        chain: 'BTC',
        from: fromAddr,
        to: toAddr,
        value: usdValue,
        amount: btcAmount,
        token: 'BTC',
        timestamp,
        blockNumber: blockHeight,
        type: 'transfer',
        isWhale: usdValue >= 500_000,
        source: 'mempool',
      });
    }
  } catch {
    // skip on error
  }
  return results;
}

export async function fetchMempoolTransactions(): Promise<Transaction[]> {
  try {
    const btcPrice = await getBtcPrice();

    // Get the last 3 confirmed blocks
    const blocksRes = await fetch('https://mempool.space/api/blocks', {
      signal: AbortSignal.timeout(10000),
    });
    if (!blocksRes.ok) return [];
    const blocks: MempoolBlock[] = await blocksRes.json();
    if (!Array.isArray(blocks) || blocks.length === 0) return [];

    // Fetch txs from the last 3 blocks in parallel
    const recentBlocks = blocks.slice(0, 3);
    const allTxArrays = await Promise.allSettled(
      recentBlocks.map(block => fetchBlockTxs(block.id, btcPrice))
    );

    const results: Transaction[] = [];
    const seen = new Set<string>();

    for (const r of allTxArrays) {
      if (r.status === 'fulfilled') {
        for (const tx of r.value) {
          if (!seen.has(tx.id)) {
            seen.add(tx.id);
            results.push(tx);
          }
        }
      }
    }

    return results.sort((a, b) => b.value - a.value);
  } catch {
    return [];
  }
}
