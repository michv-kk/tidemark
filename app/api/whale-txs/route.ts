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
const REDIS_MAX = 500;
const REDIS_TTL = 48 * 3_600;
const CUTOFF_MS = 48 * 3_600_000;
const MIN_USD   = 50_000;

// ─── Prices ───────────────────────────────────────────────────────────────────

interface Prices { btc: number; eth: number; sol: number; }

async function getPrices(): Promise<Prices> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd',
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    );
    const d = await res.json();
    return { btc: d?.bitcoin?.usd ?? 77_000, eth: d?.ethereum?.usd ?? 2_500, sol: d?.solana?.usd ?? 150 };
  } catch {
    return { btc: 77_000, eth: 2_500, sol: 150 };
  }
}

// ─── Strategy 1: Etherscan V2 (ETH, ARB, MATIC) ──────────────────────────────

const API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

interface TokenCfg { contractAddress: string; symbol: string; decimals: number; priceKey?: 'eth' | 'btc'; }
interface ChainCfg { chainId: string; label: string; idPrefix: string; tokens: TokenCfg[]; }

const ETHERSCAN_V2_CHAINS: ChainCfg[] = [
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

interface RawTx { hash: string; from: string; to: string; value: string; timeStamp: string; blockNumber: string; }

async function fetchEtherscanV2(chain: ChainCfg, token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>) {
  const url = `https://api.etherscan.io/v2/api?chainid=${chain.chainId}&module=account&action=tokentx` +
    `&contractaddress=${token.contractAddress}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];
    return parseTxList(data.result, chain.label, chain.idPrefix, token, prices, oneDayAgo, seen, 'etherscan');
  } catch { return []; }
}

function parseTxList(
  txList: RawTx[], label: string, idPrefix: string,
  token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>, source: string,
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
      blockNumber: parseInt(tx.blockNumber, 10), type: 'transfer', isWhale: val >= 500_000, source });
  }
  return results;
}

// ─── Strategy 2: Chain-specific Etherscan APIs (BASE, OP) ─────────────────────
// basescan.org and api-optimistic.etherscan.io accept the same Etherscan API key.

interface EtherscanV1Cfg {
  apiBase: string; label: string; idPrefix: string; tokens: TokenCfg[];
}

const ETHERSCAN_V1_CHAINS: EtherscanV1Cfg[] = [
  {
    label: 'BASE', idPrefix: 'base',
    apiBase: 'https://api.basescan.org/api',
    tokens: [
      { contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    label: 'OP', idPrefix: 'op',
    apiBase: 'https://api-optimistic.etherscan.io/api',
    tokens: [
      { contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
    ],
  },
];

async function fetchEtherscanV1(chain: EtherscanV1Cfg, token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>) {
  const url = `${chain.apiBase}?module=account&action=tokentx` +
    `&contractaddress=${token.contractAddress}&page=1&offset=500&sort=desc&apikey=${API_KEY}`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];
    return parseTxList(data.result, chain.label, chain.idPrefix, token, prices, oneDayAgo, seen, 'etherscan');
  } catch { return []; }
}

// ─── Strategy 3: eth_getLogs via public RPC (BSC, AVAX) ──────────────────────

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface RpcChainCfg {
  label: string; idPrefix: string; rpcUrl: string;
  blockTime: number; lookbackBlocks: number;
  tokens: { address: string; symbol: string; decimals: number }[];
}

const RPC_CHAINS: RpcChainCfg[] = [
  {
    label: 'BSC', idPrefix: 'bsc', rpcUrl: 'https://bsc-rpc.publicnode.com',
    blockTime: 3, lookbackBlocks: 1200,
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

// ─── Strategy 4: Solana — server-side via Solscan public API ─────────────────
// Uses Solscan's free public API to get recent large USDC / USDT / SOL transfers.
// No API key needed, much lighter than parsing individual RPC transactions.

const SOLSCAN_TOKENS = [
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
];

interface SolscanTransfer {
  signature: string;
  blockTime: number;
  src: string;
  dst: string;
  amount: number;      // already in token units (not raw)
  decimals: number;
}

async function fetchSolana(prices: Prices, seen: Set<string>): Promise<object[]> {
  const results: object[] = [];
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

  await Promise.allSettled(SOLSCAN_TOKENS.map(async (token) => {
    try {
      // Solscan public API — no key needed, returns recent SPL transfers
      const url = `https://public-api.solscan.io/token/transfer` +
        `?tokenAddress=${token.mint}&limit=50&offset=0`;
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const data = await res.json();
      const transfers: SolscanTransfer[] = Array.isArray(data) ? data : (data?.data ?? []);

      for (const tx of transfers) {
        if (!tx.signature || !tx.blockTime) continue;
        if (tx.blockTime < oneDayAgo) continue;

        const id = `sol-${tx.signature}`;
        if (seen.has(id)) continue;

        // amount is already in token units from Solscan
        const amount = typeof tx.amount === 'number'
          ? tx.amount / Math.pow(10, tx.decimals ?? token.decimals)
          : 0;
        const usd = amount; // USDC/USDT ≈ 1:1

        if (usd < MIN_USD) continue;
        seen.add(id);
        results.push({
          id, hash: tx.signature, chain: 'SOL',
          from: tx.src ?? 'unknown', to: tx.dst ?? 'unknown',
          value: usd, amount, token: token.symbol,
          timestamp: tx.blockTime * 1000, blockNumber: 0,
          type: 'transfer', isWhale: usd >= 500_000, source: 'solana',
        });
      }
    } catch { /* Solscan unavailable — skip */ }
  }));

  return results;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const [pricesResult] = await Promise.allSettled([getPrices()]);
  const prices: Prices = pricesResult.status === 'fulfilled' ? pricesResult.value : { btc: 77_000, eth: 2_500, sol: 150 };
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
      // Deduplicate by id, keep newest copy
      const byId = new Map<string, TxRecord>();
      for (const t of combined) byId.set(t.id, t);
      stored = Array.from(byId.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, REDIS_MAX);
      // Delete v2 after merging so we don't double-merge forever
      if (v2Data && v2Data.length > 0) {
        await redis.del('tidemark_whale_txs_v2').catch(() => {});
      }
    } catch { stored = []; }
  }

  const seen = new Set<string>(stored.map(t => t.id));
  const freshTxs: object[] = [];

  // 2. Fetch all chains in parallel
  const [v2Results, v1Results, rpcResults, solResults] = await Promise.allSettled([
    // Etherscan V2 — ETH, ARB, MATIC
    API_KEY
      ? Promise.allSettled(ETHERSCAN_V2_CHAINS.flatMap(c => c.tokens.map(t => fetchEtherscanV2(c, t, prices, oneDayAgo, seen))))
      : Promise.resolve([]),

    // Etherscan V1 chain-specific — BASE, OP
    API_KEY
      ? Promise.allSettled(ETHERSCAN_V1_CHAINS.flatMap(c => c.tokens.map(t => fetchEtherscanV1(c, t, prices, oneDayAgo, seen))))
      : Promise.resolve([]),

    // eth_getLogs RPC — BSC, AVAX
    Promise.allSettled(RPC_CHAINS.map(c => fetchRpcChain(c, prices, seen))),

    // Solana — direct RPC, server-side, goes into Redis
    fetchSolana(prices, seen),
  ]);

  function collectSettled(r: PromiseSettledResult<PromiseSettledResult<object[]>[]>) {
    if (r.status === 'fulfilled')
      for (const x of r.value)
        if (x.status === 'fulfilled') freshTxs.push(...x.value);
  }

  collectSettled(v2Results as PromiseSettledResult<PromiseSettledResult<object[]>[]>);
  collectSettled(v1Results as PromiseSettledResult<PromiseSettledResult<object[]>[]>);
  collectSettled(rpcResults as PromiseSettledResult<PromiseSettledResult<object[]>[]>);
  if (solResults.status === 'fulfilled') freshTxs.push(...solResults.value);

  // 3. Merge, deduplicate, cap
  const cutoff = Date.now() - CUTOFF_MS;
  const merged = ([...freshTxs, ...stored] as TxRecord[])
    .filter(t => t.timestamp > cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, REDIS_MAX);

  // 4. Persist to Redis
  if (redis && freshTxs.length > 0) {
    try { await redis.set(REDIS_KEY, merged, { ex: REDIS_TTL }); } catch {}
  }

  // 5. Return
  return NextResponse.json(merged, { headers: { 'Cache-Control': 'public, max-age=25' } });
}
