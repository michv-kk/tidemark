import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for Solana JSON-RPC.
// The browser cannot call api.mainnet-beta.solana.com directly (CORS).
// All Solana RPC calls from the client go through here instead.

export const maxDuration = 25;

const SOL_RPC = 'https://api.mainnet-beta.solana.com';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const res = await fetch(SOL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Solana RPC error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[solana proxy]', err);
    return NextResponse.json(
      { error: 'Solana RPC unreachable' },
      { status: 502 }
    );
  }
}
