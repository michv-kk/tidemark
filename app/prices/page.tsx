'use client';
import React, { useState } from 'react';
import { TradingViewWidget } from '@/components/TradingViewWidget';

const PAIRS = [
  { symbol: 'BINANCE:BTCUSDT',  label: 'BTC/USDT',  name: 'Bitcoin' },
  { symbol: 'BINANCE:ETHUSDT',  label: 'ETH/USDT',  name: 'Ethereum' },
  { symbol: 'BINANCE:SOLUSDT',  label: 'SOL/USDT',  name: 'Solana' },
  { symbol: 'BINANCE:BNBUSDT',  label: 'BNB/USDT',  name: 'BNB' },
  { symbol: 'BINANCE:AVAXUSDT', label: 'AVAX/USDT', name: 'Avalanche' },
  { symbol: 'BINANCE:LINKUSDT', label: 'LINK/USDT', name: 'Chainlink' },
  { symbol: 'BINANCE:UNIUSDT',  label: 'UNI/USDT',  name: 'Uniswap' },
  { symbol: 'BINANCE:DOTUSDT',  label: 'DOT/USDT',  name: 'Polkadot' },
  { symbol: 'BINANCE:ADAUSDT',  label: 'ADA/USDT',  name: 'Cardano' },
  { symbol: 'BINANCE:XRPUSDT',  label: 'XRP/USDT',  name: 'Ripple' },
];

const INTERVALS = [
  { value: '1',   label: '1m'  },
  { value: '5',   label: '5m'  },
  { value: '15',  label: '15m' },
  { value: '60',  label: '1h'  },
  { value: '240', label: '4h'  },
  { value: 'D',   label: '1D'  },
  { value: 'W',   label: '1W'  },
];

const STUDIES_PRESETS = [
  { label: 'Clean',     studies: [] },
  { label: 'Volume',    studies: ['Volume@tv-basicstudies'] },
  { label: 'MA + RSI',  studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies'] },
  { label: 'MACD',      studies: ['MACD@tv-basicstudies', 'Volume@tv-basicstudies'] },
  { label: 'Bollinger', studies: ['BB@tv-basicstudies', 'Volume@tv-basicstudies'] },
];

export default function PricesPage() {
  const [selected, setSelected] = useState(PAIRS[0]);
  const [interval, setInterval] = useState('D');
  const [studiesIdx, setStudiesIdx] = useState(0);
  const [layout, setLayout] = useState<'single' | 'dual'>('single');
  const [leftPair, setLeftPair]   = useState(PAIRS[0]);
  const [rightPair, setRightPair] = useState(PAIRS[1]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Prices &amp; Charts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live TradingView charts — real-time data from Binance</p>
        </div>
        <div className="flex items-center gap-2">
          {(['single', 'dual'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                layout === l
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                  : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
              }`}
            >
              {l === 'single' ? 'Single Chart' : 'Side by Side'}
            </button>
          ))}
        </div>
      </div>

      {layout === 'single' ? (
        <>
          {/* Pair selector */}
          <div className="flex flex-wrap gap-1.5">
            {PAIRS.map(p => (
              <button
                key={p.symbol}
                onClick={() => setSelected(p)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  selected.symbol === p.symbol
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Interval + Studies */}
          <div className="flex flex-wrap gap-5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mr-1">Interval</span>
              {INTERVALS.map(iv => (
                <button
                  key={iv.value}
                  onClick={() => setInterval(iv.value)}
                  className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${
                    interval === iv.value ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mr-1">Studies</span>
              {STUDIES_PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setStudiesIdx(i)}
                  className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${
                    studiesIdx === i ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main chart */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0d1421]">
              <div>
                <span className="font-bold text-white">{selected.label}</span>
                <span className="ml-2 text-xs text-gray-500">{selected.name}</span>
              </div>
              <span className="text-[10px] text-gray-600">Powered by TradingView</span>
            </div>
            <TradingViewWidget
              symbol={selected.symbol}
              interval={interval}
              height={560}
              theme="dark"
              studies={STUDIES_PRESETS[studiesIdx].studies}
            />
          </div>
        </>
      ) : (
        /* Dual layout */
        <div className="space-y-4">
          {/* Shared interval selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mr-1">Interval</span>
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${
                  interval === iv.value ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { pair: leftPair,  setPair: setLeftPair },
              { pair: rightPair, setPair: setRightPair },
            ].map(({ pair, setPair }, idx) => (
              <div key={idx} className="rounded-xl border border-white/5 overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-white/5 bg-[#0d1421]">
                  {PAIRS.map(p => (
                    <button
                      key={p.symbol}
                      onClick={() => setPair(p)}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${
                        pair.symbol === p.symbol ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-600 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <TradingViewWidget symbol={pair.symbol} interval={interval} height={460} theme="dark" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini grid — all pairs */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">All Pairs — Overview</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {PAIRS.map(p => (
            <button
              key={p.symbol}
              onClick={() => { setSelected(p); setLayout('single'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="group rounded-xl border border-white/5 overflow-hidden text-left hover:border-cyan-500/30 transition-colors"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-[#0d1421] border-b border-white/5">
                <span className="font-bold text-sm text-white">{p.label}</span>
                <span className="text-[10px] text-gray-500 group-hover:text-cyan-400 transition-colors">View full →</span>
              </div>
              <TradingViewWidget symbol={p.symbol} interval="D" height={200} theme="dark" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
