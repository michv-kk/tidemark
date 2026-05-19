import { NextResponse } from 'next/server';

// Vercel hobby: 10s max. Pro: up to 300s. Set 25s for safety on Pro.
export const maxDuration = 25;

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';
const ETH_BASE = 'https://api.etherscan.io/v2/api';
const OWLRACLE  = 'https://api.owlracle.info/v4/eth/gas';
const CG_PRICE  = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

interface GasResult {
  SafeGasPrice: string;
  ProposeGasPrice: string;
  FastGasPrice: string;
  suggestBaseFee: string;
}

// ── Etherscan gas oracle (next: revalidate = Vercel Data Cache, 20s) ─────────
async function fetchEtherscanGas(): Promise<GasResult> {
  const url = `${ETH_BASE}?chainid=1&module=gastracker&action=gasoracle&apikey=${ETHERSCAN_KEY}`;
  const res = await fetch(url, { next: { revalidate: 20 } });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== '1' || !json.result) throw new Error(`Etherscan: ${json.message ?? 'rate limited'}`);
  return json.result as GasResult;
}

// ── Owlracle fallback (free, no key, 20s cache) ───────────────────────────────
async function fetchOwlracleGas(): Promise<GasResult> {
  const res = await fetch(OWLRACLE, { next: { revalidate: 20 } });
  if (!res.ok) throw new Error(`Owlracle HTTP ${res.status}`);
  const json = await res.json();
  const speeds = json.speeds as Array<{ maxFeePerGas: number; baseFee: number }>;
  if (!speeds || speeds.length < 3) throw new Error('Owlracle: unexpected shape');
  return {
    SafeGasPrice:    speeds[0].maxFeePerGas.toFixed(6),
    ProposeGasPrice: speeds[1].maxFeePerGas.toFixed(6),
    FastGasPrice:    speeds[2].maxFeePerGas.toFixed(6),
    suggestBaseFee:  speeds[0].baseFee.toFixed(6),
  };
}

// ── ETH price (60s cache) ─────────────────────────────────────────────────────
async function fetchEthPrice(): Promise<number> {
  try {
    const res = await fetch(CG_PRICE, { next: { revalidate: 60 } });
    if (!res.ok) return 2100;
    const json = await res.json();
    return json?.ethereum?.usd ?? 2100;
  } catch {
    return 2100;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function GET() {
  // Fetch gas + ETH price in parallel
  const [gasResult, ethPrice] = await Promise.allSettled([
    (async () => {
      try { return await fetchEtherscanGas(); }
      catch (e) {
        console.warn('[gas] Etherscan failed:', (e as Error).message, '→ trying Owlracle');
        return await fetchOwlracleGas();
      }
    })(),
    fetchEthPrice(),
  ]);

  const gas   = gasResult.status  === 'fulfilled' ? gasResult.value  : null;
  const price = ethPrice.status === 'fulfilled' ? ethPrice.value : 2100;

  if (!gas) {
    return NextResponse.json(
      { gas: null, ethPrice: price, gasError: 'All gas sources unavailable — try again shortly' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ gas, ethPrice: price }, {
    headers: { 'Cache-Control': 'public, max-age=15' },
  });
}
