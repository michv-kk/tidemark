'use client';
import React, { useEffect, useState } from 'react';
import GlobalMarketStats from '@/components/GlobalMarketStats';
import MarketHeatmap from '@/components/MarketHeatmap';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { CoinData } from '@/lib/types';
import { formatUSD, formatPercent, getChangeColor } from '@/lib/formatters';
import { fetchTopCoins } from '@/lib/coingecko';
import Image from 'next/image';

const TOP_PAIRS = ['BTC', 'ETH', 'SOL', 'BNB', 'ARB', 'AVAX', 'MATIC', 'LINK', 'UNI', 'OP'];

// Map coin symbols to full TradingView symbols (Binance pairs)
const TV_SYMBOL: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT',
  ARB: 'BINANCE:ARBUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  MATIC: 'BINANCE:MATICUSDT',
  LINK: 'BINANCE:LINKUSDT',
  UNI: 'BINANCE:UNIUSDT',
  OP: 'BINANCE:OPUSDT',
};

async function fetchCoins(): Promise<CoinData[]> {
  try { return await fetchTopCoins(50); } catch { return []; }
}

export default function MarketsPage() {
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState('BTC');
  const [tab, setTab] = useState<'overview' | 'heatmap' | 'chart'>('overview');

  useEffect(() => {
    fetchCoins().then(c => { setCoins(c); setLoading(false); });
    const id = setInterval(() => fetchCoins().then(setCoins), 60_000);
    return () => clearInterval(id);
  }, []);

  const gainers = [...coins].sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)).slice(0, 5);
  const losers = [...coins].sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0)).slice(0, 5);

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Markets</h1>
        <p className="text-gray-500 text-sm mt-1">Live cryptocurrency market data</p>
      </div>

      {/* Global stats */}
      <GlobalMarketStats />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        {(['overview', 'heatmap', 'chart'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${
              tab === t ? 'text-cyan-400 border-cyan-400' : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            {t === 'chart' ? 'Price Charts' : t === 'heatmap' ? 'Heatmap' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Gainers / Losers */}
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: '🚀 Top Gainers 24h', data: gainers },
              { title: '📉 Top Losers 24h', data: losers },
            ].map(({ title, data }) => (
              <div key={title} className="bg-[#0d1421] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white">{title}</div>
                <div className="divide-y divide-white/5">
                  {data.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer"
                         onClick={() => { setSelectedPair(c.symbol.toUpperCase()); setTab('chart'); }}>
                      <div className="relative w-7 h-7 flex-shrink-0">
                        <img src={c.image} alt={c.name} className="w-7 h-7 rounded-full" loading="lazy"
                             onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-white text-sm font-medium">{c.symbol.toUpperCase()}</div>
                        <div className="text-gray-500 text-xs">{c.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white text-sm font-mono">{formatUSD(c.current_price)}</div>
                        <div className={`text-xs font-semibold ${getChangeColor(c.price_change_percentage_24h ?? 0)}`}>
                          {formatPercent(c.price_change_percentage_24h ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Full market table */}
          <div className="bg-[#0d1421] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">All Markets</h3>
              {loading && <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Asset</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">24h %</th>
                    <th className="text-right hidden md:table-cell">7d %</th>
                    <th className="text-right hidden lg:table-cell">Market Cap</th>
                    <th className="text-right hidden lg:table-cell">Volume 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {coins.map((c, i) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => { setSelectedPair(c.symbol.toUpperCase()); setTab('chart'); }}>
                      <td className="text-gray-600 text-xs">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <img src={c.image} alt="" className="w-6 h-6 rounded-full" loading="lazy"
                               onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span className="text-white font-medium">{c.symbol.toUpperCase()}</span>
                          <span className="text-gray-500 hidden sm:inline text-xs">{c.name}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono text-white">{formatUSD(c.current_price)}</td>
                      <td className={`text-right font-semibold text-xs ${getChangeColor(c.price_change_percentage_24h ?? 0)}`}>
                        {formatPercent(c.price_change_percentage_24h ?? 0)}
                      </td>
                      <td className={`text-right font-semibold text-xs hidden md:table-cell ${getChangeColor(c.price_change_percentage_7d_in_currency ?? 0)}`}>
                        {c.price_change_percentage_7d_in_currency != null ? formatPercent(c.price_change_percentage_7d_in_currency) : '—'}
                      </td>
                      <td className="text-right text-gray-400 hidden lg:table-cell">{formatUSD(c.market_cap, true)}</td>
                      <td className="text-right text-gray-400 hidden lg:table-cell">{formatUSD(c.total_volume, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Tab */}
      {tab === 'heatmap' && <MarketHeatmap />}

      {/* Charts Tab */}
      {tab === 'chart' && (
        <div className="space-y-4">
          {/* Pair selector */}
          <div className="flex flex-wrap gap-2">
            {TOP_PAIRS.map(sym => (
              <button
                key={sym}
                onClick={() => setSelectedPair(sym)}
                className={`filter-pill ${selectedPair === sym ? 'active' : ''}`}
              >
                {sym}/USD
              </button>
            ))}
          </div>
          <TradingViewWidget
            symbol={TV_SYMBOL[selectedPair] ?? `BINANCE:${selectedPair}USDT`}
            height={520}
            interval="D"
          />

          {/* Info cards row */}
          {coins.length > 0 && (() => {
            const coin = coins.find(c => c.symbol.toUpperCase() === selectedPair);
            if (!coin) return null;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Current Price', value: formatUSD(coin.current_price) },
                  { label: '24h Change', value: formatPercent(coin.price_change_percentage_24h ?? 0), colored: true, change: coin.price_change_percentage_24h ?? 0 },
                  { label: '24h High', value: formatUSD(coin.high_24h ?? 0) },
                  { label: '24h Low', value: formatUSD(coin.low_24h ?? 0) },
                ].map((s, i) => (
                  <div key={i} className="stat-card">
                    <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                    <div className={`text-lg font-bold ${'change' in s ? getChangeColor(s.change!) : 'text-white'}`}>{s.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
