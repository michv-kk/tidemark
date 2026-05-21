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
const REDIS_KEY = 'tidemark_whale_txs_v2'; // bumped version to clear old cache
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

// ─── Strategy 4: Solana — direct RPC, server-side (goes into Redis) ───────────

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com',
];

// Verified high-volume exchange / whale accounts on Solana mainnet
const SOLANA_WHALE_ADDRESSES = [
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Binance hot wallet
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', // Binance deposit wallet
  'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5', // Kraken
  'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', // Bybit
  'GHaRmS5LCzCzJEPR7y1jQ7PXHNT5MExKahLQPaT6qMx', // OKX
  'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', // Wintermute
  'GThUX1Atko4tqhN2NaiTazWSeFWMoAA9HLyKm5Tc9FzR', // Jump Crypto
  'HVh6wHNBAsG3pq1Bj5oCzRjoWKVogEDHwUHkRz3ekFgt', // large SOL whale
];

const SOL_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  So11111111111111111111111111111111111111112:    'SOL',
};

async function solRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  for (const endpoint of SOLANA_RPCS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.error?.code === -32005 || json?.error?.code === 429 || json?.error) continue;
      return (json?.result as T) ?? null;
    } catch { continue; }
  }
  return null;
}

interface SigInfo  { signature: string; blockTime: number | null; err: unknown; }
interface TokBal   { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { uiAmount: number | null }; }
interface ParsedTx {
  slot: number; blockTime: number | null;
  meta: { err: unknown; preBalances: number[]; postBalances: number[];
          preTokenBalances: TokBal[]; postTokenBalances: TokBal[] } | null;
  transaction: { message: { accountKeys: Array<{ pubkey: string }> } };
}

async function fetchSolana(prices: Prices, seen: Set<string>): Promise<object[]> {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const results: object[] = [];

  const settled = await Promise.allSettled(
    SOLANA_WHALE_ADDRESSES.map(async (address) => {
      const sigs = await solRpc<SigInfo[]>('getSignaturesForAddress', [address, { limit: 15, commitment: 'finalized' }]);
      if (!Array.isArray(sigs)) return [];

      const recent = sigs.filter(s => !s.err && (s.blockTime ?? 0) > oneDayAgo).slice(0, 5);
      if (recent.length === 0) return [];

      const parsed = await Promise.allSettled(
        recent.map(s => solRpc<ParsedTx>('getParsedTransaction', [
          s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' },
        ]))
      );

      const addrRes: object[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const r = parsed[i];
        if (r.status !== 'fulfilled' || !r.value) continue;
        const tx = r.value;
        if (!tx.meta || tx.meta.err) continue;

        const id = `sol-${recent[i].signature}`;
        if (seen.has(id)) continue;

        const keys = tx.transaction.message.accountKeys.map(k => k.pubkey);
        const pre  = tx.meta.preTokenBalances  ?? [];
        const post = tx.meta.postTokenBalances ?? [];

        let bestUsd = 0, bestSymbol = 'SOL', bestAmount = 0, bestFrom = address, bestTo = '';

        // SPL token transfers
        for (const pb of post) {
          const sym = SOL_MINTS[pb.mint];
          if (!sym || sym === 'SOL') continue;
          const preBal = pre.find(p => p.accountIndex === pb.accountIndex);
          const delta  = (pb.uiTokenAmount?.uiAmount ?? 0) - (preBal?.uiTokenAmount?.uiAmount ?? 0);
          if (Math.abs(delta) < 0.01) continue;
          const usd = Math.abs(delta); // stablecoins: 1:1
          if (usd > bestUsd) {
            bestUsd = usd; bestSymbol = sym; bestAmount = Math.abs(delta);
            bestFrom = delta < 0 ? (pb.owner ?? address) : 'unknown';
            bestTo   = delta > 0 ? (pb.owner ?? 'unknown') : 'unknown';
          }
        }

        // Native SOL
        const preSOL = tx.meta.preBalances, postSOL = tx.meta.postBalances;
        for (let j = 0; j < keys.length; j++) {
          const delta = (postSOL[j] ?? 0) - (preSOL[j] ?? 0);
          if (delta <= 0) continue;
          const solAmt = delta / 1e9;
          const usd    = solAmt * prices.sol;
          if (usd > bestUsd) {
            bestUsd = usd; bestSymbol = 'SOL'; bestAmount = solAmt;
            bestFrom = address; bestTo = keys[j];
          }
        }

        if (bestUsd < MIN_USD) continue;
        seen.add(id);
        addrRes.push({ id, hash: recent[i].signature, chain: 'SOL',
          from: bestFrom, to: bestTo, value: bestUsd, amount: bestAmount, token: bestSymbol,
          timestamp: (tx.blockTime ?? 0) * 1000, blockNumber: tx.slot ?? 0,
          type: 'transfer', isWhale: bestUsd >= 500_000, source: 'solana' });
      }
      return addrRes;
    })
  );

  for (const r of settled) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }
  return results;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const [pricesResult] = await Promise.allSettled([getPrices()]);
  const prices: Prices = pricesResult.status === 'fulfilled' ? pricesResult.value : { btc: 77_000, eth: 2_500, sol: 150 };
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

  // 1. Load stored history from Redis
  type TxRecord = { id: string; timestamp: number; [k: string]: unknown };
  let stored: TxRecord[] = [];
  if (redis) { try { stored = (await redis.get<TxRecord[]>(REDIS_KEY)) ?? []; } catch {} }

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
