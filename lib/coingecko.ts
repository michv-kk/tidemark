import { CoinData, GlobalMarketData, OHLCPoint } from './types';

// All CoinGecko requests are proxied through /api/coingecko to avoid
// browser-side CORS blocks and rate limits on the free tier.
const PROXY = '/api/coingecko';

const CACHE = new Map<string, { data: unknown; ts: number }>();
const TTL = 45_000; // 45s cache to avoid hammering the proxy

const pendingRequests = new Map<string, Promise<unknown>>();

async function get<T>(path: string, ttl = TTL): Promise<T> {
  const cached = CACHE.get(path);
  if (cached && Date.now() - cached.ts < ttl) return cached.data as T;

  // Deduplicate concurrent requests for the same path
  const existing = pendingRequests.get(path);
  if (existing) return existing as Promise<T>;

  // Split path and query string so the proxy can forward them correctly
  const [pathOnly, qs] = path.split('?');
  const proxyUrl = `${PROXY}?path=${encodeURIComponent(pathOnly)}${qs ? '&' + qs : ''}`;

  const req = fetch(proxyUrl, {
    headers: { Accept: 'application/json' },
  }).then(async res => {
    if (res.status === 429) {
      // Rate limited — return cached data if available, else throw
      const stale = CACHE.get(path);
      if (stale) return stale.data;
      throw new Error('Rate limited');
    }
    if (!res.ok) throw new Error(`CoinGecko proxy ${res.status}`);
    const data = await res.json();
    CACHE.set(path, { data, ts: Date.now() });
    return data;
  }).finally(() => pendingRequests.delete(path));

  pendingRequests.set(path, req);
  return req as Promise<T>;
}

export async function fetchTopCoins(limit = 50): Promise<CoinData[]> {
  return get<CoinData[]>(
    `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h,7d`
  );
}

export async function fetchGlobalData(): Promise<GlobalMarketData> {
  const res = await get<{ data: GlobalMarketData }>('/global', 60_000);
  return res.data;
}

export async function fetchOHLC(coinId: string, days: number): Promise<OHLCPoint[]> {
  const raw = await get<[number, number, number, number, number][]>(
    `/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
    60_000
  );
  return raw.map(([ts, o, h, l, c]) => ({
    time: Math.floor(ts / 1000),
    open: o,
    high: h,
    low: l,
    close: c,
  }));
}

export async function fetchCoinPrice(ids: string): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  return get(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
}

export async function fetchTickerData(): Promise<{ symbol: string; price: number; change: number }[]> {
  try {
    const coins = await fetchTopCoins(20);
    return coins.map(c => ({
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change: c.price_change_percentage_24h ?? 0,
    }));
  } catch {
    return FALLBACK_TICKER;
  }
}

// Fallback prices — only used if ALL CoinGecko requests fail (shown briefly)
// Updated: May 2025
const FALLBACK_TICKER = [
  { symbol: 'BTC', price: 77000, change: 0 },
  { symbol: 'ETH', price: 2100, change: 0 },
  { symbol: 'BNB', price: 640, change: 0 },
  { symbol: 'SOL', price: 170, change: 0 },
  { symbol: 'XRP', price: 2.3, change: 0 },
  { symbol: 'ADA', price: 0.73, change: 0 },
  { symbol: 'DOGE', price: 0.21, change: 0 },
  { symbol: 'AVAX', price: 23, change: 0 },
  { symbol: 'LINK', price: 14, change: 0 },
  { symbol: 'POL', price: 0.25, change: 0 },
  { symbol: 'UNI', price: 6.5, change: 0 },
  { symbol: 'ARB', price: 0.42, change: 0 },
  { symbol: 'OP', price: 0.9, change: 0 },
  { symbol: 'ATOM', price: 5.5, change: 0 },
  { symbol: 'NEAR', price: 3.1, change: 0 },
  { symbol: 'APT', price: 6.8, change: 0 },
  { symbol: 'SUI', price: 3.8, change: 0 },
  { symbol: 'TIA', price: 3.2, change: 0 },
  { symbol: 'INJ', price: 10, change: 0 },
  { symbol: 'TON', price: 3.1, change: 0 },
];

export { FALLBACK_TICKER };
