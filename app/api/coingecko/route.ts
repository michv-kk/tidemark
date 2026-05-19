import { NextRequest, NextResponse } from 'next/server';

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Simple in-memory cache so repeated client requests don't hammer CoinGecko
const cache = new Map<string, { data: unknown; ts: number }>();
// Longer TTL for market data (slow-changing) vs price data (fast-changing)
const TTL_MARKETS = 120_000; // 2 min for /coins/markets
const TTL_DEFAULT = 45_000;  // 45s for everything else

function getTTL(path: string): number {
  if (path.startsWith('/coins/markets') || path.startsWith('/global')) return TTL_MARKETS;
  return TTL_DEFAULT;
}

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
  const ttl = getTTL(path);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=60' },
    });
  }

  // Stale-while-revalidate: return stale immediately, refresh in background
  if (cached) {
    // Return stale data now, trigger background refresh
    fetch(upstreamUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) cache.set(cacheKey, { data, ts: Date.now() }); })
      .catch(() => {});
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'STALE-REVALIDATE', 'Cache-Control': 'public, max-age=30' },
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
