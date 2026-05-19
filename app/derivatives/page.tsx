'use client';
import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FundingRate {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
  time: number;
}

interface OpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

interface DisplayRow {
  symbol: string;
  ticker: string;
  fundingRate: number;
  annualizedRate: number;
  nextFundingTime: number;
  markPrice: number;
  openInterest: number | null;
  oiUSD: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACKED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ARBUSDT',
  'AVAXUSDT', 'LINKUSDT', 'UNIUSDT', 'OPUSDT', 'MATICUSDT',
];

const TICKER_LABELS: Record<string, string> = {
  BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', BNBUSDT: 'BNB',
  ARBUSDT: 'ARB', AVAXUSDT: 'AVAX', LINKUSDT: 'LINK', UNIUSDT: 'UNI',
  OPUSDT: 'OP', MATICUSDT: 'MATIC',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFundingRate(rate: number): string {
  const pct = rate * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(4)}%`;
}

function formatAnnualRate(rate: number): string {
  const pct = rate * 100 * 3 * 365;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatNextFunding(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return 'Now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatOI(usd: number | null): string {
  if (usd === null) return '—';
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  return `$${usd.toFixed(0)}`;
}

function rateColor(rate: number): string {
  if (Math.abs(rate) < 0.00005) return 'text-yellow-400';
  return rate > 0 ? 'text-green-400' : 'text-red-400';
}

function rateDotColor(rate: number): string {
  if (Math.abs(rate) < 0.00005) return 'bg-yellow-400';
  return rate > 0 ? 'bg-green-400' : 'bg-red-400';
}

function sentimentLabel(avgRate: number): { label: string; color: string } {
  if (avgRate > 0.0002) return { label: 'Greed', color: 'text-green-400' };
  if (avgRate > 0.00005) return { label: 'Mild Greed', color: 'text-lime-400' };
  if (avgRate < -0.0002) return { label: 'Fear', color: 'text-red-400' };
  if (avgRate < -0.00005) return { label: 'Mild Fear', color: 'text-orange-400' };
  return { label: 'Neutral', color: 'text-yellow-400' };
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array(10).fill(0).map((_, i) => (
        <div key={i} className="h-12 bg-white/[0.04] rounded-lg" />
      ))}
    </div>
  );
}

// ─── Market Sentiment Summary ─────────────────────────────────────────────────

function SentimentSummary({ rows }: { rows: DisplayRow[] }) {
  if (rows.length === 0) return null;

  const bullish = rows.filter(r => r.fundingRate > 0.00005).length;
  const bearish = rows.filter(r => r.fundingRate < -0.00005).length;
  const neutral = rows.length - bullish - bearish;
  const avgRate = rows.reduce((s, r) => s + r.fundingRate, 0) / rows.length;
  const { label, color } = sentimentLabel(avgRate);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Market Bias</div>
        <div className={`text-2xl font-black ${color}`}>{label}</div>
        <div className="text-xs text-gray-600 mt-1">Based on avg. funding rate</div>
      </div>
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Funding Rate</div>
        <div className={`text-2xl font-black ${rateColor(avgRate)}`}>{formatFundingRate(avgRate)}</div>
        <div className="text-xs text-gray-600 mt-1">Avg across {rows.length} assets</div>
      </div>
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Bullish Bias</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-green-400">{bullish}</span>
          <span className="text-sm text-gray-500">coins</span>
        </div>
        <div className="text-xs text-gray-600 mt-1">Longs paying shorts</div>
      </div>
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Bearish Bias</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-red-400">{bearish}</span>
          <span className="text-sm text-gray-500">coins · {neutral} neutral</span>
        </div>
        <div className="text-xs text-gray-600 mt-1">Shorts paying longs</div>
      </div>
    </div>
  );
}

// ─── Open Interest Panel ──────────────────────────────────────────────────────

function OIPanel({ rows }: { rows: DisplayRow[] }) {
  const filtered = rows.filter(r => r.oiUSD !== null && (r.symbol === 'BTCUSDT' || r.symbol === 'ETHUSDT'));

  if (filtered.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 mb-6">
      <h2 className="text-white font-bold text-base mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
        Open Interest — BTC &amp; ETH
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map(row => (
          <div key={row.symbol} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${rateDotColor(row.fundingRate)}`} />
                <span className="text-white font-bold text-sm">{row.ticker}</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">${Number(row.markPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="text-2xl font-black text-white">{formatOI(row.oiUSD)}</div>
            <div className="text-xs text-gray-500 mt-1">Total open interest in USD</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funding Rate Table ───────────────────────────────────────────────────────

function FundingTable({ rows }: { rows: DisplayRow[] }) {
  const maxAbsRate = Math.max(...rows.map(r => Math.abs(r.fundingRate)), 0.0001);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">Asset</th>
              <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium">Funding Rate</th>
              <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium hidden sm:table-cell">Annualized</th>
              <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium hidden md:table-cell">Next Funding</th>
              <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium hidden lg:table-cell">OI (USD)</th>
              <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide font-medium hidden sm:table-cell">Magnitude</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map(row => {
              const barPct = maxAbsRate > 0 ? (Math.abs(row.fundingRate) / maxAbsRate) * 100 : 0;
              const isPositive = row.fundingRate > 0.00005;
              const isNegative = row.fundingRate < -0.00005;

              return (
                <tr key={row.symbol} className="hover:bg-white/[0.03] transition-colors">
                  {/* Symbol */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rateDotColor(row.fundingRate)}`} />
                      <div>
                        <div className="text-white font-semibold">{row.ticker}</div>
                        <div className="text-xs text-gray-600 font-mono hidden sm:block">
                          ${Number(row.markPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Funding Rate */}
                  <td className="px-4 py-3 text-right">
                    <div className={`font-mono font-bold ${rateColor(row.fundingRate)}`}>
                      {formatFundingRate(row.fundingRate)}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {isPositive ? 'Longs pay' : isNegative ? 'Shorts pay' : 'Neutral'}
                    </div>
                  </td>

                  {/* Annualized */}
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className={`font-mono text-xs ${rateColor(row.fundingRate)}`}>
                      {formatAnnualRate(row.fundingRate)}
                    </span>
                    <div className="text-[10px] text-gray-600">annualized</div>
                  </td>

                  {/* Next Funding */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-gray-300 text-xs font-mono">
                      {formatNextFunding(row.nextFundingTime)}
                    </span>
                  </td>

                  {/* OI */}
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className="text-gray-300 text-xs font-mono">
                      {formatOI(row.oiUSD)}
                    </span>
                  </td>

                  {/* Bar */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isPositive ? 'bg-green-500' : isNegative ? 'bg-red-500' : 'bg-yellow-500'}`}
                        style={{ width: `${Math.max(barPct, 2)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DerivativesPage() {
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all funding rates in one call
      const fundingRes = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', {
        signal: AbortSignal.timeout(10000),
      });
      if (!fundingRes.ok) throw new Error(`Binance API error: ${fundingRes.status}`);
      const allFunding: FundingRate[] = await fundingRes.json();

      // Filter to our tracked symbols
      const tracked = allFunding.filter(f => TRACKED_SYMBOLS.includes(f.symbol));

      // Fetch OI for BTC and ETH only
      const oiResults = await Promise.allSettled([
        fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT', { signal: AbortSignal.timeout(8000) }),
        fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT', { signal: AbortSignal.timeout(8000) }),
      ]);

      const oiMap: Record<string, number> = {};
      for (const result of oiResults) {
        if (result.status === 'fulfilled' && result.value.ok) {
          const oi: OpenInterest = await result.value.json();
          oiMap[oi.symbol] = parseFloat(oi.openInterest);
        }
      }

      const displayRows: DisplayRow[] = tracked.map(f => {
        const markPrice = parseFloat(f.markPrice);
        const oiAmount = oiMap[f.symbol] ?? null;
        const oiUSD = oiAmount !== null ? oiAmount * markPrice : null;

        return {
          symbol: f.symbol,
          ticker: TICKER_LABELS[f.symbol] ?? f.symbol.replace('USDT', ''),
          fundingRate: parseFloat(f.lastFundingRate),
          annualizedRate: parseFloat(f.lastFundingRate) * 3 * 365,
          nextFundingTime: f.nextFundingTime,
          markPrice,
          openInterest: oiAmount,
          oiUSD,
        };
      });

      // Sort by absolute funding rate descending
      displayRows.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

      setRows(displayRows);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch derivatives data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Refresh every 60 seconds
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-cyan-400" />
            <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">Binance Futures</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Derivatives Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Live funding rates, open interest and market sentiment from Binance Futures
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-gray-600">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Sentiment summary */}
      {!loading && rows.length > 0 && <SentimentSummary rows={rows} />}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-pulse">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      )}

      {/* Open Interest */}
      {!loading && rows.length > 0 && <OIPanel rows={rows} />}

      {/* Funding Rate legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Positive rate — longs pay shorts (bullish bias / Greed)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Negative rate — shorts pay longs (bearish bias / Fear)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Near zero — neutral
        </div>
      </div>

      {/* Table */}
      <div className="mb-2">
        <h2 className="text-white font-bold text-base mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-cyan-400" />
          Funding Rates
          <span className="text-xs text-gray-500 font-normal ml-1">Payments every 8 hours</span>
        </h2>
        {loading ? <TableSkeleton /> : rows.length > 0 ? (
          <FundingTable rows={rows} />
        ) : !error ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-gray-500 text-sm">
            No data available
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-xs text-gray-600">
        Data source: Binance Futures API (fapi.binance.com) · Annualized = rate × 3 × 365 (3 payments/day)
      </div>
    </div>
  );
}
