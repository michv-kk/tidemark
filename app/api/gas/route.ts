import { NextResponse } from 'next/server';

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';
const ETH_BASE = 'https://api.etherscan.io/v2/api';
const OWLRACLE  = 'https://api.owlracle.info/v4/eth/gas';
const CG_PRICE  = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

// Server-side in-memory cache (survives across requests within same server instance)
interface GasResult {
  SafeGasPrice: string;
  ProposeGasPrice: string;
  FastGasPrice: string;
  suggestBaseFee: string;
}

const cache: Record<string, { data: unknown; ts: number }> = {};
const GAS_TTL   = 20_000;  // 20s
const PRICE_TTL = 90_000;  // 90s

function getCached(key: string): unknown | null {
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < (key === 'gas' ? GAS_TTL : PRICE_TTL)) return hit.data;
  return null;
}
function setCached(key: string, data: unknown) {
  cache[key] = { data, ts: Date.now() };
}

// ── Etherscan gas oracle ───────────────────────────────────────────────────────
async function fetchEtherscanGas(): Promise<GasResult> {
  const url = `${ETH_BASE}?chainid=1&module=gastracker&action=gasoracle&apikey=${ETHERSCAN_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== '1' || !json.result) throw new Error(`Etherscan: ${json.message ?? 'rate limited'}`);
  return json.result as GasResult;
}

// ── Owlracle fallback (free, no key) ─────────────────────────────────────────
async function fetchOwlracleGas(): Promise<GasResult> {
  const res = await fetch(OWLRACLE, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`Owlracle HTTP ${res.status}`);
  const json = await res.json();
  const speeds = json.speeds as Array<{ maxFeePerGas: number; baseFee: number }>;
  if (!speeds || speeds.length < 3) throw new Error('Owlracle: unexpected shape');
  // Map to Etherscan-compatible shape
  return {
    SafeGasPrice:    speeds[0].maxFeePerGas.toFixed(6),
    ProposeGasPrice: speeds[1].maxFeePerGas.toFixed(6),
    FastGasPrice:    speeds[2].maxFeePerGas.toFixed(6),
    suggestBaseFee:  speeds[0].baseFee.toFixed(6),
  };
}

// ── ETH price ─────────────────────────────────────────────────────────────────
async function fetchEthPrice(): Promise<number> {
  const res = await fetch(CG_PRICE, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return 2100;
  const json = await res.json();
  return json?.ethereum?.usd ?? 2100;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  // Return from cache if fresh
  const cachedGas   = getCached('gas')   as GasResult | null;
  const cachedPrice = getCached('price') as number    | null;

  if (cachedGas && cachedPrice) {
    return NextResponse.json({ gas: cachedGas, ethPrice: cachedPrice }, {
      headers: { 'Cache-Control': 'public, max-age=15', 'X-Cache': 'HIT' },
    });
  }

  // Fetch gas: try Etherscan first, fall back to Owlracle
  let gas: GasResult | null = cachedGas;
  let gasSource = 'cache';

  if (!gas) {
    try {
      gas = await fetchEtherscanGas();
      gasSource = 'etherscan';
    } catch (e1) {
      console.warn('[gas] Etherscan failed:', (e1 as Error).message, '— trying Owlracle');
      try {
        gas = await fetchOwlracleGas();
        gasSource = 'owlracle';
      } catch (e2) {
        console.error('[gas] Owlracle also failed:', (e2 as Error).message);
      }
    }
    if (gas) setCached('gas', gas);
  }

  // Fetch ETH price (independent)
  let ethPrice: number = cachedPrice ?? 2100;
  if (!cachedPrice) {
    try {
      ethPrice = await fetchEthPrice();
      setCached('price', ethPrice);
    } catch {
      // use fallback
    }
  }

  if (!gas) {
    return NextResponse.json(
      { gas: null, ethPrice, gasError: 'All gas sources unavailable — try again shortly' },
      { status: 503 }
    );
  }

  return NextResponse.json({ gas, ethPrice, gasSource }, {
    headers: { 'Cache-Control': 'public, max-age=15', 'X-Cache': 'MISS' },
  });
}
