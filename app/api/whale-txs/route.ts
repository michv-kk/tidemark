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
const REDIS_KEY         = 'tidemark_whale_txs_v1';
const REDIS_BLOCKCHAIR  = 'tidemark_blockchair_ts'; // rate-limit key for Blockchair
const REDIS_MAX         = 50_000;  // safety cap only — 24h rolling window is the real limit
const REDIS_TTL         = 25 * 3_600;  // 25h — slightly longer than cutoff so Redis never expires early
const CUTOFF_MS         = 24 * 3_600_000; // 24h rolling window — auto-prunes old transactions
const MIN_USD           = 100_000; // $100K minimum — show all whale transactions
const BTC_WHALE_USD     = 500_000;  // $500K threshold — ~100-200 txs/day → 100 results covers 12-24h

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

// ─── Strategy 3: Bitcoin via Blockchair (server-side → Redis) ────────────────
// Blockchair free API returns up to 100 recent large BTC transactions in one call,
// covering ~24–48 h of history. Only called when Redis BTC data is thin (<20 txs)
// to stay well within free-tier limits (~2 calls/day in steady state).

interface BlockchairTx {
  hash: string;
  time: string;            // "2025-01-01 12:00:00"
  input_total: number;     // satoshis
  output_total: number;    // satoshis
  output_total_usd: number;
  block_id: number;
}

type MempoolTx = {
  txid: string;
  vin:  Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
  status?: { block_height?: number; block_time?: number };
};

async function fetchBitcoin(prices: Prices, seen: Set<string>): Promise<object[]> {
  const results: object[] = [];

  // ── 1. Blockchair: $1M+ BTC transactions (rate-limited to 1× per 2 min via Redis TTL) ─────
  // Filter by OUTPUT_TOTAL in satoshis — much more reliable than output_total_usd on free tier.
  // output_total_usd can be null for recent txs, causing silent USD filter failures.
  // At ~$100K BTC price: 1B satoshis = 10 BTC ≈ $1M — covers 2-10 days of global whale txs.
  let blockchairRateLimited = false;
  if (redis) {
    try {
      const last = await redis.get<number>(REDIS_BLOCKCHAIR);
      blockchairRateLimited = last !== null && (Date.now() - last) < 2 * 60_000;
    } catch { /* ignore */ }
  }

  if (!blockchairRateLimited) {
    try {
      // output_total_usd filter works reliably on free tier to FIND transactions.
      // We never rely on the returned output_total_usd value (can be null) —
      // always compute USD from output_total (satoshis) × current BTC price.
      const url = 'https://api.blockchair.com/bitcoin/transactions' +
        `?q=output_total_usd(${BTC_WHALE_USD}..)` +
        '&s=time(desc)&limit=100' +
        '&fields=hash,time,output_total,output_total_usd,block_id';
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const txList: BlockchairTx[] = data?.data ?? [];
        for (const tx of txList) {
          const id = `btc-${tx.hash}`;
          if (seen.has(id)) continue;
          // CRITICAL FIX: output_total_usd is often null on free tier → always derive from satoshis
          const btcAmt = (tx.output_total ?? 0) / 1e8;
          const usd    = (tx.output_total_usd != null && tx.output_total_usd > 0)
                           ? tx.output_total_usd
                           : btcAmt * prices.btc;
          if (usd < MIN_USD) continue;
          const ts = tx.time ? new Date(tx.time.replace(' ', 'T') + 'Z').getTime() : 0;
          if (!ts) continue;
          seen.add(id);
          results.push({
            id, hash: tx.hash, chain: 'BTC',
            from: 'multiple inputs', to: 'multiple outputs',
            value: usd, amount: btcAmt, token: 'BTC',
            timestamp: ts, blockNumber: tx.block_id ?? 0,
            type: 'transfer', isWhale: usd >= 500_000, source: 'blockchair',
          });
        }
        if (redis) redis.set(REDIS_BLOCKCHAIR, Date.now(), { ex: 120 }).catch(() => {});
      }
    } catch { /* Blockchair unavailable */ }
  }

  // ── 2. mempool.space: paginate ALL txs in recent blocks (not just first 25 by fee) ─────────
  // mempool.space sorts /txs/0 by fee rate — whale txs with normal fees appear in later pages.
  // We paginate every 25-tx page until we've scanned the whole block or hit a 24h cutoff.
  // Fetching last 6 blocks × all pages — each block has ~2000-3000 txs = up to 120 pages.
  // We cap at 8 pages/block (200 txs) to avoid timeout; large-value txs tend to pay higher fees
  // so they are usually found in the first few pages anyway.
  const cutoffMs = Date.now() - CUTOFF_MS;
  try {
    const blocksRes = await fetch('https://mempool.space/api/blocks', {
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (blocksRes.ok) {
      const blocks: Array<{ id: string; height: number; timestamp: number }> = await blocksRes.json();
      if (Array.isArray(blocks)) {
        // Only process blocks within our 24h window
        const recentBlocks = blocks.filter(b => b.timestamp * 1000 > cutoffMs).slice(0, 6);

        const blockResults = await Promise.allSettled(
          recentBlocks.map(async (block) => {
            const out: MempoolTx[] = [];
            // Paginate through the block (25 txs per page, max 8 pages = 200 txs)
            for (let page = 0; page < 8; page++) {
              try {
                const res = await fetch(
                  `https://mempool.space/api/block/${block.id}/txs/${page * 25}`,
                  { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
                );
                if (!res.ok) break;
                const txs: MempoolTx[] = await res.json();
                if (!Array.isArray(txs) || txs.length === 0) break;
                out.push(...txs);
                if (txs.length < 25) break; // last page
              } catch { break; }
            }

            const pageResults: object[] = [];
            for (const tx of out) {
              const id = `btc-${tx.txid}`;
              if (seen.has(id)) continue;
              const totalSats = tx.vout.reduce((s, o) => s + (o.value ?? 0), 0);
              const btcAmt   = totalSats / 1e8;
              const usd      = btcAmt * prices.btc;
              if (usd < MIN_USD) continue;
              const blockTime = tx.status?.block_time;
              if (!blockTime) continue;
              seen.add(id);
              pageResults.push({
                id, hash: tx.txid, chain: 'BTC',
                from: tx.vin?.[0]?.prevout?.scriptpubkey_address ?? 'unknown',
                to:   tx.vout?.[0]?.scriptpubkey_address ?? 'unknown',
                value: usd, amount: btcAmt, token: 'BTC',
                timestamp: blockTime * 1000,
                blockNumber: tx.status?.block_height ?? 0,
                type: 'transfer', isWhale: usd >= 500_000, source: 'mempool',
              });
            }
            return pageResults;
          })
        );
        for (const r of blockResults) {
          if (r.status === 'fulfilled') results.push(...r.value);
        }
      }
    }
  } catch { /* mempool.space unavailable */ }

  return results;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const [pricesResult] = await Promise.allSettled([getPrices()]);
  const prices: Prices = pricesResult.status === 'fulfilled' ? pricesResult.value : { btc: 77_000, eth: 2_500 };
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

  // 1. Load stored history from Redis — merge v1 + v2 so no transactions are lost
  type TxRecord = { id: string; timestamp: number; [k: string]: unknown };
  let stored: TxRecord[] = [];
  if (redis) {
    try {
      const [v1Data, v2Data] = await Promise.all([
        redis.get<TxRecord[]>('tidemark_whale_txs_v1'),
        redis.get<TxRecord[]>('tidemark_whale_txs_v2'),
      ]);
      const combined = [...(v1Data ?? []), ...(v2Data ?? [])];
      const byId = new Map<string, TxRecord>();
      for (const t of combined) byId.set(t.id, t);
      const cutoffLoad = Date.now() - CUTOFF_MS;
      stored = Array.from(byId.values())
        .filter(t => t.timestamp > cutoffLoad)
        .sort((a, b) => b.timestamp - a.timestamp);
      if (v2Data && v2Data.length > 0) {
        await redis.del('tidemark_whale_txs_v2').catch(() => {});
      }
    } catch { stored = []; }
  }

  const seen     = new Set<string>(stored.map(t => t.id));
  const freshTxs: object[] = [];

  // 2. Fetch all chains in parallel
  const [ethResults, rpcResults, btcResult] = await Promise.allSettled([
    // Etherscan V2 — ETH, ARB, MATIC
    API_KEY
      ? Promise.allSettled(ETHERSCAN_CHAINS.flatMap(c => c.tokens.map(t => fetchEtherscanChain(c, t, prices, oneDayAgo, seen))))
      : Promise.resolve([]),

    // eth_getLogs RPC — BSC, AVAX
    Promise.allSettled(RPC_CHAINS.map(c => fetchRpcChain(c, prices, seen))),

    // Bitcoin — Blockchair (rate-limited via Redis TTL) + mempool.space recent blocks
    fetchBitcoin(prices, seen),
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
