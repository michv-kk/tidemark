import { Transaction, ChainId } from '../types';

const MIN_VOLUME_USD = 500_000;

// Top token addresses to query
const TOKEN_ADDRESSES = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
];

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  volume: { h24: number };
  liquidity?: { usd?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
}

function mapChainId(dexChain: string): ChainId | null {
  const map: Record<string, ChainId> = {
    ethereum: 'ETH',
    bsc: 'BSC',
    arbitrum: 'ARB',
    polygon: 'MATIC',
    avalanche: 'AVAX',
  };
  return map[dexChain.toLowerCase()] ?? null;
}

export async function fetchDexScreenerTransactions(): Promise<Transaction[]> {
  const results: Transaction[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    TOKEN_ADDRESSES.map(async (tokenAddr) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`,
          { signal: AbortSignal.timeout(12000) }
        );
        if (!res.ok) return;

        const data = await res.json();
        const pairs: DexPair[] = data?.pairs ?? [];

        for (const pair of pairs) {
          if ((pair.volume?.h24 ?? 0) < MIN_VOLUME_USD) continue;

          const chain = mapChainId(pair.chainId);
          if (!chain) continue;

          const pairId = pair.pairAddress;
          if (seen.has(pairId)) continue;
          seen.add(pairId);

          const volume24h = pair.volume.h24;
          const token = pair.baseToken.symbol;
          const priceUsd = parseFloat(pair.priceUsd ?? '0');
          const tokenAmount = priceUsd > 0 ? volume24h / priceUsd : 0;

          // Timestamp = when this data was fetched (24h aggregate, not a single point in time)
          const timestamp = Date.now();

          results.push({
            // Stable ID: pairAddress + hour bucket — deduplicates across polls within same hour
            id: `dex-${pairId}-${Math.floor(Date.now() / 3_600_000)}`,
            hash: pairId,
            chain,
            from: pair.quoteToken.address,
            to: pair.baseToken.address,
            value: volume24h,
            amount: tokenAmount,
            token,
            timestamp,
            blockNumber: 0,
            type: 'swap',
            isWhale: volume24h >= 500_000,
            source: 'dexscreener',
          });

          // Only take top pairs to avoid flooding the feed
          if (results.length >= 20) return;
        }
      } catch {
        // silently skip on error
      }
    })
  );

  return results.sort((a, b) => b.value - a.value);
}
