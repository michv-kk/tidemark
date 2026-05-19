import { NextResponse } from 'next/server';

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

const EXCHANGES = [
  { name: 'Binance',  address: '0x28C6c06298d514Db089934071355E5743bf21d60', color: '#F0B90B', initials: 'BN' },
  { name: 'Coinbase', address: '0x503828976D22510aad0201ac7EC88293211D23Da', color: '#3B82F6', initials: 'CB' },
  { name: 'Kraken',   address: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2', color: '#8B5CF6', initials: 'KR' },
];

// Cache for 60 seconds
let cache: { data: unknown; ts: number } | null = null;

async function fetchFlowForExchange(exchange: typeof EXCHANGES[0]) {
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${exchange.address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== '1' || !Array.isArray(data.result)) {
    throw new Error(data.message ?? 'Bad response');
  }

  const cutoff = Date.now() / 1000 - 86400;
  const recent = (data.result as Array<{ timeStamp: string; to: string; from: string; value: string }>)
    .filter(tx => parseInt(tx.timeStamp, 10) > cutoff);

  let inEth = 0;
  let outEth = 0;
  const addrLower = exchange.address.toLowerCase();

  for (const tx of recent) {
    const val = parseInt(tx.value, 10) / 1e18;
    if (tx.to?.toLowerCase() === addrLower) inEth += val;
    else outEth += val;
  }

  return {
    name: exchange.name,
    color: exchange.color,
    initials: exchange.initials,
    netEth: inEth - outEth,
    txCount: recent.length,
    inEth,
    outEth,
  };
}

export async function GET() {
  // Serve from cache if fresh
  if (cache && Date.now() - cache.ts < 60_000) {
    return NextResponse.json(cache.data);
  }

  try {
    // Fetch sequentially to avoid rate-limiting (3 req/sec on Etherscan)
    const results = [];
    for (const exchange of EXCHANGES) {
      try {
        const flow = await fetchFlowForExchange(exchange);
        results.push(flow);
      } catch {
        results.push({
          name: exchange.name,
          color: exchange.color,
          initials: exchange.initials,
          netEth: null,
          txCount: 0,
          inEth: 0,
          outEth: 0,
        });
      }
    }

    cache = { data: results, ts: Date.now() };
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
