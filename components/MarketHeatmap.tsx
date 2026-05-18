'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { CoinData } from '@/lib/types';
import { fetchTopCoins } from '@/lib/coingecko';

function getHeatColor(change: number): string {
  if (change > 10) return '#00e676';
  if (change > 5) return '#00c853';
  if (change > 3) return '#2e7d32';
  if (change > 1) return '#1b5e20';
  if (change > 0) return '#194d1e';
  if (change > -1) return '#4a0e0e';
  if (change > -3) return '#7f1519';
  if (change > -5) return '#b71c1c';
  if (change > -10) return '#d32f2f';
  return '#ff1744';
}

function getTextColor(change: number): string {
  return Math.abs(change) > 1 ? '#ffffff' : '#cccccc';
}

interface HeatCell {
  symbol: string;
  name: string;
  change: number;
  cap: number;
  price: number;
  image: string;
}

interface TooltipState { x: number; y: number; coin: HeatCell | null }

export default function MarketHeatmap() {
  const [cells, setCells] = useState<HeatCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, coin: null });

  const load = useCallback(async () => {
    setError(false);
    try {
      const coins = await fetchTopCoins(30);
      if (!coins || coins.length === 0) { setError(true); setLoading(false); return; }
      setCells(coins.map(c => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        change: c.price_change_percentage_24h ?? 0,
        cap: c.market_cap,
        price: c.current_price,
        image: c.image,
      })));
    } catch { setError(true); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const showTip = useCallback((e: React.MouseEvent, coin: HeatCell) => {
    setTooltip({ x: e.clientX, y: e.clientY, coin });
  }, []);
  const hideTip = useCallback(() => setTooltip({ x: 0, y: 0, coin: null }), []);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0d1421] p-4">
        <div className="h-6 w-48 bg-white/5 rounded mb-4 animate-pulse" />
        <div className="flex flex-wrap gap-1.5">
          {Array(30).fill(0).map((_, i) => (
            <div key={i} style={{ width: 72, height: 72 }} className="bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0d1421] p-8 text-center">
        <p className="text-gray-400 mb-3">Unable to load heatmap — CoinGecko rate limit reached</p>
        <button onClick={load} className="btn-secondary text-sm px-4 py-2">Retry</button>
      </div>
    );
  }

  const maxCap = Math.max(...cells.map(c => c.cap));

  return (
    <div className="rounded-xl border border-white/5 bg-[#0d1421] p-4 relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide">Market Heatmap</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" />+5%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" />0%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" />-5%</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cells.map(coin => {
          const sizeRatio = coin.cap / maxCap;
          const minSize = 56, maxSize = 120;
          const size = Math.max(minSize, Math.min(maxSize, Math.round(minSize + sizeRatio * (maxSize - minSize))));
          return (
            <div
              key={coin.symbol}
              className="flex flex-col items-center justify-center rounded-lg cursor-pointer transition-transform hover:scale-105 hover:z-10 relative select-none"
              style={{
                backgroundColor: getHeatColor(coin.change),
                width: size, height: size,
                minWidth: size, minHeight: size,
              }}
              onMouseMove={e => showTip(e, coin)}
              onMouseLeave={hideTip}
            >
              <span className="font-bold text-xs leading-tight" style={{ color: getTextColor(coin.change) }}>
                {coin.symbol}
              </span>
              <span className="text-xs leading-tight font-medium" style={{ color: getTextColor(coin.change), opacity: 0.9 }}>
                {coin.change >= 0 ? '+' : ''}{coin.change.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip.coin && (
        <div
          className="fixed z-50 bg-[#0d1421] border border-white/10 rounded-lg p-3 shadow-2xl pointer-events-none text-sm w-44"
          style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
        >
          <div className="font-bold text-white">{tooltip.coin.name}</div>
          <div className="text-gray-400 text-xs">{tooltip.coin.symbol}</div>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Price</span>
              <span className="text-white">${tooltip.coin.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">24h</span>
              <span className={tooltip.coin.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                {tooltip.coin.change >= 0 ? '+' : ''}{tooltip.coin.change.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MCap</span>
              <span className="text-white">${(tooltip.coin.cap / 1e9).toFixed(1)}B</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
