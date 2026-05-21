import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// ISR: Vercel caches the full route response for 30 s across ALL users.
export const revalidate = 30;
export const maxDuration = 25;

// ─── Redis accumulator (shared across all clients / browsers) ─────────────────
// Gracefully disabled when env vars are not set (local dev without Redis).
const redis = (
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null
);

const REDIS_KEY  = 'tidemark_whale_txs_v1';
const REDIS_MAX  = 500;           // max txs stored server-side
const REDIS_TTL  = 48 * 3_600;   // 48 h expiry (seconds)
const CUTOFF_MS  = 48 * 3_600_000; // only keep last 48 h

const MIN_USD = 50_000; // $50K minimum — enough to catch whales across all chains

// ─── Prices ───────────────────────────────────────────────────────────────────

interface Prices { btc: number; eth: number; }

async function getPrices(): Promise<Prices> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      { cache: 'no-store' }
    );
    const d = await res.json();
    return { btc: d?.bitcoin?.usd ?? 77000, eth: d?.ethereum?.usd ?? 2500 };
  } catch {
    return { btc: 77000, eth: 2500 };
  }
}

// ─── Strategy 1: Etherscan V2 (ETH, ARB, MATIC) ──────────────────────────────

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

interface TokenCfg { contractAddress: string; symbol: string; decimals: number; priceKey?: 'eth' | 'btc'; }
interface ChainCfg { chainId: string; label: string; idPrefix: string; tokens: TokenCfg[]; }

const ETHERSCAN_CHAINS: ChainCfg[] = [
  {
    chainId: '1', label: 'ETH', idPrefix: 'eth',
    tokens: [
      { contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT',  decimals: 6 },
      { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC',  decimals: 8, priceKey: 'btc' },
      { contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
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

async function fetchEtherscanChain(chain: ChainCfg, token: TokenCfg, prices: Prices, oneDayAgo: number, seen: Set<string>) {
  // offset=1000 gives ~10x more transfers — covers most of the 24-hour whale window
  const url =
    `${ETHERSCAN_V2}?chainid=${chain.chainId}&module=account&action=tokentx` +
    `&contractaddress=${token.contractAddress}` +
    `&page=1&offset=1000&sort=desc&apikey=${API_KEY}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status !== '1' || !Array.isArray(data.result)) return [];

  const results: object[] = [];
  for (const tx of data.result as RawTx[]) {
    const id = `${chain.idPrefix}-${tx.hash}`;
    if (seen.has(id)) continue;
    const ts = parseInt(tx.timeStamp, 10);
    if (ts < oneDayAgo) continue;
    const raw = parseInt(tx.value, 10) / Math.pow(10, token.decimals);
    const val = token.priceKey === 'btc' ? raw * prices.btc : token.priceKey === 'eth' ? raw * prices.eth : raw;
    if (val < MIN_USD) continue;
    seen.add(id);
    results.push({ id, hash: tx.hash, chain: chain.label, from: tx.from ?? '', to: tx.to ?? '',
      value: val, amount: raw, token: token.symbol, timestamp: ts * 1000,
      blockNumber: parseInt(tx.blockNumber, 10), type: 'transfer', isWhale: val >= 500_000, source: 'etherscan' });
  }
  return results;
}

// ─── Strategy 2: Blockscout REST (BASE, OP) ───────────────────────────────────

interface BlockscoutCfg {
  label: string; idPrefix: string; baseUrl: string;
  tokens: { address: string; symbol: string; decimals: number; priceKey?: 'eth' }[];
}

const BLOCKSCOUT_CHAINS: BlockscoutCfg[] = [
  {
    label: 'BASE', idPrefix: 'base',
    baseUrl: 'https://base.blockscout.com',
    tokens: [
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC',  decimals: 6 },
      { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6 },
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    label: 'OP', idPrefix: 'op',
    baseUrl: 'https://optimism.blockscout.com',
    tokens: [
      { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
      { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, priceKey: 'eth' },
    ],
  },
];

interface BlockscoutItem {
  from?: { hash?: string };
  to?: { hash?: string };
  total?: { value?: string; decimals?: string };
  timestamp?: string;
  tx_hash?: string;
  block_number?: number;
}

interface BlockscoutResp {
  items: BlockscoutItem[];
  next_page_params?: Record<string, string | number> | null;
}

async function fetchBlockscout(chain: BlockscoutCfg, token: { address: string; symbol: string; decimals: number; priceKey?: 'eth' }, prices: Prices, seen: Set<string>) {
  const base = `${chain.baseUrl}/api/v2/tokens/${token.address}/transfers`;

  // Fetch page 1 — then use cursor for page 2 (Blockscout uses cursor pagination)
  let items: BlockscoutItem[] = [];
  try {
    const r1 = await fetch(base, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!r1.ok) return [];
    const d1: BlockscoutResp = await r1.json();
    items = d1.items ?? [];

    // Fetch pages 2 & 3 via cursor for wider historical coverage
    let nextParams = d1.next_page_params;
    for (let page = 2; page <= 4 && nextParams; page++) {
      const cursor = new URLSearchParams(
        Object.entries(nextParams).map(([k, v]) => [k, String(v)])
      );
      try {
        const rN = await fetch(`${base}?${cursor}`, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        if (!rN.ok) break;
        const dN: BlockscoutResp = await rN.json();
        items = [...items, ...(dN.items ?? [])];
        nextParams = dN.next_page_params ?? null;
      } catch { break; }
    }
  } catch { return []; }

  const results: object[] = [];
  for (const item of items) {
    const txHash = item.tx_hash ?? '';
    const id = `${chain.idPrefix}-${txHash}`;
    if (seen.has(id) || !txHash) continue;

    const rawStr = item.total?.value ?? '0';
    const decimals = parseInt(item.total?.decimals ?? String(token.decimals), 10);
    const raw = parseInt(rawStr, 10) / Math.pow(10, decimals);
    const val = token.priceKey === 'eth' ? raw * prices.eth : raw;
    if (val < MIN_USD) continue;

    const ts = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
    seen.add(id);
    results.push({ id, hash: txHash, chain: chain.label,
      from: item.from?.hash ?? '', to: item.to?.hash ?? '',
      value: val, amount: raw, token: token.symbol, timestamp: ts,
      blockNumber: item.block_number ?? 0, type: 'transfer', isWhale: val >= 500_000, source: 'blockscout' });
  }
  return results;
}

// ─── Strategy 3: eth_getLogs via public RPC (BSC, AVAX) ──────────────────────

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface RpcChainCfg {
  label: string; idPrefix: string; rpcUrl: string;
  blockTime: number; // seconds per block
  lookbackBlocks: number;
  tokens: { address: string; symbol: string; decimals: number }[];
}

const RPC_CHAINS: RpcChainCfg[] = [
  {
    label: 'BSC', idPrefix: 'bsc',
    rpcUrl: 'https://bsc-rpc.publicnode.com',
    blockTime: 3,
    lookbackBlocks: 1200, // ~1 hour (BSC has high tx volume so capped to avoid huge response)
    tokens: [
      { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
      { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
    ],
  },
  {
    label: 'AVAX', idPrefix: 'avax',
    rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
    blockTime: 2,
    lookbackBlocks: 10800, // ~6 hours (AVAX has low log volume so large window is fine)
    tokens: [
      { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6e', symbol: 'USDC', decimals: 6 },
      { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', decimals: 6 },
    ],
  },
];

interface EthLog { transactionHash: string; blockNumber: string; data: string; topics: string[]; }

async function rpcPost(url: string, method: string, params: unknown[]): Promise<unknown> {
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
}

async function fetchRpcChain(chain: RpcChainCfg, prices: Prices, seen: Set<string>) {
  // Get latest block number and timestamp
  const latestHex = await rpcPost(chain.rpcUrl, 'eth_blockNumber', []) as string | null;
  if (!latestHex) return [];

  const latestBlock = parseInt(latestHex, 16);
  const fromBlock = hex(latestBlock - chain.lookbackBlocks);
  const nowMs = Date.now();

  const results: object[] = [];

  // Fetch logs for each token in parallel
  const tokenResults = await Promise.allSettled(
    chain.tokens.map(async (token) => {
      const logs = await rpcPost(chain.rpcUrl, 'eth_getLogs', [{
        fromBlock,
        toBlock: 'latest',
        address: token.address,
        topics: [TRANSFER_TOPIC],
      }]) as EthLog[] | null;

      if (!Array.isArray(logs)) return [];
      const tokenResults: object[] = [];

      for (const log of logs) {
        const id = `${chain.idPrefix}-${log.transactionHash}-${log.blockNumber}`;
        if (seen.has(id)) continue;

        const raw = parseInt(log.data, 16) / Math.pow(10, token.decimals);
        if (raw < MIN_USD) continue;

        // Estimate timestamp from block number
        const blockNum = parseInt(log.blockNumber, 16);
        const estimatedTs = nowMs - (latestBlock - blockNum) * chain.blockTime * 1000;

        // Decode from/to from topics (topics[1]=from, topics[2]=to, padded 32 bytes)
        const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : 'unknown';
        const to   = log.topics[2] ? '0x' + log.topics[2].slice(26) : 'unknown';

        seen.add(id);
        tokenResults.push({
          id, hash: log.transactionHash, chain: chain.label,
          from, to, value: raw, amount: raw, token: token.symbol,
          timestamp: estimatedTs, blockNumber: blockNum,
          type: 'transfer', isWhale: raw >= 500_000, source: 'rpc',
        });
      }
      return tokenResults;
    })
  );

  for (const r of tokenResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return results;
}

/** Return a hex string with no leading zeros (standard Ethereum format) */
function hex(n: number): string {
  return '0x' + n.toString(16);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const [pricesResult] = await Promise.allSettled([getPrices()]);
  const prices: Prices = pricesResult.status === 'fulfilled' ? pricesResult.value : { btc: 77000, eth: 2500 };
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

  // ── 1. Load accumulated history from Redis (server-side, shared across all clients) ──
  type TxRecord = { id: string; timestamp: number; [k: string]: unknown };
  let stored: TxRecord[] = [];
  if (redis) {
    try {
      stored = (await redis.get<TxRecord[]>(REDIS_KEY)) ?? [];
    } catch { /* Redis unavailable — continue without it */ }
  }

  // Pre-populate the seen set with already-stored ids (prevents duplicates)
  const seen = new Set<string>(stored.map(t => t.id));
  const freshTxs: object[] = [];

  // ── 2. Fetch new transactions from all chains in parallel ──────────────────
  const [etherscanResults, blockscoutResults, rpcResults] = await Promise.allSettled([
    API_KEY
      ? Promise.allSettled(
          ETHERSCAN_CHAINS.flatMap(chain =>
            chain.tokens.map(token => fetchEtherscanChain(chain, token, prices, oneDayAgo, seen))
          )
        )
      : Promise.resolve([]),

    Promise.allSettled(
      BLOCKSCOUT_CHAINS.flatMap(chain =>
        chain.tokens.map(token => fetchBlockscout(chain, token, prices, seen))
      )
    ),

    Promise.allSettled(
      RPC_CHAINS.map(chain => fetchRpcChain(chain, prices, seen))
    ),
  ]);

  if (etherscanResults.status === 'fulfilled')
    for (const r of etherscanResults.value)
      if (r.status === 'fulfilled') freshTxs.push(...(r.value as object[]));

  if (blockscoutResults.status === 'fulfilled')
    for (const r of blockscoutResults.value)
      if (r.status === 'fulfilled') freshTxs.push(...(r.value as object[]));

  if (rpcResults.status === 'fulfilled')
    for (const r of rpcResults.value)
      if (r.status === 'fulfilled') freshTxs.push(...(r.value as object[]));

  // ── 3. Merge: fresh + stored, sort newest-first, filter to 48h, cap at REDIS_MAX ──
  const cutoff = Date.now() - CUTOFF_MS;
  const merged = ([...freshTxs, ...stored] as TxRecord[])
    .filter(t => t.timestamp > cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, REDIS_MAX);

  // ── 4. Persist merged list back to Redis (48 h TTL) ───────────────────────
  if (redis && freshTxs.length > 0) {
    try {
      await redis.set(REDIS_KEY, merged, { ex: REDIS_TTL });
    } catch { /* ignore write errors */ }
  }

  // ── 5. Return: client gets the full accumulated history ───────────────────
  return NextResponse.json(merged, {
    headers: { 'Cache-Control': 'public, max-age=25' },
  });
}
