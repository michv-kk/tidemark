'use client';
import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';

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
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Use server-side /api/gas proxy — handles Etherscan + ETH price with caching
        const res = await fetch('/api/gas', { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (!cancelled) {
          if (json.gas) setGas(json.gas);
          if (typeof json.ethPrice === 'number') setEthPrice(json.ethPrice);
          if (!json.gas) setError(true);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    // Refresh gas every 30s
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return <LoadingCard rows={5} />;
  if (error || !gas) return <Card><p className="text-orange-400 text-sm">Unable to load gas data</p></Card>;

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
  // Static representation — chain split from our real sources (ETH + BTC)
  const chains = [
    { label: 'Ethereum (ETH)', source: 'Etherscan API', color: 'bg-blue-500', desc: 'ERC-20 & native ETH whale transactions' },
    { label: 'Bitcoin (BTC)', source: 'Mempool.space API', color: 'bg-orange-500', desc: 'Large UTXO movements from mempool' },
  ];

  return (
    <Card>
      <div className="space-y-4">
        {chains.map(c => (
          <div key={c.label} className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${c.color} flex-shrink-0 mt-1`} />
            <div className="flex-1">
              <div className="text-white text-sm font-semibold">{c.label}</div>
              <div className="text-gray-400 text-xs mt-0.5">{c.desc}</div>
              <div className="text-gray-600 text-xs mt-0.5">Source: {c.source}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/5 text-xs text-gray-600">
        Live transaction feed — updates every 15–20 seconds
      </div>
    </Card>
  );
}

// ─── Exchange Flows ────────────────────────────────────────────────────────────

interface ExchangeFlow {
  name: string;
  address: string;
  color: string;
  initials: string;
}

interface FlowResult {
  name: string;
  color: string;
  initials: string;
  netFlowETH: number;
  txCount: number;
  loaded: boolean;
  error: boolean;
}

const EXCHANGES: ExchangeFlow[] = [
  { name: 'Binance', address: '0x28C6c06298d514Db089934071355E5743bf21d60', color: 'bg-yellow-500', initials: 'BN' },
  { name: 'Coinbase', address: '0x503828976D22510aad0201ac7EC88293211D23Da', color: 'bg-blue-500', initials: 'CB' },
  { name: 'Kraken',   address: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2', color: 'bg-purple-500', initials: 'KR' },
];

const ETHERSCAN_KEY_FLOWS = 'NX35PINTFQXS4S542I3GA9I2G3DDZPV1FU';
const ONE_DAY_MS = 86400000;

async function fetchExchangeFlow(exchange: ExchangeFlow): Promise<FlowResult> {
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${exchange.address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_KEY_FLOWS}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) {
      return { name: exchange.name, color: exchange.color, initials: exchange.initials, netFlowETH: 0, txCount: 0, loaded: true, error: true };
    }
    const cutoff = Date.now() - ONE_DAY_MS;
    const recent = data.result.filter((tx: { timeStamp: string }) => parseInt(tx.timeStamp, 10) * 1000 >= cutoff);
    let inflow = 0;
    let outflow = 0;
    const addrLower = exchange.address.toLowerCase();
    for (const tx of recent) {
      const val = parseInt(tx.value, 10) / 1e18;
      if (tx.to?.toLowerCase() === addrLower) inflow += val;
      if (tx.from?.toLowerCase() === addrLower) outflow += val;
    }
    return {
      name: exchange.name, color: exchange.color, initials: exchange.initials,
      netFlowETH: inflow - outflow, txCount: recent.length, loaded: true, error: false,
    };
  } catch {
    return { name: exchange.name, color: exchange.color, initials: exchange.initials, netFlowETH: 0, txCount: 0, loaded: true, error: true };
  }
}

function ExchangeFlowsPanel() {
  const [flows, setFlows] = useState<FlowResult[]>(
    EXCHANGES.map(e => ({ name: e.name, color: e.color, initials: e.initials, netFlowETH: 0, txCount: 0, loaded: false, error: false }))
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = await Promise.all(EXCHANGES.map(fetchExchangeFlow));
      if (!cancelled) setFlows(results);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const allLoading = flows.every(f => !f.loaded);

  if (allLoading) return <LoadingCard rows={4} />;

  return (
    <Card>
      <div className="space-y-4">
        {flows.map(flow => {
          const isInflow = flow.netFlowETH > 0;
          const isOutflow = flow.netFlowETH < 0;

          return (
            <div key={flow.name} className="flex items-center gap-3">
              {/* Exchange icon */}
              <div className={`w-8 h-8 rounded-lg ${flow.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {flow.initials}
              </div>

              {/* Name & tx count */}
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-semibold">{flow.name}</div>
                <div className="text-gray-500 text-xs">
                  {flow.error ? 'Data unavailable' : `${flow.txCount} txs in 24h`}
                </div>
              </div>

              {/* Flow amount + arrow */}
              {flow.error ? (
                <span className="text-gray-500 text-sm font-mono">—</span>
              ) : (
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  <div>
                    <div className={`text-sm font-bold font-mono tabular-nums ${isInflow ? 'text-red-400' : isOutflow ? 'text-green-400' : 'text-gray-400'}`}>
                      {flow.netFlowETH === 0 ? '0.000 ETH' : `${isInflow ? '+' : ''}${flow.netFlowETH.toFixed(3)} ETH`}
                    </div>
                    <div className={`text-xs text-right ${isInflow ? 'text-red-400/70' : isOutflow ? 'text-green-400/70' : 'text-gray-500'}`}>
                      {isInflow ? '↑ Inflow (bearish)' : isOutflow ? '↓ Outflow (bullish)' : 'Neutral'}
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
        Net ETH flow last 24h via Etherscan · Inflow ↑ = more deposits (bearish) · Outflow ↓ = withdrawals (bullish)
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
