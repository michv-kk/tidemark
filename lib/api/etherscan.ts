import { Transaction, TxType, ChainId } from '../types';
import { isExchangeWallet } from '../knownWallets';

// ─── Etherscan V2 — single key, 60+ EVM chains ────────────────────────────────
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';

// ─── Per-chain configuration ──────────────────────────────────────────────────

interface ChainConfig {
  chainId: string;
  label: ChainId;
  idPrefix: string; // used for tx.id dedup
  // Known high-value wallets to query for token transfers
  whaleAddresses: string[];
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: '1',
    label: 'ETH',
    idPrefix: 'eth',
    whaleAddresses: [
      '0x5754284f345afc66a98fbb0a0afe71e0f007b949', // Tether Treasury
      '0x55FE002aefF02F77364de339a1292923A15844B8', // Circle (USDC issuer)
      '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', // Binance 7 (active hot wallet)
      '0xD551234Ae421e3BCBA99A0Da6d736074f22192FF', // Binance 8
      '0x564286362092D8e7936f0549571a803B203aAceD', // Binance 9
      '0x0681d8Db095565FE8A346fA0277bFfDe9C0edBbF', // Binance 10
      '0xfE9e8709d3215310075d67E3ed32A380CCf451C8', // Binance 11
      '0x4E9ce36E442e55EcD9025B9a6E0D88485d628A67', // Binance 12 (BSC bridge)
    ],
  },
  {
    chainId: '8453',
    label: 'BASE',
    idPrefix: 'base',
    whaleAddresses: [
      '0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A', // Large Base USDC whale
      '0x9de443AdC5A411E83F1878Ef24C3F52C61571e72', // Coinbase institutional on Base
      '0x6FCb6408499a7c0f242E32D77EB51fFa1dD28a7E', // Large USDC holder on Base
      '0x20e4A6f2f42D8C9dd2e0c1ece4F83044d82e9a8c', // Active Base whale
    ],
  },
  {
    chainId: '42161',
    label: 'ARB',
    idPrefix: 'arb',
    whaleAddresses: [
      '0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D', // Binance on Arbitrum
      '0xf89d7b9c864f589bbF53a82105107622B35EaA40', // Wintermute on Arbitrum
      '0x489ee077994B6658eAfA855C308275EAd8097C4A', // Bybit on Arbitrum
      '0x1714400FF23dB4aF24F9fd64e7039e6597f18C2', // Jump Crypto on Arbitrum
    ],
  },
];

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
  contractAddress: string;
  isError?: string;
}

interface TokenPrice { btc: number; eth: number; }

// ─── Price fetch (via server proxy to avoid CORS) ─────────────────────────────

const ETH_PRICE_FALLBACK = 2100;
const BTC_PRICE_FALLBACK = 77000;

async function getPrices(): Promise<TokenPrice> {
  try {
    const res = await fetch(
      '/api/coingecko?path=%2Fsimple%2Fprice&ids=bitcoin%2Cethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { btc: BTC_PRICE_FALLBACK, eth: ETH_PRICE_FALLBACK };
    const data = await res.json();
    return {
      btc: data?.bitcoin?.usd ?? BTC_PRICE_FALLBACK,
      eth: data?.ethereum?.usd ?? ETH_PRICE_FALLBACK,
    };
  } catch {
    return { btc: BTC_PRICE_FALLBACK, eth: ETH_PRICE_FALLBACK };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferType(from: string, to: string): TxType {
  const fromEx = isExchangeWallet(from);
  const toEx = isExchangeWallet(to);
  if (fromEx && !toEx) return 'transfer';
  if (!fromEx && toEx) return 'transfer';
  return 'transfer';
}

function usdValue(rawAmount: number, sym: string, prices: TokenPrice): number | null {
  if (sym === 'USDT' || sym === 'USDC' || sym === 'BUSD' || sym === 'DAI' || sym === 'USDB') {
    return rawAmount; // stablecoins ≈ $1
  }
  if (sym === 'WBTC' || sym === 'CBBTC') return rawAmount * prices.btc;
  if (sym === 'WETH' || sym === 'ETH')   return rawAmount * prices.eth;
  return null; // unknown token — skip
}

// ─── Core fetch: one address on one chain ────────────────────────────────────

async function fetchTokenTxsForAddress(
  address: string,
  chain: ChainConfig,
  apiKey: string,
  prices: TokenPrice,
  oneDayAgo: number,
  seen: Set<string>,
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  try {
    const url = new URL(ETHERSCAN_V2);
    url.searchParams.set('chainid', chain.chainId);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('address', address);
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '50');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];

    for (const tx of data.result as EtherscanTokenTx[]) {
      // Unique across all chains: prefix prevents ETH/ARB hash collisions
      const globalId = `${chain.idPrefix}-${tx.hash}`;
      if (seen.has(globalId)) continue;

      const timestamp = parseInt(tx.timeStamp, 10);
      if (timestamp < oneDayAgo) continue;

      const decimals = parseInt(tx.tokenDecimal, 10) || 18;
      const rawAmount = parseInt(tx.value, 10) / Math.pow(10, decimals);
      const sym = tx.tokenSymbol?.toUpperCase() ?? '';

      const val = usdValue(rawAmount, sym, prices);
      if (val === null || val < 100_000) continue; // skip unknown tokens or < $100K

      seen.add(globalId);
      results.push({
        id: globalId,
        hash: tx.hash,
        chain: chain.label,
        from: tx.from ?? '',
        to: tx.to ?? '',
        value: val,
        amount: rawAmount,
        token: tx.tokenSymbol || sym,
        timestamp: timestamp * 1000,
        blockNumber: parseInt(tx.blockNumber, 10),
        type: inferType(tx.from, tx.to),
        isWhale: val >= 500_000,
        source: 'etherscan',
      });
    }
  } catch {
    // Silently skip — API may be rate-limited or chain temporarily unavailable
  }
  return results;
}

// ─── Public export: fetch whale txs from ETH + BASE + ARB in parallel ────────

export async function fetchEtherscanTransactions(): Promise<Transaction[]> {
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const prices = await getPrices();
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const seen = new Set<string>();
  const allResults: Transaction[] = [];

  // Flatten all (chain, address) pairs and fetch all in parallel
  const tasks = CHAIN_CONFIGS.flatMap(chain =>
    chain.whaleAddresses.map(addr =>
      fetchTokenTxsForAddress(addr, chain, apiKey, prices, oneDayAgo, seen)
    )
  );

  const settled = await Promise.allSettled(tasks);

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      allResults.push(...r.value);
    }
  }

  return allResults.sort((a, b) => b.timestamp - a.timestamp);
}
