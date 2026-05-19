'use client';
import React, { useEffect, useState } from 'react';
import { FALLBACK_TICKER } from '@/lib/coingecko';

interface TickerItem { symbol: string; price: number; change: number }

async function loadTicker(): Promise<TickerItem[]> {
  try {
    const res = await fetch(
      '/api/coingecko?path=/coins/markets&vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false'
    );
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    return data.map((c: { symbol: string; current_price: number; price_change_percentage_24h: number }) => ({
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change: c.price_change_percentage_24h ?? 0,
    }));
  } catch {
    return FALLBACK_TICKER;
  }
}

function formatPrice(p: number): string {
  if (p >= 10000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(5)}`;
}

export default function TickerBar() {
  // Start empty — never flash stale hardcoded prices
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    loadTicker().then(setItems);
    const id = setInterval(() => loadTicker().then(setItems), 60_000);
    return () => clearInterval(id);
  }, []);

  // Show a subtle loading state until real data arrives
  if (items.length === 0) {
    return (
      <div className="ticker-bar">
        <div className="flex items-center justify-center gap-6 px-4 h-full">
          {['BTC', 'ETH', 'BNB', 'SOL', 'XRP'].map(s => (
            <span key={s} className="ticker-item">
              <span className="ticker-symbol">{s}</span>
              <span className="inline-block w-16 h-3 bg-white/5 rounded animate-pulse ml-1" />
            </span>
          ))}
        </div>
      </div>
    );
  }

  const doubled = [...items, ...items];

  return (
    <div className="ticker-bar">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="ticker-item">
            <span className="ticker-symbol">{item.symbol}</span>
            <span className="ticker-price">{formatPrice(item.price)}</span>
            <span className={item.change >= 0 ? 'ticker-up' : 'ticker-down'}>
              {item.change >= 0 ? '▲' : '▼'}{Math.abs(item.change).toFixed(2)}%
            </span>
            <span className="ticker-sep">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
