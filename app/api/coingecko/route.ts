import { NextRequest, NextResponse } from 'next/server';

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Simple in-memory cache so repeated client requests don't hammer CoinGecko
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 45_000; // 45s

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'Missing or invalid path' }, { status: 400 });
  }

  // Only allow known safe paths to prevent open proxy abuse
  const ALLOWED_PREFIXES = ['/global', '/coins/markets', '/simple/price', '/coins/', '/search', '/ping'];
  // Note: '/search' prefix covers both /search?query=... and /search/trending
  const allowed = ALLOWED_PREFIXES.some(p => path.startsWith(p));
  if (!allowed) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  // Strip any extra query params from the path (passed via searchParams instead)
  const upstreamParams = new URLSearchParams();
  searchParams.forEach((v, k) => {
    if (k !== 'path') upstreamParams.set(k, v);
  });

  const upstreamUrl = `${CG_BASE}${path}${upstreamParams.size > 0 ? '?' + upstreamParams.toString() : ''}`;

  const cacheKey = upstreamUrl;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=30' },
    });
  }

  try {
    const res = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 429) {
      // Return stale cache if available rather than an error
      const stale = cache.get(cacheKey);
      if (stale) {
        return NextResponse.json(stale.data, {
          headers: { 'X-Cache': 'STALE', 'Cache-Control': 'public, max-age=10' },
        });
      }
      return NextResponse.json(
        { error: 'CoinGecko rate limit — please retry in a moment' },
        { status: 429 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `CoinGecko returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    cache.set(cacheKey, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, max-age=30' },
    });
  } catch (err) {
    const stale = cache.get(cacheKey);
    if (stale) {
      return NextResponse.json(stale.data, {
        headers: { 'X-Cache': 'STALE-ERROR', 'Cache-Control': 'public, max-age=10' },
      });
    }
    const message = err instanceof Error ? err.message : 'Fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
