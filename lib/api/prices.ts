export interface CryptoPrices {
  ETH: number;
  BTC: number;
  BNB: number;
  SOL: number;
  MATIC: number;
  AVAX: number;
  LINK: number;
  UNI: number;
}

const FALLBACK_PRICES: CryptoPrices = {
  ETH: 3420,
  BTC: 67500,
  BNB: 580,
  SOL: 148,
  MATIC: 0.72,
  AVAX: 34,
  LINK: 14.5,
  UNI: 7.8,
};

const COIN_IDS: Record<keyof CryptoPrices, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  BNB: 'binancecoin',
  SOL: 'solana',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
};

let cache: { prices: CryptoPrices; at: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

export async function fetchCryptoPrices(): Promise<CryptoPrices> {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return cache.prices;
  }

  try {
    const ids = Object.values(COIN_IDS).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      return cache?.prices ?? FALLBACK_PRICES;
    }

    const data = await res.json();

    const prices: CryptoPrices = {
      ETH: data[COIN_IDS.ETH]?.usd ?? FALLBACK_PRICES.ETH,
      BTC: data[COIN_IDS.BTC]?.usd ?? FALLBACK_PRICES.BTC,
      BNB: data[COIN_IDS.BNB]?.usd ?? FALLBACK_PRICES.BNB,
      SOL: data[COIN_IDS.SOL]?.usd ?? FALLBACK_PRICES.SOL,
      MATIC: data[COIN_IDS.MATIC]?.usd ?? FALLBACK_PRICES.MATIC,
      AVAX: data[COIN_IDS.AVAX]?.usd ?? FALLBACK_PRICES.AVAX,
      LINK: data[COIN_IDS.LINK]?.usd ?? FALLBACK_PRICES.LINK,
      UNI: data[COIN_IDS.UNI]?.usd ?? FALLBACK_PRICES.UNI,
    };

    cache = { prices, at: Date.now() };
    return prices;
  } catch {
    return cache?.prices ?? FALLBACK_PRICES;
  }
}
