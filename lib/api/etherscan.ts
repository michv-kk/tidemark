import { Transaction } from '../types';

// All Etherscan fetching is done server-side via /api/whale-txs.
// The server route uses Vercel Data Cache so each chain×token URL is cached
// for 30 s — no rate-limit issues regardless of how many users are online.
export async function fetchEtherscanTransactions(): Promise<Transaction[]> {
  try {
    const res = await fetch('/api/whale-txs', {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Transaction[]) : [];
  } catch {
    return [];
  }
}
