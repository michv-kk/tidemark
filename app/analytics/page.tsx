'use client';
import React, { useEffect, useState } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FngEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}

interface GasOracle {
  SafeGasPrice: string;
  ProposeGasPrice: string;
  FastGasPrice: string;
  suggestBaseFee: string;
}

interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number;
    data?: {
      price_change_percentage_24h?: { usd?: number };
    };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fngColor(val: number): string {
  if (val <= 25) return 'text-red-400';
  if (val <= 45) return 'text-orange-400';
  if (val <= 55) return 'text-yellow-400';
  if (val <= 75) return 'text-lime-400';
  return 'text-green-400';
}

function fngBg(val: number): string {
  if (val <= 25) return 'bg-red-500';
  if (val <= 45) return 'bg-orange-500';
  if (val <= 55) return 'bg-yellow-500';
  if (val <= 75) return 'bg-lime-500';
  return 'bg-green-500';
}

function gasUSD(gwei: number, gasLimit: number, ethPrice: number): string {
  const eth = (gwei * 1e-9) * gasLimit;
  return `$${(eth * ethPrice).toFixed(4)}`;
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-white font-bold text-lg">{title}</h2>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/8 bg-white/2 p-5 ${className}`}>
      {children}
    </div>
  );
}

function LoadingCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <div className="space-y-3 animate-pulse">
        {Array(rows).fill(0).map((_, i) => (
          <div key={i} className="h-4 bg-white/5 rounded w-full" />
        ))}
      </div>
    </Card>
  );
}

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

function FearGreedPanel() {
  const [data, setData] = useState<FngEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('https://api.alternative.me/fng/?limit=7', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('bad response');
        const json = await res.json();
        if (!cancelled) {
          setData(json.data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingCard rows={4} />;
  if (error || data.length === 0) return <Card><p className="text-orange-400 text-sm">Unable to load Fear &amp; Greed data</p></Card>;

  const current = data[0];
  const currentVal = parseInt(current.value, 10);
  const maxVal = Math.max(...data.map(d => parseInt(d.value, 10)));

  return (
    <Card>
      {/* Current value */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className={`text-5xl font-black ${fngColor(currentVal)}`}>{currentVal}</div>
          <div className={`text-sm font-semibold mt-1 ${fngColor(currentVal)}`}>{current.value_classification}</div>
          <div className="text-gray-500 text-xs mt-0.5">Fear &amp; Greed Index</div>
        </div>
        <div className="w-20 h-20 relative flex items-center justify-center">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="32"
              fill="none"
              stroke={currentVal <= 25 ? '#f87171' : currentVal <= 45 ? '#fb923c' : currentVal <= 55 ? '#facc15' : currentVal <= 75 ? '#a3e635' : '#4ade80'}
              strokeWidth="8"
              strokeDasharray={`${(currentVal / 100) * 201} 201`}
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* 7-day chart */}
      <div className="border-t border-white/5 pt-4">
        <div className="text-xs text-gray-500 mb-3 uppercase tracking-wide">7-Day History</div>
        <div className="flex items-end gap-1.5 h-16">
          {[...data].reverse().map((entry, i) => {
            const val = parseInt(entry.value, 10);
            const heightPct = maxVal > 0 ? (val / maxVal) * 100 : val;
            const date = new Date(parseInt(entry.timestamp, 10) * 1000);
            const label = i === data.length - 1 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <div key={entry.timestamp} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: '48px' }}>
                  <div
                    className={`w-full rounded-sm ${fngBg(val)} opacity-80`}
                    style={{ height: `${heightPct}%` }}
                    title={`${label}: ${val} (${entry.value_classification})`}
                  />
                </div>
                <span className="text-[9px] text-gray-600">{label.slice(0, 3)}</span>
                <span className={`text-[10px] font-bold ${fngColor(val)}`}>{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── Gas Prices ───────────────────────────────────────────────────────────────

function GasPanel() {
  const [gas, setGas] = useState<GasOracle | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async (isRetry = false) => {
    if (isRetry) setRetrying(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gas', { signal: AbortSignal.timeout(15000) });
      const json = await res.json();
      if (json.gas) {
        setGas(json.gas);
        setErrorMsg(null);
      } else {
        setErrorMsg(json.gasError ?? 'Gas data unavailable');
      }
      if (typeof json.ethPrice === 'number') setEthPrice(json.ethPrice);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingCard rows={5} />;
  if (!gas) return (
    <Card>
      <p className="text-orange-400 text-sm mb-3">⚠ {errorMsg ?? 'Gas data unavailable'}</p>
      <button
        onClick={() => load(true)}
        disabled={retrying}
        className="text-xs text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </Card>
  );

  const safeGwei = parseFloat(gas.SafeGasPrice);
  const proposeGwei = parseFloat(gas.ProposeGasPrice);
  const fastGwei = parseFloat(gas.FastGasPrice);
  const baseGwei = parseFloat(gas.suggestBaseFee);

  const ep = ethPrice ?? 3400; // fallback if CoinGecko fails

  const tiers = [
    { label: 'Slow / Safe', gwei: safeGwei, color: 'text-green-400', eta: '~5 min' },
    { label: 'Standard', gwei: proposeGwei, color: 'text-yellow-400', eta: '~1 min' },
    { label: 'Fast', gwei: fastGwei, color: 'text-red-400', eta: '~15 sec' },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Base Fee</div>
        <div className="text-white font-mono font-semibold">{baseGwei.toFixed(2)} gwei</div>
      </div>

      <div className="space-y-3 mb-5">
        {tiers.map(t => (
          <div key={t.label} className="flex items-center justify-between">
            <div>
              <div className={`text-sm font-semibold ${t.color}`}>{t.gwei.toFixed(1)} gwei</div>
              <div className="text-xs text-gray-500">{t.label} · {t.eta}</div>
            </div>
            <div className="text-right text-xs text-gray-400">
              <div>Transfer: {gasUSD(t.gwei, 21000, ep)}</div>
              <div>DEX swap: {gasUSD(t.gwei, 150000, ep)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 pt-3 text-xs text-gray-600">
        ETH price: {ethPrice != null ? `$${ethPrice.toLocaleString()}` : '~$3,400 (est.)'} · Gas costs for 21K / 150K gas limits
      </div>

      <a
        href="https://etherscan.io/gastracker"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        <ExternalLink size={10} />
        Etherscan Gas Tracker
      </a>
    </Card>
  );
}

// ─── Trending Coins ───────────────────────────────────────────────────────────

function TrendingPanel() {
  const [coins, setCoins] = useState<TrendingCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/coingecko?path=%2Fsearch%2Ftrending', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('bad response');
        const json = await res.json();
        if (!cancelled) {
          setCoins((json.coins ?? []).slice(0, 5));
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingCard rows={5} />;
  if (error || coins.length === 0) return <Card><p className="text-orange-400 text-sm">Unable to load trending data</p></Card>;

  return (
    <Card>
      <div className="space-y-3">
        {coins.map((c, i) => {
          const change = c.item.data?.price_change_percentage_24h?.usd;
          const changeStr = typeof change === 'number' ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
          const isUp = typeof change === 'number' && change >= 0;
          const isDown = typeof change === 'number' && change < 0;

          return (
            <div key={c.item.id} className="flex items-center gap-3">
              <span className="text-gray-600 text-xs w-4 text-center">{i + 1}</span>
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-cyan-400 flex-shrink-0">
                {c.item.symbol[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{c.item.name}</div>
                <div className="text-gray-500 text-xs">{c.item.symbol.toUpperCase()} · #{c.item.market_cap_rank ?? '—'}</div>
              </div>
              <div className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-gray-400'}`}>
                {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : <Minus size={12} />}
                {changeStr}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-600">
        Trending on CoinGecko in the last 24 hours
      </div>
    </Card>
  );
}

// ─── Chain Activity ───────────────────────────────────────────────────────────

function ChainActivityPanel() {
  const chains = [
    {
      label: 'Ethereum (ETH)',
      source: 'Etherscan V2 API · chainid=1',
      color: 'bg-blue-500',
      desc: 'ERC-20 token transfers (USDC, USDT, WBTC, WETH) — biggest whale chain by volume',
      interval: '30s',
    },
    {
      label: 'Arbitrum (ARB)',
      source: 'Etherscan V2 API · chainid=42161',
      color: 'bg-cyan-500',
      desc: 'USDC, USDT & WETH flows on Arbitrum L2',
      interval: '30s',
    },
    {
      label: 'Polygon (MATIC)',
      source: 'Etherscan V2 API · chainid=137',
      color: 'bg-violet-500',
      desc: 'USDC & USDT transfers on Polygon PoS',
      interval: '30s',
    },
    {
      label: 'Bitcoin (BTC)',
      source: 'Blockchair API + Mempool.space',
      color: 'bg-orange-500',
      desc: 'Large BTC movements — 48h history via Blockchair, recent blocks via Mempool.space',
      interval: '30s',
    },
    {
      label: 'BNB Smart Chain (BSC)',
      source: 'Public RPC · eth_getLogs',
      color: 'bg-yellow-500',
      desc: 'USDT & USDC transfers on BSC via public node',
      interval: '30s',
    },
    {
      label: 'Avalanche (AVAX)',
      source: 'Public RPC · eth_getLogs',
      color: 'bg-red-500',
      desc: 'USDC & USDT transfers on Avalanche C-Chain',
      interval: '30s',
    },
  ];

  return (
    <Card>
      <div className="space-y-4">
        {chains.map(c => (
          <div key={c.label} className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${c.color} flex-shrink-0 mt-1.5`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-white text-sm font-semibold">{c.label}</div>
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 text-gray-500 border border-white/5">
                  every {c.interval}
                </span>
              </div>
              <div className="text-gray-400 text-xs mt-0.5">{c.desc}</div>
              <div className="text-gray-600 text-xs mt-0.5">Source: {c.source}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-600">
        6 chains · ETH, ARB, MATIC via Etherscan · BTC via Blockchair · BSC &amp; AVAX via public RPC
      </div>
    </Card>
  );
}

// ─── Exchange Flows ────────────────────────────────────────────────────────────

interface FlowResult {
  name: string;
  color: string;
  initials: string;
  netEth: number | null;
  txCount: number;
  inEth: number;
  outEth: number;
}

function ExchangeFlowsPanel() {
  const [flows, setFlows] = useState<FlowResult[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/exchange-flows', { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FlowResult[] = await res.json();
        if (!cancelled) { setFlows(data); setLoading(false); }
      } catch {
        if (!cancelled) { setFlows([]); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingCard rows={4} />;
  if (!flows || flows.length === 0) return <Card><p className="text-orange-400 text-sm">Unable to load exchange flow data</p></Card>;

  return (
    <Card>
      <div className="space-y-4">
        {flows.map(flow => {
          const isInflow = flow.netEth !== null && flow.netEth > 0;
          const isOutflow = flow.netEth !== null && flow.netEth < 0;
          const hasData = flow.netEth !== null;

          return (
            <div key={flow.name} className="flex items-center gap-3">
              {/* Exchange icon */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: flow.color }}
              >
                {flow.initials}
              </div>

              {/* Name & tx count */}
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-semibold">{flow.name}</div>
                <div className="text-gray-500 text-xs">
                  {!hasData ? 'Data unavailable' : `${flow.txCount} txs in 24h`}
                </div>
              </div>

              {/* Flow amount + label */}
              {!hasData ? (
                <span className="text-gray-500 text-sm font-mono">—</span>
              ) : (
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  <div>
                    <div className={`text-sm font-bold font-mono tabular-nums ${isInflow ? 'text-red-400' : isOutflow ? 'text-green-400' : 'text-gray-400'}`}>
                      {flow.netEth === 0
                        ? '0 ETH'
                        : `${isInflow ? '+' : ''}${flow.netEth!.toLocaleString(undefined, { maximumFractionDigits: 1 })} ETH`}
                    </div>
                    <div className={`text-xs text-right ${isInflow ? 'text-red-400/70' : isOutflow ? 'text-green-400/70' : 'text-gray-500'}`}>
                      {isInflow ? 'Inflow ↑ bearish' : isOutflow ? 'Outflow ↓ bullish' : 'Neutral'}
                    </div>
                  </div>
                  {isInflow ? (
                    <TrendingUp size={16} className="text-red-400 flex-shrink-0" />
                  ) : isOutflow ? (
                    <TrendingDown size={16} className="text-green-400 flex-shrink-0" />
                  ) : (
                    <Minus size={16} className="text-gray-500 flex-shrink-0" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-600">
        Net ETH flow last 24h · Inflow ↑ = more deposits (bearish) · Outflow ↓ = withdrawals (bullish)
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">On-Chain Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">
          Live market sentiment, gas costs, and trending assets — all from free public APIs
        </p>
      </div>

      {/* Top row: Fear & Greed + Gas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <SectionHeader title="Market Sentiment" sub="Crypto Fear & Greed Index — Alternative.me" />
          <FearGreedPanel />
        </div>
        <div>
          <SectionHeader title="ETH Gas Prices" sub="Live gwei prices · Etherscan Gas Oracle" />
          <GasPanel />
        </div>
      </div>

      {/* Middle row: Exchange Flows + Trending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <SectionHeader title="Exchange Flows" sub="Net ETH flow last 24h · Inflow = bearish · Outflow = bullish" />
          <ExchangeFlowsPanel />
        </div>
        <div>
          <SectionHeader title="Trending Coins" sub="Top 5 trending on CoinGecko right now" />
          <TrendingPanel />
        </div>
      </div>

      {/* Bottom row: Chain Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionHeader title="Live Feed Sources" sub="Active chains being monitored" />
          <ChainActivityPanel />
        </div>
      </div>
    </div>
  );
}
