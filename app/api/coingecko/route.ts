import { NextRequest, NextResponse } from 'next/server';

const CG_BASE = 'https://api.coingecko.com/api/v3';

const ALLOWED_PREFIXES = ['/global', '/coins/markets', '/simple/price', '/coins/', '/search', '/ping'];

// TTL per path type (seconds) — used for Next.js Data Cache (persists on Vercel)
function getRevalidate(path: string): number {
  if (path.startsWith('/coins/markets') || path.startsWith('/global')) return 120;
  if (path.startsWith('/simple/price')) return 60;
  if (path.startsWith('/search/trending')) return 300;
  return 60;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'Missing or invalid path' }, { status: 400 });
  }

  const allowed = ALLOWED_PREFIXES.some(p => path.startsWith(p));
  if (!allowed) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  const upstreamParams = new URLSearchParams();
  searchParams.forEach((v, k) => { if (k !== 'path') upstreamParams.set(k, v); });

  const upstreamUrl = `${CG_BASE}${path}${upstreamParams.size > 0 ? '?' + upstreamParams.toString() : ''}`;
  const revalidate = getRevalidate(path);

  try {
    // next: { revalidate } uses Next.js Data Cache — persists across Vercel invocations
    const res = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      next: { revalidate },
    });

    if (res.status === 429) {
      return NextResponse.json(
        { error: 'CoinGecko rate limit — please retry in a moment' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!res.ok) {
      return NextResponse.json({ error: `CoinGecko returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': `public, max-age=${revalidate}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
