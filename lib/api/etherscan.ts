import { Transaction, TxType } from '../types';
import { isExchangeWallet, lookupWallet } from '../knownWallets';

// Etherscan V2 API (V1 deprecated)
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = '1'; // Ethereum mainnet

// Top ERC-20 tokens where whale activity is concentrated
const WHALE_TOKENS = [
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    decimals: 6,
    minAmount: 100_000, // $100K minimum
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    decimals: 6,
    minAmount: 100_000,
  },
  {
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    symbol: 'WBTC',
    decimals: 8,
    minAmount: 0,
    minUsd: 100_000, // $100K minimum
  },
];

// Known large on-chain movers — queried for their token transfer history
const WHALE_ADDRESSES_FOR_TOKENS = [
  '0x5754284f345afc66a98fbb0a0afe71e0f007b949', // Tether Treasury
  '0x55FE002aefF02F77364de339a1292923A15844B8', // Circle (USDC issuer)
  '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', // Binance 7 (active hot wallet)
  '0xD551234Ae421e3BCBA99A0Da6d736074f22192FF', // Binance 8
  '0x564286362092D8e7936f0549571a803B203aAceD', // Binance 9
  '0x0681d8Db095565FE8A346fA0277bFfDe9C0edBbF', // Binance 10
  '0xfE9e8709d3215310075d67E3ed32A380CCf451C8', // Binance 11
  '0x4E9ce36E442e55EcD9025B9a6E0D88485d628A67', // Binance 12 (BSC bridge)
];

const ETH_PRICE_FALLBACK = 2100;
const BTC_PRICE_FALLBACK = 77000;

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

async function getPrices(): Promise<TokenPrice> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
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

function inferType(from: string, to: string): TxType {
  const fromEx = isExchangeWallet(from);
  const toEx = isExchangeWallet(to);
  if (fromEx && !toEx) return 'transfer';
  if (!fromEx && toEx) return 'transfer';
  return 'transfer';
}

async function fetchTokenTxsForAddress(
  address: string,
  apiKey: string,
  prices: TokenPrice,
  oneDayAgo: number,
  seen: Set<string>
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  try {
    const url = new URL(ETHERSCAN_V2);
    url.searchParams.set('chainid', CHAIN_ID);
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
      if (seen.has(tx.hash)) continue;
      const timestamp = parseInt(tx.timeStamp, 10);
      if (timestamp < oneDayAgo) continue;

      const decimals = parseInt(tx.tokenDecimal, 10) || 18;
      const rawAmount = parseInt(tx.value, 10) / Math.pow(10, decimals);
      const sym = tx.tokenSymbol?.toUpperCase() ?? '';

      let usdValue: number;
      if (sym === 'USDT' || sym === 'USDC' || sym === 'BUSD' || sym === 'DAI') {
        usdValue = rawAmount; // stablecoin ≈ USD
      } else if (sym === 'WBTC') {
        usdValue = rawAmount * prices.btc;
      } else if (sym === 'WETH') {
        usdValue = rawAmount * prices.eth;
      } else {
        continue; // skip unknown tokens
      }

      if (usdValue < 100_000) continue; // $100K minimum

      seen.add(tx.hash);
      results.push({
        id: `eth-${tx.hash}`,
        hash: tx.hash,
        chain: 'ETH',
        from: tx.from,
        to: tx.to,
        value: usdValue,
        amount: rawAmount,
        token: tx.tokenSymbol || sym,
        timestamp: timestamp * 1000,
        blockNumber: parseInt(tx.blockNumber, 10),
        type: inferType(tx.from, tx.to),
        isWhale: usdValue >= 500_000,
        source: 'etherscan',
      });
    }
  } catch {
    // silently skip
  }
  return results;
}

export async function fetchEtherscanTransactions(): Promise<Transaction[]> {
  const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const [prices] = await Promise.all([getPrices()]);
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const seen = new Set<string>();
  const allResults: Transaction[] = [];

  // Query known whale addresses for large token transfers
  const addrResults = await Promise.allSettled(
    WHALE_ADDRESSES_FOR_TOKENS.map(addr =>
      fetchTokenTxsForAddress(addr, apiKey, prices, oneDayAgo, seen)
    )
  );

  for (const r of addrResults) {
    if (r.status === 'fulfilled') {
      allResults.push(...r.value);
    }
  }

  return allResults.sort((a, b) => b.timestamp - a.timestamp);
}
