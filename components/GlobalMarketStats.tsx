'use client';
import React, { useEffect, useState } from 'react';
import { GlobalMarketData } from '@/lib/types';
import { formatPercent } from '@/lib/formatters';
import { useCurrency } from '@/contexts/SettingsContext';
import { TrendingUp, TrendingDown } from 'lucide-react';

async function fetchGlobal(): Promise<GlobalMarketData | null> {
  try {
    // Route through our server-side proxy to avoid CORS / rate-limit issues
    const res = await fetch('/api/coingecko?path=/global', {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export default function GlobalMarketStats() {
  const fmt = useCurrency();
  const [data, setData] = useState<GlobalMarketData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobal().then(d => {
      setData(d);
      setLoading(false);
    });
    const id = setInterval(() => fetchGlobal().then(d => { if (d) setData(d); }), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Array(6).fill(0).map((_, i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="h-3 bg-white/5 rounded w-20 mb-2" />
            <div className="h-6 bg-white/5 rounded w-24 mb-1" />
            <div className="h-3 bg-white/5 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    // Show empty state — don't fabricate numbers
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {['Market Cap', '24h Volume', 'BTC Dom.', 'ETH Dom.', 'Active Cryptos', 'Others Dom.'].map(label => (
          <div key={label} className="stat-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-lg font-bold text-gray-600">—</div>
            <div className="text-xs text-gray-700 mt-0.5">Unavailable</div>
          </div>
        ))}
      </div>
    );
  }

  const cap = data.total_market_cap?.usd ?? 0;
  const vol = data.total_volume?.usd ?? 0;
  const capChange = data.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom = data.market_cap_percentage?.btc ?? 0;
  const ethDom = data.market_cap_percentage?.eth ?? 0;
  const active = data.active_cryptocurrencies ?? 0;
  const volPct = cap > 0 ? (vol / cap * 100).toFixed(1) : '0';

  const items = [
    { label: 'Market Cap', value: fmt(cap, true), sub: formatPercent(capChange), positive: capChange >= 0 },
    { label: '24h Volume', value: fmt(vol, true), sub: `${volPct}% of cap`, positive: null },
    { label: 'BTC Dominance', value: `${btcDom.toFixed(1)}%`, sub: 'Bitcoin share', positive: null },
    { label: 'ETH Dominance', value: `${ethDom.toFixed(1)}%`, sub: 'Ethereum share', positive: null },
    { label: 'Active Cryptos', value: active.toLocaleString(), sub: 'Tracked assets', positive: null },
    { label: 'Others', value: `${Math.max(0, 100 - btcDom - ethDom).toFixed(1)}%`, sub: 'Alt market share', positive: null },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {items.map((item, i) => (
        <div key={i} className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{item.label}</div>
          <div className="text-lg font-bold text-white">{item.value}</div>
          <div className={`text-xs mt-0.5 flex items-center gap-1 ${
            item.positive === null ? 'text-gray-500' :
            item.positive ? 'text-green-400' : 'text-red-400'
          }`}>
            {item.positive === true && <TrendingUp size={10} />}
            {item.positive === false && <TrendingDown size={10} />}
            {item.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
