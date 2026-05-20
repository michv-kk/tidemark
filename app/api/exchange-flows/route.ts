import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

const ETHERSCAN_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY ?? '';

// Multiple verified hot-wallet addresses per exchange — we aggregate them all.
// Using several addresses increases the chance of catching recent activity even
// as exchanges rotate their wallets.
const EXCHANGES = [
  {
    name: 'Binance',
    color: '#F0B90B',
    initials: 'BN',
    addresses: [
      '0x28C6c06298d514Db089934071355E5743bf21d60', // Binance 14 (most active)
      '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', // Binance 15
    ],
  },
  {
    name: 'Coinbase',
    color: '#3B82F6',
    initials: 'CB',
    addresses: [
      '0xa9D1e08C7793af67e9d92fe308d5697FB81d3E43', // Coinbase 10
      '0x77696bb39917C91A0c3908D577d5e322095425cA', // Coinbase Prime
    ],
  },
  {
    name: 'Kraken',
    color: '#8B5CF6',
    initials: 'KR',
    addresses: [
      '0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf', // Kraken 14 (most active)
      '0x0A869d79a7052C7f1b55a8EbbEf6B81b1571bf4e', // Kraken 1
    ],
  },
  {
    name: 'OKX',
    color: '#00C8FF',
    initials: 'OX',
    addresses: [
      '0x98EC059Dc3aDFBdd63429454dEb14c482827F634', // OKX 2
      '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', // OKX 1
    ],
  },
];

type Tx = { timeStamp: string; to: string; from: string; value: string; isError: string };

async function fetchOneAddress(address: string, delayMs: number): Promise<Tx[]> {
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist` +
    `&address=${address}&page=1&offset=200&sort=desc&apikey=${ETHERSCAN_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '1' && data.message !== 'No transactions found') return [];
    return Array.isArray(data.result) ? data.result : [];
  } catch {
    return [];
  }
}

async function fetchFlowForExchange(
  exchange: typeof EXCHANGES[0],
  startDelay: number,
) {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;

  // Fetch all addresses for this exchange, staggered by 350ms each
  const allTxs: Tx[] = [];
  const results = await Promise.allSettled(
    exchange.addresses.map((addr, i) => fetchOneAddress(addr, startDelay + i * 350))
  );
  for (const r of results) {
    if (r.status === 'fulfilled') allTxs.push(...r.value);
  }

  const allAddrsLower = new Set(exchange.addresses.map(a => a.toLowerCase()));
  const seen = new Set<string>();

  let inEth = 0;
  let outEth = 0;
  let txCount = 0;

  for (const tx of allTxs) {
    if (seen.has(tx.timeStamp + tx.from + tx.value)) continue; // basic dedup
    seen.add(tx.timeStamp + tx.from + tx.value);

    if (parseInt(tx.timeStamp, 10) <= cutoff) continue;
    if (tx.isError !== '0') continue;

    const val = parseInt(tx.value, 10) / 1e18;
    if (allAddrsLower.has(tx.to?.toLowerCase())) inEth += val;
    else outEth += val;
    txCount++;
  }

  return {
    name:     exchange.name,
    color:    exchange.color,
    initials: exchange.initials,
    netEth:   inEth - outEth,
    txCount,
    inEth,
    outEth,
  };
}

export async function GET() {
  // Stagger exchange groups by 800ms to stay within rate limit
  const results = await Promise.allSettled(
    EXCHANGES.map((ex, i) => fetchFlowForExchange(ex, i * 800))
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
