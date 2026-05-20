import { NextResponse } from 'next/server';

// Force dynamic so this route is never pre-rendered at build time.
// Build servers have shared IPs that quickly hit Etherscan's rate limit.
// At runtime each user request hits the Vercel Data Cache instead.
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

// Verified active hot-wallet addresses (main deposit/withdrawal wallets)
const EXCHANGES = [
  { name: 'Binance',  address: '0x28C6c06298d514Db089934071355E5743bf21d60', color: '#F0B90B', initials: 'BN' },
  { name: 'Coinbase', address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', color: '#3B82F6', initials: 'CB' },
  { name: 'Kraken',   address: '0x53d284357ec70cE289D6D64134DfAc8E511c8a3D', color: '#8B5CF6', initials: 'KR' },
  { name: 'OKX',      address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', color: '#00C8FF', initials: 'OX' },
];

type Tx = { timeStamp: string; to: string; from: string; value: string; isError: string };

async function fetchFlowForExchange(
  exchange: typeof EXCHANGES[0],
  delayMs = 0,
): Promise<{
  name: string; color: string; initials: string;
  netEth: number; txCount: number; inEth: number; outEth: number;
}> {
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist` +
    `&address=${exchange.address}&page=1&offset=200&sort=desc` +
    `&apikey=${ETHERSCAN_KEY}`;

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  // Etherscan returns status:'0' with result:[] when there are no txs — that's fine
  if (data.status !== '1' && data.message !== 'No transactions found') {
    throw new Error(data.message ?? `NOTOK (${exchange.name})`);
  }

  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  const txList: Tx[] = Array.isArray(data.result) ? data.result : [];
  const recent = txList.filter(
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
    name:     exchange.name,
    color:    exchange.color,
    initials: exchange.initials,
    netEth:   inEth - outEth,
    txCount:  recent.length,
    inEth,
    outEth,
  };
}

export async function GET() {
  // Stagger requests by 400 ms each — well within 5 req/s free-tier limit
  const results = await Promise.allSettled(
    EXCHANGES.map((ex, i) => fetchFlowForExchange(ex, i * 400))
  );

  const flows = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[exchange-flows] ${EXCHANGES[i].name} failed:`, (r.reason as Error).message);
    return {
      name:     EXCHANGES[i].name,
      color:    EXCHANGES[i].color,
      initials: EXCHANGES[i].initials,
      netEth:   null as number | null,
      txCount:  0,
      inEth:    0,
      outEth:   0,
      error:    (r.reason as Error).message,
    };
  });

  return NextResponse.json(flows, {
    headers: { 'Cache-Control': 'public, max-age=55' },
  });
}
