'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { OHLCPoint } from '@/lib/types';

const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2',
  MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap', ARB: 'arbitrum',
  OP: 'optimism', ATOM: 'cosmos', NEAR: 'near', APT: 'aptos',
};

const TIMEFRAMES = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

async function fetchOHLC(coinId: string, days: number): Promise<OHLCPoint[]> {
  try {
    // Use proxy to avoid CORS blocks
    const res = await fetch(
      `/api/coingecko?path=%2Fcoins%2F${encodeURIComponent(coinId)}%2Fohlc&vs_currency=usd&days=${days}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: [number, number, number, number, number][] = await res.json();
    return raw.map(([ts, o, h, l, c]) => ({
      time: Math.floor(ts / 1000),
      open: o, high: h, low: l, close: c,
    }));
  } catch (err) {
    console.error('OHLC fetch failed:', err);
    return [];
  }
}

interface Props {
  symbol?: string;
  height?: number;
}

export default function TradingViewChart({ symbol = 'BTC', height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);

  const coinId = COIN_IDS[symbol.toUpperCase()] ?? COIN_IDS.BTC;

  const loadChart = useCallback(async () => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');
      const data = await fetchOHLC(coinId, days);
      if (data.length === 0) {
        setError('No data available for this pair.');
        setLoading(false);
        return;
      }

      if (chartRef.current) {
        (chartRef.current as { remove(): void }).remove();
        chartRef.current = null;
      }

      const container = containerRef.current;
      if (!container) return;

      const chart = createChart(container, {
        width: container.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#8892a4',
          fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(0,212,255,0.5)', labelBackgroundColor: '#0d1421' },
          horzLine: { color: 'rgba(0,212,255,0.5)', labelBackgroundColor: '#0d1421' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#00d084',
        downColor: '#ff4757',
        borderUpColor: '#00d084',
        borderDownColor: '#ff4757',
        wickUpColor: '#00d084',
        wickDownColor: '#ff4757',
      });

      // lightweight-charts v4 requires UTCTimestamp type cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(data as any);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      seriesRef.current = candleSeries;

      // Price stats from data
      const last = data[data.length - 1];
      const first = data[0];
      if (last && first) {
        setCurrentPrice(last.close);
        setPriceChange(((last.close - first.open) / first.open) * 100);
      }

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(container);

      setLoading(false);
      return () => { ro.disconnect(); };
    } catch (err) {
      console.error('Chart error:', err);
      setError('Failed to load chart data. Please try again.');
      setLoading(false);
    }
  }, [coinId, days, height]);

  useEffect(() => {
    loadChart();
    return () => {
      if (chartRef.current) {
        (chartRef.current as { remove(): void }).remove();
        chartRef.current = null;
      }
    };
  }, [loadChart]);

  return (
    <div className="rounded-xl border border-white/5 bg-[#0d1421] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold">{symbol}/USD</span>
          {currentPrice !== null && (
            <span className="text-white font-mono">${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          )}
          {priceChange !== null && (
            <span className={`text-xs px-2 py-0.5 rounded ${priceChange >= 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              onClick={() => setDays(tf.days)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                days === tf.days
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1421]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              <span className="text-gray-500 text-sm">Loading chart data...</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1421]">
            <div className="text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={loadChart} className="mt-3 btn-secondary text-xs">Retry</button>
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ height }} className={`w-full ${loading || error ? 'opacity-0' : 'opacity-100'}`} />
      </div>
    </div>
  );
}
