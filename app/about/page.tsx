'use client';
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── Feature cards ────────────────────────────────────────────────────────────

const FEATURES = [
  { emoji: '🐋', title: 'Whale Monitor', desc: 'Track $100K+ transactions from Binance, Coinbase, Circle wallets in real time' },
  { emoji: '📊', title: 'Markets', desc: 'Live prices, market cap, 24h volume for top 50 cryptocurrencies' },
  { emoji: '📈', title: 'Derivatives', desc: 'Funding rates and open interest from Binance Futures' },
  { emoji: '🔍', title: 'Analytics', desc: 'Fear & Greed Index, ETH gas prices, trending coins, exchange flows' },
  { emoji: '🧠', title: 'AI Insights', desc: 'Claude AI analyzes whale patterns and market signals' },
  { emoji: '👛', title: 'Wallets', desc: 'Deep-dive any ETH address: balance, transactions, whale score' },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: 'Skąd pochodzą dane o transakcjach?',
    a: 'Transakcje ETH pobierane są z Etherscan API V2 — śledzimy transfery tokenów (USDC, USDT, WBTC) z portfeli wielorybów takich jak Tether Treasury, Circle i aktywne portfele Binance. Transakcje BTC pobierane są z Mempool.space — analizujemy ostatnie potwierdzone bloki i filtrujemy transakcje powyżej 0.5 BTC. Wszystkie transakcje mają prawdziwe hashe — możesz je zweryfikować klikając ikonkę eksploratora przy każdej transakcji.',
  },
  {
    q: 'Co to jest Whale (wieloryb)?',
    a: 'Wielorybem nazywamy portfel lub transakcję o wartości powyżej $500,000. Wyróżniamy: Small Whale ($100K-$500K), Whale ($500K-$5M) i Mega Whale (>$5M). Ruchy wielorybów często poprzedzają większe ruchy rynkowe — instytucje i giełdy rzadko działają bez powodu.',
  },
  {
    q: 'Czy dane są 100% prawdziwe?',
    a: 'Tak. Nie ma tu żadnych generowanych ani losowych danych. Każda transakcja ma prawdziwy hash blockchain, który możesz sprawdzić w Etherscan (ETH) lub Mempool.space (BTC). Ceny i dane rynkowe pochodzą z CoinGecko. Fear & Greed Index z Alternative.me. Funding rates z Binance Futures API.',
  },
  {
    q: 'Co to jest Fear & Greed Index?',
    a: 'Indeks Strachu i Chciwości (0-100) mierzy nastroje rynku krypto. 0-25 = Extreme Fear (panika), 26-45 = Fear, 46-55 = Neutral, 56-75 = Greed, 76-100 = Extreme Greed. Według zasady Warrena Buffetta: "bądź chciwy gdy inni się boją". Historycznie wartości poniżej 20 zbiegały się z dołkami cenowymi BTC.',
  },
  {
    q: 'Co to są Funding Rates w zakładce Derivatives?',
    a: 'Funding rate to opłata między traderami long i short na rynkach futures. Dodatni rate (zielony): longi płacą shortom — rynek ma bullish bias, ale też ryzyko "long squeeze". Ujemny rate (czerwony): shorty płacą longom — bearish bias, ale możliwy "short squeeze". Annualizowany rate pozwala porównać koszt trzymania pozycji z innymi inwestycjami.',
  },
  {
    q: 'Co to Exchange Flows?',
    a: 'Netto przepływ ETH do/z giełd w ciągu 24h. Inflow (więcej ETH wchodzi na giełdę) = bearish — ludzie deponują żeby sprzedać. Outflow (więcej ETH wychodzi) = bullish — ludzie wypłacają na własne portfele (cold storage), co zmniejsza podaż na rynku.',
  },
  {
    q: 'Jak działa Whale Score w analizatorze portfeli?',
    a: 'Whale Score (0-100) to kompozytowy wskaźnik oparty na: wolumenie transakcji (40%), częstotliwości aktywności (30%) i średniej wartości transakcji (30%). Wynik 70+ = duży gracz/instytucja. 40-70 = aktywny trader. 0-40 = zwykły użytkownik.',
  },
  {
    q: 'Jak często dane się aktualizują?',
    a: 'Transakcje ETH: co 15 sekund. Transakcje BTC: co 20 sekund. Ceny rynkowe: co 2 minuty (CoinGecko limit). Gas prices: co 30 sekund. Fear & Greed: raz dziennie (API tak podaje). Funding rates: co 60 sekund.',
  },
  {
    q: 'Czy mogę to wdrożyć na własnym serwerze?',
    a: 'Tak! Projekt jest open source. Potrzebujesz: Node.js 18+, klucza Etherscan API (darmowy na etherscan.io), opcjonalnie klucza Anthropic do AI insights. Skopiuj `.env.local.example`, uzupełnij klucze i uruchom `npm run dev`.',
  },
];

// ─── Data sources ─────────────────────────────────────────────────────────────

const DATA_SOURCES = [
  { name: 'Etherscan', desc: 'ETH transactions, gas prices, wallet history', url: 'https://etherscan.io' },
  { name: 'Mempool.space', desc: 'Bitcoin confirmed block transactions', url: 'https://mempool.space' },
  { name: 'CoinGecko', desc: 'Prices, market caps, trending coins', url: 'https://coingecko.com' },
  { name: 'Binance Futures', desc: 'Funding rates, open interest', url: 'https://www.binance.com' },
  { name: 'Alternative.me', desc: 'Fear & Greed Index', url: 'https://alternative.me' },
  { name: 'Owlracle', desc: 'ETH gas fallback', url: 'https://owlracle.info' },
];

// ─── Accordion item ───────────────────────────────────────────────────────────

function AccordionItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/3 transition-colors"
        onClick={onToggle}
      >
        <span className="text-white font-medium text-sm pr-4">{q}</span>
        <ChevronDown
          size={16}
          className="text-cyan-400 flex-shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '500px' : '0px', opacity: open ? 1 : 0 }}
      >
        <div className="px-5 pb-5 text-gray-400 text-sm leading-relaxed border-t border-white/5 pt-4">
          {a}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (idx: number) => setOpenIdx(prev => (prev === idx ? null : idx));

  return (
    <div className="min-h-screen bg-[#080810]">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-lg font-black">T</span>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
            What is <span className="text-cyan-400">TIDEMARK</span>?
          </h1>
          <p className="text-lg text-gray-400 mb-2">Your real-time on-chain intelligence dashboard</p>
          <p className="text-gray-500 text-sm max-w-2xl mx-auto leading-relaxed">
            TIDEMARK aggregates live blockchain data from Ethereum and Bitcoin networks, combining whale transaction monitoring,
            market analytics, and AI-powered insights into a single professional dashboard. All data comes from real public APIs —
            no simulations, no generated numbers.
          </p>
        </div>

        {/* Feature cards */}
        <section className="mb-16">
          <h2 className="text-white font-bold text-xl mb-6">What you&apos;re looking at</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="border border-white/5 bg-white/[0.03] rounded-xl p-5 hover:border-cyan-500/20 hover:bg-white/5 transition-colors"
              >
                <div className="text-2xl mb-3">{f.emoji}</div>
                <div className="text-white font-semibold text-sm mb-1">{f.title}</div>
                <div className="text-gray-500 text-xs leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-white font-bold text-xl mb-6">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((item, idx) => (
              <AccordionItem
                key={idx}
                q={item.q}
                a={item.a}
                open={openIdx === idx}
                onToggle={() => toggle(idx)}
              />
            ))}
          </div>
        </section>

        {/* Data Sources */}
        <section className="mb-16">
          <h2 className="text-white font-bold text-xl mb-6">Data Sources</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DATA_SOURCES.map(src => (
              <a
                key={src.name}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-white/5 bg-white/[0.03] rounded-xl p-4 hover:border-cyan-500/20 hover:bg-white/5 transition-colors group"
              >
                <div className="text-white font-semibold text-sm mb-1 group-hover:text-cyan-400 transition-colors">
                  {src.name}
                </div>
                <div className="text-gray-500 text-xs leading-relaxed">{src.desc}</div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5 text-center">
          <p className="text-gray-500 text-xs leading-relaxed">
            TIDEMARK is an independent analytics tool. Not financial advice. All data from public blockchain APIs.
          </p>
        </div>

      </div>
    </div>
  );
}
