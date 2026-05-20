import { Transaction, ChainId } from '../types';

// ─── Etherscan V2 — single key, ETH + BASE + ARB ──────────────────────────────
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const MIN_USD = 100_000; // $100K whale threshold

// ─── Token contracts to watch per chain ──────────────────────────────────────
// We query by CONTRACT ADDRESS, not by whale wallet — this catches ALL large
// transfers of that token on that chain and avoids rate-limit issues from
// sending too many parallel requests.

interface TokenConfig {
  contractAddress: string;
  symbol: string;
  decimals: number;
  priceKey?: 'eth' | 'btc'; // undefined = stablecoin ($1)
}

interface ChainConfig {
  chainId: string;
  label: ChainId;
  idPrefix: string;
  tokens: TokenConfig[];
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: '1',
    label: 'ETH',
    idPrefix: 'eth',
    tokens: [
      { contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT',  decimals: 6 },
      { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC',  decimals: 8, priceKey: 'btc' },
      { contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    chainId: '8453',
    label: 'BASE',
    idPrefix: 'base',
    tokens: [
      { contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6 },
      { contractAddress: '0x4200000000000000000000000000000000000006', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    chainId: '42161',
    label: 'ARB',
    idPrefix: 'arb',
    tokens: [
      { contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT',  decimals: 6 },
      { contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH',  decimals: 18, priceKey: 'eth' },
    ],
  },
  {
    chainId: '56',
    label: 'BSC',
    idPrefix: 'bsc',
    tokens: [
      { contractAddress: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT',  decimals: 18 },
      { contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC',  decimals: 18 },
      { contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD',  decimals: 18 },
    ],
  },
  {
    chainId: '137',
    label: 'MATIC',
    idPrefix: 'matic',
    tokens: [
      { contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT',  decimals: 6 },
    ],
  },
  {
    chainId: '43114',
    label: 'AVAX',
    idPrefix: 'avax',
    tokens: [
      { contractAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT',  decimals: 6 },
    ],
  },
  {
    chainId: '10',
    label: 'OP',
    idPrefix: 'op',
    tokens: [
      { contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC',  decimals: 6 },
      { contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT',  decimals: 6 },
    ],
  },
];

// ─── Prices ───────────────────────────────────────────────────────────────────

interface TokenPrice { btc: number; eth: number; }

const ETH_PRICE_FALLBACK = 2100;
const BTC_PRICE_FALLBACK = 77_000;

async function getPrices(): Promise<TokenPrice> {
  try {
    const res = await fetch(
      '/api/coingecko?path=%2Fsimple%2Fprice&ids=bitcoin%2Cethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { btc: BTC_PRICE_FALLBACK, eth: ETH_PRICE_FALLBACK };
    const data = await res.json();
    return {
      btc: data?.bitcoin?.usd  ?? BTC_PRICE_FALLBACK,
      eth: data?.ethereum?.usd ?? ETH_PRICE_FALLBACK,
    };
  } catch {
    return { btc: BTC_PRICE_FALLBACK, eth: ETH_PRICE_FALLBACK };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EtherscanTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  timeStamp: string;
  blockNumber: string;
  isError?: string;
}

// ─── Fetch all recent transfers for one token contract on one chain ───────────

async function fetchTokenTransfers(
  chain: ChainConfig,
  token: TokenConfig,
  apiKey: string,
  prices: TokenPrice,
  oneDayAgo: number,
  seen: Set<string>,
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  try {
    const url = new URL(ETHERSCAN_V2);
    url.searchParams.set('chainid',         chain.chainId);
    url.searchParams.set('module',          'account');
    url.searchParams.set('action',          'tokentx');
    url.searchParams.set('contractaddress', token.contractAddress);
    url.searchParams.set('page',            '1');
    url.searchParams.set('offset',          '50');
    url.searchParams.set('sort',            'desc');
    url.searchParams.set('apikey',          apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];

    for (const tx of data.result as EtherscanTokenTx[]) {
      const globalId = `${chain.idPrefix}-${tx.hash}`;
      if (seen.has(globalId)) continue;

      const timestamp = parseInt(tx.timeStamp, 10);
      if (timestamp < oneDayAgo) continue;

      const rawAmount = parseInt(tx.value, 10) / Math.pow(10, token.decimals);

      let val: number;
      if (token.priceKey === 'btc')      val = rawAmount * prices.btc;
      else if (token.priceKey === 'eth') val = rawAmount * prices.eth;
      else                               val = rawAmount; // stablecoin ≈ $1

      if (val < MIN_USD) continue;

      seen.add(globalId);
      results.push({
        id:          globalId,
        hash:        tx.hash,
        chain:       chain.label,
        from:        tx.from ?? '',
        to:          tx.to  ?? '',
        value:       val,
        amount:      rawAmount,
        token:       token.symbol,
        timestamp:   timestamp * 1000,
        blockNumber: parseInt(tx.blockNumber, 10),
        type:        'transfer',
        isWhale:     val >= 500_000,
        source:      'etherscan',
      });
    }
  } catch {
    // Silently skip — rate-limited or chain temporarily unavailable
  }
  return results;
}

// ─── Public export ────────────────────────────────────────────────────────────

const BATCH_SIZE  = 4;    // max parallel requests per batch
const BATCH_DELAY = 1100; // ms between batches — stays under 5 req/s free-tier

export async function fetchEtherscanTransactions(): Promise<Transaction[]> {
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const prices    = await getPrices();
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const seen      = new Set<string>();
  const all: Transaction[] = [];

  // Build the full task list (1 task = 1 token contract on 1 chain)
  const tasks = CHAIN_CONFIGS.flatMap(chain =>
    chain.tokens.map(token => ({ chain, token }))
  );

  // Fire in batches to stay within the Etherscan free-tier rate limit (5/s)
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY));
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(({ chain, token }) =>
        fetchTokenTransfers(chain, token, apiKey, prices, oneDayAgo, seen)
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
  }

  return all.sort((a, b) => b.timestamp - a.timestamp);
}
