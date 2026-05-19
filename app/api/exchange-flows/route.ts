import { NextResponse } from 'next/server';

export const maxDuration = 25;

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

const EXCHANGES = [
  { name: 'Binance',  address: '0x28C6c06298d514Db089934071355E5743bf21d60', color: '#F0B90B', initials: 'BN' },
  { name: 'Coinbase', address: '0x503828976D22510aad0201ac7EC88293211D23Da', color: '#3B82F6', initials: 'CB' },
  { name: 'Kraken',   address: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2', color: '#8B5CF6', initials: 'KR' },
];

type Tx = { timeStamp: string; to: string; from: string; value: string; isError: string };

async function fetchFlowForExchange(exchange: typeof EXCHANGES[0]) {
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist` +
    `&address=${exchange.address}&page=1&offset=100&sort=desc` +
    `&apikey=${ETHERSCAN_KEY}`;

  // next: revalidate uses Vercel Data Cache — persists across cold starts
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data.status !== '1' || !Array.isArray(data.result)) {
    throw new Error(data.message ?? 'Bad response');
  }

  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  const recent = (data.result as Tx[]).filter(
    tx => parseInt(tx.timeStamp, 10) > cutoff && tx.isError === '0'
  );

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
  // Parallel fetches — Vercel Data Cache means repeated calls within 60s
  // return instantly without hitting Etherscan, no rate-limit risk
  const results = await Promise.allSettled(
    EXCHANGES.map(ex => fetchFlowForExchange(ex))
  );

  const flows = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[exchange-flows] ${EXCHANGES[i].name} failed:`, (r.reason as Error).message);
    return {
      name: EXCHANGES[i].name,
      color: EXCHANGES[i].color,
      initials: EXCHANGES[i].initials,
      netEth: null as number | null,
      txCount: 0,
      inEth: 0,
      outEth: 0,
      error: (r.reason as Error).message,
    };
  });

  return NextResponse.json(flows, {
    headers: { 'Cache-Control': 'public, max-age=55' },
  });
}
