import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 25;

// Multiple Solana RPC endpoints — tried in order until one succeeds.
// Public mainnet-beta is most stable; Alchemy demo adds capacity.
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/solana',
];

async function tryRpc(endpoint: string, body: unknown): Promise<Response | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Reject rate-limit responses (429 body or jsonrpc error code -32005)
    if (json?.error?.code === -32005 || json?.error?.code === 429) return null;
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const endpoint of RPC_ENDPOINTS) {
    const result = await tryRpc(endpoint, body);
    if (result) return result;
  }

  return NextResponse.json({ error: 'All Solana RPC endpoints unavailable' }, { status: 502 });
}
