import { Transaction, ChainId, TxType } from './types';
import { KNOWN_WALLETS } from './knownWallets';

const CHAINS: { id: ChainId; weight: number; nativeToken: string; blockTime: number }[] = [
  { id: 'ETH',   weight: 40, nativeToken: 'ETH',   blockTime: 12 },
  { id: 'BTC',   weight: 20, nativeToken: 'BTC',   blockTime: 600 },
  { id: 'BSC',   weight: 12, nativeToken: 'BNB',   blockTime: 3 },
  { id: 'ARB',   weight: 10, nativeToken: 'ETH',   blockTime: 2 },
  { id: 'MATIC', weight: 8,  nativeToken: 'MATIC', blockTime: 2 },
  { id: 'AVAX',  weight: 10, nativeToken: 'AVAX',  blockTime: 2 },
];

const TOKENS_BY_CHAIN: Record<ChainId, string[]> = {
  ETH:   ['ETH', 'USDT', 'USDC', 'WBTC', 'DAI', 'LINK', 'UNI', 'AAVE', 'MKR', 'CRV'],
  BTC:   ['BTC'],
  BSC:   ['BNB', 'BUSD', 'CAKE', 'USDT'],
  ARB:   ['ETH', 'ARB', 'USDC', 'USDT', 'GMX'],
  MATIC: ['MATIC', 'USDC', 'USDT', 'AAVE'],
  AVAX:  ['AVAX', 'USDC', 'JOE', 'USDT'],
};

const TOKEN_PRICES: Record<string, number> = {
  BTC: 95000, ETH: 3200, BNB: 580, MATIC: 0.52,
  AVAX: 34, ARB: 1.1, LINK: 14.5, UNI: 7.8,
  AAVE: 88, MKR: 1580, CRV: 0.55, GMX: 32,
  JOE: 0.42, CAKE: 2.8,
  USDT: 1, USDC: 1, DAI: 1, BUSD: 1, WBTC: 95000,
};

const TX_TYPES: TxType[] = ['transfer', 'transfer', 'transfer', 'swap', 'swap', 'bridge', 'stake', 'unstake', 'liquidation'];

const blockNumbers: Record<string, number> = {
  ETH: 22_000_000, BTC: 895_000, BSC: 42_000_000,
  ARB: 220_000_000, MATIC: 58_000_000, AVAX: 48_000_000,
};

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function weightedChoice<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function generateHash(chain: ChainId): string {
  const chars = '0123456789abcdef';
  const len = chain === 'BTC' ? 64 : 66;
  const prefix = chain === 'BTC' ? '' : '0x';
  let hash = prefix;
  for (let i = 0; i < len; i++) hash += chars[Math.floor(Math.random() * 16)];
  return hash;
}

function generateAddress(chain: ChainId): string {
  if (chain === 'BTC') {
    const prefixes = ['1', '3', 'bc1q'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let addr = prefix;
    for (let i = 0; i < 30; i++) addr += chars[Math.floor(Math.random() * chars.length)];
    return addr;
  }
  let addr = '0x';
  const chars = '0123456789abcdef';
  for (let i = 0; i < 40; i++) addr += chars[Math.floor(Math.random() * 16)];
  return addr;
}

function getRandomKnownAddress(chain: ChainId): string {
  const ethWallets = KNOWN_WALLETS.filter(w => !w.address.startsWith('1') && !w.address.startsWith('3'));
  const btcWallets = KNOWN_WALLETS.filter(w => w.address.startsWith('1') || w.address.startsWith('3') || w.address.startsWith('3'));
  const pool = chain === 'BTC' ? btcWallets : ethWallets;
  if (pool.length === 0) return generateAddress(chain);
  return pool[Math.floor(Math.random() * pool.length)].address;
}

function getValueTier(): { min: number; max: number; probability: number } {
  const tiers = [
    { min: 100_000, max: 500_000, probability: 0.45 },
    { min: 500_000, max: 1_000_000, probability: 0.25 },
    { min: 1_000_000, max: 5_000_000, probability: 0.15 },
    { min: 5_000_000, max: 20_000_000, probability: 0.09 },
    { min: 20_000_000, max: 100_000_000, probability: 0.05 },
    { min: 100_000_000, max: 500_000_000, probability: 0.01 },
  ];
  const r = Math.random();
  let cumulative = 0;
  for (const tier of tiers) {
    cumulative += tier.probability;
    if (r <= cumulative) return tier;
  }
  return tiers[0];
}

let idCounter = 1;

export function generateTransaction(): Transaction {
  const chain = weightedChoice(CHAINS);
  const tokens = TOKENS_BY_CHAIN[chain.id];
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  const price = TOKEN_PRICES[token] ?? 1;
  const tier = getValueTier();
  const usdValue = rand(tier.min, tier.max);
  const amount = usdValue / price;
  const type = TX_TYPES[Math.floor(Math.random() * TX_TYPES.length)];
  const useKnownFrom = Math.random() < 0.35;
  const useKnownTo = Math.random() < 0.35;
  const from = useKnownFrom ? getRandomKnownAddress(chain.id) : generateAddress(chain.id);
  const to = useKnownTo ? getRandomKnownAddress(chain.id) : generateAddress(chain.id);

  blockNumbers[chain.id] = (blockNumbers[chain.id] ?? 0) + 1;

  return {
    id: `tx-${Date.now()}-${idCounter++}`,
    hash: generateHash(chain.id),
    chain: chain.id,
    from,
    to,
    value: usdValue,
    amount,
    token,
    timestamp: Date.now(),
    blockNumber: blockNumbers[chain.id],
    gasUsed: chain.id === 'ETH' ? Math.floor(rand(21000, 300000)) : undefined,
    gasPrice: chain.id === 'ETH' ? rand(10, 80) : undefined,
    type,
    isWhale: usdValue >= 500_000,
  };
}

export function generateInitialTransactions(count = 40): Transaction[] {
  const txs: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const tx = generateTransaction();
    tx.timestamp = Date.now() - Math.floor(rand(0, 3600_000));
    txs.push(tx);
  }
  return txs.sort((a, b) => b.timestamp - a.timestamp);
}

export function calcTransactionsPerMinute(txs: Transaction[]): number {
  const oneMinAgo = Date.now() - 60_000;
  return txs.filter(t => t.timestamp > oneMinAgo).length;
}

export function calcTotalVolume(txs: Transaction[]): number {
  return txs.reduce((sum, t) => sum + t.value, 0);
}

export function calcMaxTransaction(txs: Transaction[]): Transaction | null {
  if (txs.length === 0) return null;
  return txs.reduce((max, t) => (t.value > max.value ? t : max), txs[0]);
}

export function calcActiveChains(txs: Transaction[]): string[] {
  const oneHourAgo = Date.now() - 3_600_000;
  const active = new Set(txs.filter(t => t.timestamp > oneHourAgo).map(t => t.chain));
  return Array.from(active);
}
