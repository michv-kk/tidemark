import { Transaction } from '../types';

// ─── Solana mainnet public RPC — no API key needed ────────────────────────────
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

// ─── Token mints we care about ────────────────────────────────────────────────
const MINT_SYMBOLS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  So11111111111111111111111111111111111111112:    'SOL',  // wrapped SOL
};

// ─── Known Solana whale wallets ───────────────────────────────────────────────
const WHALE_ADDRESSES = [
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Binance hot wallet (SOL)
  'CuieVDEDtLo7FypAMTEKGnAA7ZKJvnqfaMDqcHumyMnv', // Large SOL holder
  'GThUX1Atko4tqhN2NaiTazWSeFWMoAA9HLyKm5Tc9FzR', // Jump Crypto on SOL
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Large Solana whale
  'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5', // Kraken hot wallet (SOL)
];

const MIN_USD = 100_000;  // $100K minimum whale threshold
const SOL_PRICE_FALLBACK = 150;

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function solRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(SOL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    return (json.result as T) ?? null;
  } catch {
    return null;
  }
}

// ─── Price fetch ──────────────────────────────────────────────────────────────

async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      '/api/coingecko?path=%2Fsimple%2Fprice&ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return SOL_PRICE_FALLBACK;
    const data = await res.json();
    return data?.solana?.usd ?? SOL_PRICE_FALLBACK;
  } catch {
    return SOL_PRICE_FALLBACK;
  }
}

// ─── Solana RPC types ─────────────────────────────────────────────────────────

interface SigInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    uiAmount: number | null;
    decimals: number;
  };
}

interface ParsedTx {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];       // native SOL in lamports
    postBalances: number[];
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
  } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
    };
  };
}

// ─── Parse token transfers from a single transaction ─────────────────────────

interface Transfer {
  from: string;
  to: string;
  symbol: string;
  amount: number;
  usdValue: number;
}

function parseTransfers(tx: ParsedTx, solPrice: number): Transfer[] {
  const transfers: Transfer[] = [];
  if (!tx.meta || tx.meta.err) return transfers;

  const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey);
  const pre  = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];

  // ── SPL token transfers ────────────────────────────────────────────────────
  for (const postBal of post) {
    const mint = postBal.mint;
    const symbol = MINT_SYMBOLS[mint];
    if (!symbol) continue; // only track tokens we know

    const preBal  = pre.find(p => p.accountIndex === postBal.accountIndex);
    const preAmt  = preBal?.uiTokenAmount?.uiAmount ?? 0;
    const postAmt = postBal.uiTokenAmount?.uiAmount ?? 0;
    const delta   = postAmt - preAmt;

    if (Math.abs(delta) < 1) continue; // dust

    const usd = symbol === 'SOL' ? Math.abs(delta) * solPrice : Math.abs(delta);
    if (usd < MIN_USD) continue;

    const owner = postBal.owner ?? accountKeys[postBal.accountIndex] ?? '';

    transfers.push({
      from:     delta < 0 ? owner : 'unknown',
      to:       delta > 0 ? owner : 'unknown',
      symbol,
      amount:   Math.abs(delta),
      usdValue: usd,
    });
  }

  // ── Native SOL transfer (large moves between accounts) ────────────────────
  const preSOL  = tx.meta.preBalances;
  const postSOL = tx.meta.postBalances;
  for (let i = 0; i < accountKeys.length; i++) {
    const deltaLamports = (postSOL[i] ?? 0) - (preSOL[i] ?? 0);
    if (deltaLamports <= 0) continue; // only track receivers to avoid double-counting
    const solAmount = deltaLamports / 1e9;
    const usd = solAmount * solPrice;
    if (usd < MIN_USD) continue;

    // Find sender (largest decrease)
    let fromIdx = -1;
    let biggest = 0;
    for (let j = 0; j < accountKeys.length; j++) {
      const decrease = (preSOL[j] ?? 0) - (postSOL[j] ?? 0);
      if (decrease > biggest) { biggest = decrease; fromIdx = j; }
    }

    transfers.push({
      from:     fromIdx >= 0 ? accountKeys[fromIdx] : 'unknown',
      to:       accountKeys[i],
      symbol:   'SOL',
      amount:   solAmount,
      usdValue: usd,
    });
  }

  return transfers;
}

// ─── Fetch transactions for one whale address ─────────────────────────────────

async function fetchForAddress(
  address: string,
  solPrice: number,
  oneDayAgo: number,
  seen: Set<string>,
): Promise<Transaction[]> {
  const results: Transaction[] = [];

  // Step 1: get recent signatures (last 15)
  const sigs = await solRpc<SigInfo[]>('getSignaturesForAddress', [
    address,
    { limit: 15, commitment: 'finalized' },
  ]);
  if (!sigs || !Array.isArray(sigs)) return results;

  // Filter to last 24h, skip failed txs
  const recent = sigs.filter(
    s => !s.err && s.blockTime !== null && (s.blockTime ?? 0) > oneDayAgo
  ).slice(0, 4); // max 4 parsed txs per address to stay within RPC rate limits

  if (recent.length === 0) return results;

  // Step 2: fetch parsed transactions in parallel
  const parsed = await Promise.allSettled(
    recent.map(s =>
      solRpc<ParsedTx>('getParsedTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' },
      ])
    )
  );

  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    if (r.status !== 'fulfilled' || !r.value) continue;

    const sig = recent[i].signature;
    if (seen.has(sig)) continue;

    const tx = r.value;
    const transfers = parseTransfers(tx, solPrice);
    if (transfers.length === 0) continue;

    // Take the biggest transfer in this transaction
    const best = transfers.reduce((max, t) => t.usdValue > max.usdValue ? t : max, transfers[0]);

    seen.add(sig);
    results.push({
      id:          `sol-${sig}`,
      hash:        sig,
      chain:       'SOL',
      from:        best.from,
      to:          best.to,
      value:       best.usdValue,
      amount:      best.amount,
      token:       best.symbol,
      timestamp:   (tx.blockTime ?? 0) * 1000,
      blockNumber: tx.slot ?? 0,
      type:        'transfer',
      isWhale:     best.usdValue >= 500_000,
      source:      'solana',
    });
  }

  return results;
}

// ─── Public export ────────────────────────────────────────────────────────────

export async function fetchSolanaTransactions(): Promise<Transaction[]> {
  const [solPrice] = await Promise.all([getSolPrice()]);
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const seen = new Set<string>();
  const all: Transaction[] = [];

  // Fetch all whale addresses in parallel
  const settled = await Promise.allSettled(
    WHALE_ADDRESSES.map(addr => fetchForAddress(addr, solPrice, oneDayAgo, seen))
  );

  for (const r of settled) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return all.sort((a, b) => b.timestamp - a.timestamp);
}
