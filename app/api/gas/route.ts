import { NextResponse } from 'next/server';

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';
const CG_BASE = 'https://api.coingecko.com/api/v3';
const ETH_BASE = 'https://api.etherscan.io/v2/api';

// Server-side cache — survives across requests in the same server instance
const cache = new Map<string, { data: unknown; ts: number }>();
const GAS_TTL = 15_000;   // gas refreshes every 15s
const PRICE_TTL = 60_000; // ETH price every 60s

async function getCached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data as T;
  const data = await fetcher();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

export async function GET() {
  try {
    const [gasData, ethPrice] = await Promise.allSettled([
      getCached('gas', GAS_TTL, async () => {
        const url = `${ETH_BASE}?chainid=1&module=gastracker&action=gasoracle&apikey=${ETHERSCAN_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Etherscan ${res.status}`);
        const json = await res.json();
        if (json.status !== '1' || !json.result) throw new Error('Bad gas response');
        return json.result as {
          SafeGasPrice: string;
          ProposeGasPrice: string;
          FastGasPrice: string;
          suggestBaseFee: string;
        };
      }),

      getCached('eth_price', PRICE_TTL, async () => {
        const res = await fetch(
          `${CG_BASE}/simple/price?ids=ethereum&vs_currencies=usd`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const json = await res.json();
        return (json?.ethereum?.usd as number) ?? 2100;
      }),
    ]);

    return NextResponse.json({
      gas: gasData.status === 'fulfilled' ? gasData.value : null,
      ethPrice: ethPrice.status === 'fulfilled' ? ethPrice.value : 2100,
      gasError: gasData.status === 'rejected' ? gasData.reason?.message : null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=10' },
    });
  } catch (err) {
    return NextResponse.json(
      { gas: null, ethPrice: 2100, gasError: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 }
    );
  }
}
