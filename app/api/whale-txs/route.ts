import { NextResponse } from 'next/server';

// ISR: Vercel caches the full route response for 30 s across ALL users.
// Only one Etherscan fetch cycle happens per 30 s regardless of traffic.
// force-dynamic is NOT set — that would bypass the ISR cache.
export const revalidate = 30;
export const maxDuration = 25;

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const MIN_USD      = 100_000;
const API_KEY      = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

// ─── Token contracts per chain ────────────────────────────────────────────────

interface TokenCfg {
  contractAddress: string;
  symbol: string;
  decimals: number;
  priceKey?: 'eth' | 'btc';
}
interface ChainCfg {
  chainId: string;
  label: string;
  idPrefix: string;
  tokens: TokenCfg[];
}

const CHAINS: ChainCfg[] = [
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
    chainId: '8453', label: 'BASE', idPrefix: 'base',
    tokens: [
      { contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6 },
      { contractAddress: '0x4200000000000000000000000000000000000006', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
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
    chainId: '56', label: 'BSC', idPrefix: 'bsc',
    tokens: [
      { contractAddress: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
      { contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
    ],
  },
  {
    chainId: '137', label: 'MATIC', idPrefix: 'matic',
    tokens: [
      { contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
    ],
  },
  {
    chainId: '43114', label: 'AVAX', idPrefix: 'avax',
    tokens: [
      { contractAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', decimals: 6 },
    ],
  },
  {
    chainId: '10', label: 'OP', idPrefix: 'op',
    tokens: [
      { contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
      { contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
    ],
  },
];

// ─── Prices ───────────────────────────────────────────────────────────────────

interface Prices { btc: number; eth: number; }

async function getPrices(): Promise<Prices> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      { next: { revalidate: 60 } }
    );
    const d = await res.json();
    return { btc: d?.bitcoin?.usd ?? 77000, eth: d?.ethereum?.usd ?? 2100 };
  } catch {
    return { btc: 77000, eth: 2100 };
  }
}

// ─── One token contract on one chain ─────────────────────────────────────────

interface RawTx {
  hash: string; from: string; to: string; value: string;
  timeStamp: string; blockNumber: string; isError?: string;
}

async function fetchOneContract(
  chain: ChainCfg,
  token: TokenCfg,
  prices: Prices,
  oneDayAgo: number,
  seen: Set<string>,
) {
  const url =
    `${ETHERSCAN_V2}?chainid=${chain.chainId}&module=account&action=tokentx` +
    `&contractaddress=${token.contractAddress}` +
    `&page=1&offset=100&sort=desc&apikey=${API_KEY}`;

  // Vercel Data Cache: each unique URL is served from cache for 30 s, then
  // revalidated in the background. Zero Etherscan rate-limit risk after warm-up.
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
    const val =
      token.priceKey === 'btc' ? raw * prices.btc :
      token.priceKey === 'eth' ? raw * prices.eth :
      raw;

    if (val < MIN_USD) continue;
    seen.add(id);

    results.push({
      id,
      hash:        tx.hash,
      chain:       chain.label,
      from:        tx.from ?? '',
      to:          tx.to  ?? '',
      value:       val,
      amount:      raw,
      token:       token.symbol,
      timestamp:   ts * 1000,
      blockNumber: parseInt(tx.blockNumber, 10),
      type:        'transfer',
      isWhale:     val >= 500_000,
      source:      'etherscan',
    });
  }

  return results;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json([], { status: 200 });
  }

  const [prices] = await Promise.allSettled([getPrices()]);
  const p: Prices = prices.status === 'fulfilled' ? prices.value : { btc: 77000, eth: 2100 };
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const seen = new Set<string>();
  const all: object[] = [];

  // Fire all chain×token requests in parallel — safe because each URL is
  // individually cached by Vercel Data Cache. Etherscan only receives unique
  // requests at most once per 30 s regardless of how many users are online.
  const tasks = CHAINS.flatMap(chain =>
    chain.tokens.map(token => fetchOneContract(chain, token, p, oneDayAgo, seen))
  );

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Sort newest first
  (all as { timestamp: number }[]).sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json(all, {
    headers: { 'Cache-Control': 'public, max-age=25' },
  });
}
