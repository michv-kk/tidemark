import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const revalidate = 30;
export const maxDuration = 25;

// ─── Redis accumulator ────────────────────────────────────────────────────────
const redis = (
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null
);
const REDIS_KEY = 'tidemark_whale_txs_v1';
const REDIS_MAX = 50_000;  // safety cap only — 24h rolling window is the real limit
const REDIS_TTL = 25 * 3_600;  // 25h — slightly longer than cutoff so Redis never expires early
const CUTOFF_MS = 24 * 3_600_000; // 24h rolling window — auto-prunes old transactions
const MIN_USD   = 100_000; // $100K minimum — all whale transactions

// ─── Prices ───────────────────────────────────────────────────────────────────

interface Prices { btc: number; eth: number; }

async function getPrices(): Promise<Prices> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    );
    const d = await res.json();
    return { btc: d?.bitcoin?.usd ?? 77_000, eth: d?.ethereum?.usd ?? 2_500 };
  } catch {
    return { btc: 77_000, eth: 2_500 };
  }
}

// ─── Strategy 1: Etherscan V2 (ETH, ARB, MATIC) ──────────────────────────────

const API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

interface TokenCfg { contractAddress: string; symbol: string; decimals: number; priceKey?: 'eth' | 'btc'; }
interface ChainCfg  { chainId: string; label: string; idPrefix: string; tokens: TokenCfg[]; }

const ETHERSCAN_CHAINS: ChainCfg[] = [
  {
    chainId: '1', label: 'ETH', idPrefix: 'eth',
    tokens: [
      { contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
      { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8, priceKey: 'btc' },
      { contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    chainId: '42161', label: 'ARB', idPrefix: 'arb',
    tokens: [
      { contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
      { contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    chainId: '137', label: 'MATIC', idPrefix: 'matic',
    tokens: [
      { contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
    ],
  },
];

interface RawEthTx { hash: string; from: string; to: string; value: string; timeStamp: string; blockNumber: string; }

function parseTxList(
  txList: RawEthTx[], label: string, idPrefix: string,
  token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>,
): object[] {
  const results: object[] = [];
  for (const tx of txList) {
    const id = `${idPrefix}-${tx.hash}`;
    if (seen.has(id)) continue;
    const ts = parseInt(tx.timeStamp, 10);
    if (ts < oneDayAgo) continue;
    const raw = Number(tx.value) / Math.pow(10, token.decimals);
    const val = token.priceKey === 'btc' ? raw * prices.btc
              : token.priceKey === 'eth' ? raw * prices.eth : raw;
    if (val < MIN_USD) continue;
    seen.add(id);
    results.push({ id, hash: tx.hash, chain: label, from: tx.from ?? '', to: tx.to ?? '',
      value: val, amount: raw, token: token.symbol, timestamp: ts * 1000,
      blockNumber: parseInt(tx.blockNumber, 10), type: 'transfer', isWhale: val >= 500_000, source: 'etherscan' });
  }
  return results;
}

async function fetchEtherscanChain(chain: ChainCfg, token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>) {
  const url = `https://api.etherscan.io/v2/api?chainid=${chain.chainId}&module=account&action=tokentx` +
    `&contractaddress=${token.contractAddress}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];
    return parseTxList(data.result, chain.label, chain.idPrefix, token, prices, oneDayAgo, seen);
  } catch { return []; }
}

// ─── Strategy 2: eth_getLogs via public RPC (BSC, AVAX) ──────────────────────

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface RpcChainCfg {
  label: string; idPrefix: string; rpcUrl: string;
  blockTime: number; lookbackBlocks: number;
  tokens: { address: string; symbol: string; decimals: number }[];
}

const RPC_CHAINS: RpcChainCfg[] = [
  {
    label: 'BSC', idPrefix: 'bsc', rpcUrl: 'https://bsc-rpc.publicnode.com',
    blockTime: 3, lookbackBlocks: 7200, // 7200 × 3s = 6h lookback
    tokens: [
      { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
      { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
    ],
  },
  {
    label: 'AVAX', idPrefix: 'avax', rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
    blockTime: 2, lookbackBlocks: 10800,
    tokens: [
      { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6e', symbol: 'USDC', decimals: 6 },
      { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', decimals: 6 },
    ],
  },
];

interface EthLog { transactionHash: string; blockNumber: string; data: string; topics: string[]; }

async function rpcPost(url: string, method: string, params: unknown[]): Promise<unknown> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.error) return null;
    return json?.result ?? null;
  } catch { return null; }
}

function hex(n: number): string { return '0x' + n.toString(16); }

async function fetchRpcChain(chain: RpcChainCfg, prices: Prices, seen: Set<string>) {
  const latestHex = await rpcPost(chain.rpcUrl, 'eth_blockNumber', []) as string | null;
  if (!latestHex) return [];
  const latestBlock = parseInt(latestHex, 16);
  const fromBlock   = hex(latestBlock - chain.lookbackBlocks);
  const nowMs = Date.now();
  const results: object[] = [];

  const tokenResults = await Promise.allSettled(
    chain.tokens.map(async (token) => {
      const logs = await rpcPost(chain.rpcUrl, 'eth_getLogs', [{
        fromBlock, toBlock: 'latest', address: token.address, topics: [TRANSFER_TOPIC],
      }]) as EthLog[] | null;
      if (!Array.isArray(logs)) return [];
      const tokenRes: object[] = [];
      for (const log of logs) {
        const id = `${chain.idPrefix}-${log.transactionHash}-${log.blockNumber}`;
        if (seen.has(id)) continue;
        const raw = parseInt(log.data, 16) / Math.pow(10, token.decimals);
        if (raw < MIN_USD) continue;
        const blockNum    = parseInt(log.blockNumber, 16);
        const estimatedTs = nowMs - (latestBlock - blockNum) * chain.blockTime * 1000;
        const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : 'unknown';
        const to   = log.topics[2] ? '0x' + log.topics[2].slice(26) : 'unknown';
        seen.add(id);
        tokenRes.push({ id, hash: log.transactionHash, chain: chain.label,
          from, to, value: raw, amount: raw, token: token.symbol,
          timestamp: estimatedTs, blockNumber: blockNum,
          type: 'transfer', isWhale: raw >= 500_000, source: 'rpc' });
      }
      return tokenRes;
    })
  );
  for (const r of tokenResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return results;
}

// ─── Strategy 3: Bitcoin via mempool.space ───────────────────────────────────
// Two modes depending on how many BTC txs are already in Redis:
//
//  SPARSE  (storedBtcCount < 60) — first deploy or after a Redis wipe:
//    Fetch 72 blocks (≈ 12h) in parallel, 1 page each (25 txs, highest-fee).
//    High-value transactions typically pay competitive fees → they appear here.
//    One call seeds Redis with 12h of BTC history immediately.
//
//  NORMAL  (storedBtcCount ≥ 60) — steady state:
//    Fetch 6 most recent blocks (≈ 1h), 4 pages each (100 txs).
//    Redis rolling window fills the rest of the 24h window.

type MempoolBlock = { id: string; height: number; timestamp: number };
type MempoolTx = {
  txid: string;
  vin:  Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
  status?: { block_height?: number; block_time?: number };
};

async function fetchBitcoin(
  prices: Prices,
  seen: Set<string>,
  storedBtcCount: number,
): Promise<object[]> {
  const results: object[] = [];
  const cutoffMs  = Date.now() - CUTOFF_MS;
  const isSparse  = storedBtcCount < 60;
  const PAGES     = isSparse ? 1 : 4;  // pages per block (25 txs each)

  // ── Step 1: Gather block metadata ─────────────────────────────────────────
  let allBlocks: MempoolBlock[] = [];
  try {
    const firstRes = await fetch('https://mempool.space/api/blocks', {
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!firstRes.ok) return results;
    const firstBatch: MempoolBlock[] = await firstRes.json();
    if (!Array.isArray(firstBatch) || firstBatch.length === 0) return results;
    allBlocks.push(...firstBatch);

    if (isSparse) {
      // Fetch additional batches (going backwards) in parallel to cover ≈12h
      const oldestHeight = firstBatch[firstBatch.length - 1].height - 1;
      const extraBatches = 7; // 7 × 10 = 70 more blocks → total 80, use 72 within 24h
      const batchResults = await Promise.allSettled(
        Array.from({ length: extraBatches }, (_, i) =>
          fetch(`https://mempool.space/api/blocks/${oldestHeight - i * 10}`, {
            cache: 'no-store', signal: AbortSignal.timeout(10_000),
          }).then(r => r.ok ? r.json() as Promise<MempoolBlock[]> : [])
        )
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) allBlocks.push(...r.value);
      }
    }
  } catch { return results; }

  // Filter to within 24h window and cap
  const targetBlocks = allBlocks
    .filter(b => b.timestamp * 1000 > cutoffMs)
    .slice(0, isSparse ? 72 : 6);

  // ── Step 2: Fetch transactions for every block in parallel ─────────────────
  // All blocks AND all pages within each block run concurrently.
  const blockResults = await Promise.allSettled(
    targetBlocks.map(async (block) => {
      const pageFetches = await Promise.allSettled(
        Array.from({ length: PAGES }, (_, page) =>
          fetch(`https://mempool.space/api/block/${block.id}/txs/${page * 25}`, {
            cache: 'no-store', signal: AbortSignal.timeout(8_000),
          }).then(r => r.ok ? r.json() as Promise<MempoolTx[]> : [])
        )
      );

      const out: object[] = [];
      for (const pf of pageFetches) {
        if (pf.status !== 'fulfilled' || !Array.isArray(pf.value)) continue;
        for (const tx of pf.value) {
          const id = `btc-${tx.txid}`;
          if (seen.has(id)) continue;
          const totalSats = tx.vout.reduce((s, o) => s + (o.value ?? 0), 0);
          const btcAmt   = totalSats / 1e8;
          const usd      = btcAmt * prices.btc;
          if (usd < MIN_USD) continue;
          const blockTime = tx.status?.block_time;
          if (!blockTime) continue;
          seen.add(id);
          out.push({
            id, hash: tx.txid, chain: 'BTC',
            from: tx.vin?.[0]?.prevout?.scriptpubkey_address ?? 'unknown',
            to:   tx.vout?.[0]?.scriptpubkey_address ?? 'unknown',
            value: usd, amount: btcAmt, token: 'BTC',
            timestamp: blockTime * 1000,
            blockNumber: tx.status?.block_height ?? 0,
            type: 'transfer', isWhale: usd >= 500_000, source: 'mempool',
          });
        }
      }
      return out;
    })
  );

  for (const r of blockResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return results;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const [pricesResult] = await Promise.allSettled([getPrices()]);
  const prices: Prices = pricesResult.status === 'fulfilled' ? pricesResult.value : { btc: 77_000, eth: 2_500 };
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

  // 1. Load stored history from Redis
  type TxRecord = { id: string; timestamp: number; chain?: string; [k: string]: unknown };
  let stored: TxRecord[] = [];
  if (redis) {
    try {
      const v1Data = await redis.get<TxRecord[]>(REDIS_KEY);
      const cutoffLoad = Date.now() - CUTOFF_MS;
      stored = (v1Data ?? [])
        .filter(t => t.timestamp > cutoffLoad)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch { stored = []; }
  }

  const seen         = new Set<string>(stored.map(t => t.id));
  const freshTxs: object[] = [];
  // How many BTC txs are already stored — determines sparse vs normal fetch mode
  const storedBtcCount = stored.filter(t => t.chain === 'BTC').length;

  // 2. Fetch all chains in parallel
  const [ethResults, rpcResults, btcResult] = await Promise.allSettled([
    // Etherscan V2 — ETH, ARB, MATIC
    API_KEY
      ? Promise.allSettled(ETHERSCAN_CHAINS.flatMap(c => c.tokens.map(t => fetchEtherscanChain(c, t, prices, oneDayAgo, seen))))
      : Promise.resolve([]),

    // eth_getLogs RPC — BSC, AVAX
    Promise.allSettled(RPC_CHAINS.map(c => fetchRpcChain(c, prices, seen))),

    // Bitcoin — smart sparse/normal mode via mempool.space
    fetchBitcoin(prices, seen, storedBtcCount),
  ]);

  function collectSettled(r: PromiseSettledResult<PromiseSettledResult<object[]>[]>) {
    if (r.status === 'fulfilled')
      for (const x of r.value)
        if (x.status === 'fulfilled') freshTxs.push(...x.value);
  }

  collectSettled(ethResults as PromiseSettledResult<PromiseSettledResult<object[]>[]>);
  collectSettled(rpcResults as PromiseSettledResult<PromiseSettledResult<object[]>[]>);
  if (btcResult.status === 'fulfilled') freshTxs.push(...btcResult.value);

  // 3. Merge, deduplicate — 24h rolling window is the only real limit
  // REDIS_MAX (50K) is a safety valve that should never be reached in normal operation.
  const cutoff = Date.now() - CUTOFF_MS;
  const byId = new Map<string, TxRecord>();
  for (const t of ([...freshTxs, ...stored] as TxRecord[])) byId.set(t.id, t);
  const merged = Array.from(byId.values())
    .filter(t => t.timestamp > cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, REDIS_MAX); // safety only

  // 4. Persist to Redis
  if (redis && freshTxs.length > 0) {
    try { await redis.set(REDIS_KEY, merged, { ex: REDIS_TTL }); } catch {}
  }

  // 5. Return
  return NextResponse.json(merged, { headers: { 'Cache-Control': 'public, max-age=25' } });
}
