export type ChainId = 'ETH' | 'BTC' | 'BSC' | 'ARB' | 'MATIC' | 'AVAX';
export type TxType = 'transfer' | 'swap' | 'bridge' | 'stake' | 'unstake' | 'liquidation' | 'mint' | 'burn';
export type WalletType = 'exchange' | 'fund' | 'whale' | 'defi' | 'bridge' | 'unknown' | 'protocol';

export interface Transaction {
  id: string;
  hash: string;
  chain: string; // keep as string so old Redis records with any chain don't break
  from: string;
  to: string;
  value: number;
  amount: number;
  token: string;
  timestamp: number;
  blockNumber: number;
  gasUsed?: number;
  gasPrice?: number;
  type: TxType;
  isWhale: boolean;
  source?: 'etherscan' | 'mempool' | 'blockchair' | 'rpc' | 'dexscreener' | 'generated';
  aiInsight?: string;
}

export interface KnownWallet {
  address: string;
  label: string;
  type: WalletType;
  exchange?: string;
}

export interface WalletStats {
  address: string;
  label?: string;
  type: WalletType;
  firstSeenTimestamp?: number;
  totalVolume: number;
  txCount: number;
  whaleScore: number;
  avgTxSize: number;
  recentTxs: Transaction[];
}

export interface AlertNotification {
  id: string;
  type: 'mega_whale' | 'whale' | 'exchange' | 'info';
  message: string;
  detail: string;
  timestamp: number;
  transaction?: Transaction;
  read: boolean;
}

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  market_cap: number;
  total_volume: number;
  image: string;
  market_cap_rank: number;
  circulating_supply?: number;
  high_24h?: number;
  low_24h?: number;
}

export interface GlobalMarketData {
  total_market_cap: { usd: number };
  total_volume: { usd: number };
  market_cap_percentage: { btc: number; eth: number };
  active_cryptocurrencies: number;
  market_cap_change_percentage_24h_usd: number;
}

export interface OHLCPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AppSettings {
  currency: 'USD' | 'EUR' | 'GBP' | 'PLN';
  minWhaleSize: 100000 | 500000 | 1000000 | 10000000;
  soundAlerts: boolean;
  autoRefresh: 10 | 30 | 60;
  theme: 'dark';
  etherscanApiKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'USD',
  minWhaleSize: 500000,
  soundAlerts: false,
  autoRefresh: 30,
  theme: 'dark',
  etherscanApiKey: '',
};
