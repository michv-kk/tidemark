'use client';
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = 'pl' | 'en';

// ─── Translations ─────────────────────────────────────────────────────────────

const T = {
  pl: {
    hero_title_prefix: 'Czym jest',
    hero_sub: 'Twój dashboard on-chain intelligence w czasie rzeczywistym',
    hero_desc:
      'TIDEMARK agreguje dane na żywo z sieci Ethereum i Bitcoin, łącząc monitoring transakcji wielorybów, analizę rynku i insighty AI w jednym profesjonalnym dashboardzie. Wszystkie dane pochodzą z prawdziwych publicznych API — zero symulacji, zero generowanych liczb.',

    section_features: 'Co tutaj zobaczysz',
    section_faq: 'FAQ',
    section_sources: 'Źródła danych',
    footer_note:
      'TIDEMARK to niezależne narzędzie analityczne. Nie stanowi porady finansowej. Wszystkie dane z publicznych API blockchain.',

    features: [
      { emoji: '🐋', title: 'Whale Monitor', desc: 'Transakcje $100K+ z portfeli Binance, Coinbase, Circle w czasie rzeczywistym' },
      { emoji: '📊', title: 'Markets', desc: 'Ceny na żywo, market cap i wolumen 24h dla top 50 kryptowalut' },
      { emoji: '📈', title: 'Derivatives', desc: 'Funding rates i open interest z Binance Futures' },
      { emoji: '🔍', title: 'Analytics', desc: 'Fear & Greed Index, ceny gazu ETH, trending coins, exchange flows' },
      { emoji: '🧠', title: 'AI Insights', desc: 'Claude AI analizuje wzorce wielorybów i sygnały rynkowe' },
      { emoji: '👛', title: 'Wallets', desc: 'Analiza dowolnego adresu ETH: saldo, transakcje, whale score' },
    ],

    faq: [
      {
        q: 'Skąd pochodzą dane o transakcjach?',
        a: 'ETH, Base i Arbitrum: pobierane z Etherscan API V2 (jeden klucz, trzy sieci) — śledzimy transfery USDC, USDT i WBTC z portfeli Binance, Circle i Tether. Bitcoin: Mempool.space, ostatnie 3 potwierdzone bloki, transakcje ≥ 0.5 BTC. Solana: publiczny RPC Solany (bez klucza API) — USDC, USDT i natywny SOL z portfeli Binance, Kraken i Jump Crypto. Każda transakcja ma prawdziwy hash — kliknij ikonkę eksploratora żeby zweryfikować.',
      },
      {
        q: 'Co to jest Whale (wieloryb)?',
        a: 'Wielorybem nazywamy portfel lub transakcję o wartości powyżej $500,000. Wyróżniamy: Small Whale ($100K–$500K), Whale ($500K–$5M) i Mega Whale (>$5M). Ruchy wielorybów często poprzedzają większe ruchy rynkowe — instytucje i giełdy rzadko działają bez powodu.',
      },
      {
        q: 'Czy dane są 100% prawdziwe?',
        a: 'Tak. Zero generowanych danych. ETH/Base/ARB → Etherscan V2, BTC → Mempool.space, SOL → publiczny RPC Solany. Każdy hash możesz zweryfikować klikając ikonkę eksploratora. Ceny z CoinGecko, Fear & Greed z Alternative.me, Funding rates z Binance Futures.',
      },
      {
        q: 'Co to jest Fear & Greed Index?',
        a: 'Indeks Strachu i Chciwości (0–100) mierzy nastroje rynku krypto. 0–25 = Extreme Fear (panika), 26–45 = Fear, 46–55 = Neutral, 56–75 = Greed, 76–100 = Extreme Greed. Historycznie wartości poniżej 20 zbiegały się z dołkami cenowymi BTC.',
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
        a: 'Whale Score (0–100) to kompozytowy wskaźnik oparty na: wolumenie transakcji (40%), częstotliwości aktywności (30%) i średniej wartości transakcji (30%). Wynik 70+ = duży gracz/instytucja. 40–70 = aktywny trader. 0–40 = zwykły użytkownik.',
      },
      {
        q: 'Jak często dane się aktualizują?',
        a: 'Transakcje ETH: co 15 sekund. Transakcje BTC: co 20 sekund. Ceny rynkowe: co 2 minuty (limit CoinGecko). Gas prices: co 30 sekund. Fear & Greed: raz dziennie. Funding rates: co 60 sekund.',
      },
      {
        q: 'Czy mogę to wdrożyć na własnym serwerze?',
        a: 'Tak! Potrzebujesz: Node.js 18+, klucza Etherscan API (darmowy na etherscan.io), opcjonalnie klucza Anthropic do AI insights. Skopiuj `.env.local.example`, uzupełnij klucze i uruchom `npm run dev`.',
      },
    ],
  },

  en: {
    hero_title_prefix: 'What is',
    hero_sub: 'Your real-time on-chain intelligence dashboard',
    hero_desc:
      'TIDEMARK aggregates live blockchain data from Ethereum and Bitcoin networks, combining whale transaction monitoring, market analytics, and AI-powered insights into a single professional dashboard. All data comes from real public APIs — no simulations, no generated numbers.',

    section_features: "What you're looking at",
    section_faq: 'FAQ',
    section_sources: 'Data Sources',
    footer_note:
      'TIDEMARK is an independent analytics tool. Not financial advice. All data from public blockchain APIs.',

    features: [
      { emoji: '🐋', title: 'Whale Monitor', desc: 'Track $100K+ transactions from Binance, Coinbase, Circle wallets in real time' },
      { emoji: '📊', title: 'Markets', desc: 'Live prices, market cap, 24h volume for top 50 cryptocurrencies' },
      { emoji: '📈', title: 'Derivatives', desc: 'Funding rates and open interest from Binance Futures' },
      { emoji: '🔍', title: 'Analytics', desc: 'Fear & Greed Index, ETH gas prices, trending coins, exchange flows' },
      { emoji: '🧠', title: 'AI Insights', desc: 'Claude AI analyzes whale patterns and market signals' },
      { emoji: '👛', title: 'Wallets', desc: 'Deep-dive any ETH address: balance, transactions, whale score' },
    ],

    faq: [
      {
        q: 'Where does the transaction data come from?',
        a: 'ETH, Base and Arbitrum: fetched from the Etherscan V2 API (one key, three chains) — we track USDC, USDT and WBTC transfers from Binance, Circle and Tether whale wallets. Bitcoin: Mempool.space, last 3 confirmed blocks, transactions ≥ 0.5 BTC. Solana: public Solana RPC (no API key) — USDC, USDT and native SOL transfers from Binance, Kraken and Jump Crypto wallets. Every transaction hash is real and verifiable.',
      },
      {
        q: 'What is a Whale?',
        a: 'A whale is a wallet or transaction with a value above $500,000. We distinguish three tiers: Small Whale ($100K–$500K), Whale ($500K–$5M), and Mega Whale (>$5M). Whale movements often precede broader market moves — institutions and exchanges rarely act without reason.',
      },
      {
        q: 'Is the data 100% real?',
        a: "Yes. Zero generated data. ETH/Base/ARB → Etherscan V2, BTC → Mempool.space, SOL → Solana public RPC. Every transaction hash is verifiable — click the explorer icon next to any transaction. Prices from CoinGecko, Fear & Greed from Alternative.me, Funding rates from Binance Futures.",
      },
      {
        q: 'What is the Fear & Greed Index?',
        a: 'The Fear & Greed Index (0–100) measures overall crypto market sentiment. 0–25 = Extreme Fear, 26–45 = Fear, 46–55 = Neutral, 56–75 = Greed, 76–100 = Extreme Greed. Following Warren Buffett\'s principle: "be greedy when others are fearful." Historically, readings below 20 have coincided with BTC price bottoms.',
      },
      {
        q: 'What are Funding Rates in the Derivatives tab?',
        a: 'A funding rate is a periodic payment between long and short traders in perpetual futures markets. Positive rate (green): longs pay shorts — the market has a bullish bias but also carries long-squeeze risk. Negative rate (red): shorts pay longs — bearish bias with potential for a short squeeze. The annualized rate lets you compare the cost of holding a position against other investments.',
      },
      {
        q: 'What are Exchange Flows?',
        a: 'Net ETH flow in and out of exchanges over 24h. Inflow (more ETH entering an exchange) = bearish — people are depositing to sell. Outflow (more ETH leaving) = bullish — people are withdrawing to their own wallets (cold storage), which reduces available supply on the market.',
      },
      {
        q: 'How does the Whale Score work in the wallet analyzer?',
        a: 'The Whale Score (0–100) is a composite indicator based on: transaction volume (40%), activity frequency (30%), and average transaction value (30%). Score 70+ = major player / institution. 40–70 = active trader. 0–40 = regular user.',
      },
      {
        q: 'How often does the data update?',
        a: 'ETH transactions: every 15 seconds. BTC transactions: every 20 seconds. Market prices: every 2 minutes (CoinGecko rate limit). Gas prices: every 30 seconds. Fear & Greed: once per day (API limitation). Funding rates: every 60 seconds.',
      },
      {
        q: 'Can I self-host this?',
        a: 'Yes! You need: Node.js 18+, an Etherscan API key (free at etherscan.io), and optionally an Anthropic API key for AI insights. Copy `.env.local.example`, fill in the keys, and run `npm run dev`.',
      },
    ],
  },
} as const;

const DATA_SOURCES = [
  { name: 'Etherscan', desc_pl: 'Transakcje ETH, ceny gazu, historia portfeli', desc_en: 'ETH transactions, gas prices, wallet history', url: 'https://etherscan.io' },
  { name: 'Mempool.space', desc_pl: 'Potwierdzone transakcje Bitcoin', desc_en: 'Bitcoin confirmed block transactions', url: 'https://mempool.space' },
  { name: 'Solana RPC', desc_pl: 'Transakcje SOL/USDC/USDT na Solanie', desc_en: 'SOL / USDC / USDT whale transfers on Solana', url: 'https://solana.com' },
  { name: 'CoinGecko', desc_pl: 'Ceny, market cappy, trending coins', desc_en: 'Prices, market caps, trending coins', url: 'https://coingecko.com' },
  { name: 'Binance Futures', desc_pl: 'Funding rates, open interest', desc_en: 'Funding rates, open interest', url: 'https://www.binance.com' },
  { name: 'Alternative.me', desc_pl: 'Fear & Greed Index', desc_en: 'Fear & Greed Index', url: 'https://alternative.me' },
  { name: 'Owlracle', desc_pl: 'Zapasowe źródło cen gazu ETH', desc_en: 'ETH gas price fallback', url: 'https://owlracle.info' },
];

// ─── Language switcher ────────────────────────────────────────────────────────

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 gap-0.5">
      {(['pl', 'en'] as Lang[]).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
            lang === l
              ? 'bg-cyan-500 text-white shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {l === 'pl' ? '🇵🇱 PL' : '🇬🇧 EN'}
        </button>
      ))}
    </div>
  );
}

// ─── Accordion item ───────────────────────────────────────────────────────────

function AccordionItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
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
  const [lang, setLang] = useState<Lang>('pl');
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const t = T[lang];

  const handleLangChange = (l: Lang) => {
    setLang(l);
    setOpenIdx(null); // zamknij accordion przy zmianie języka
  };

  const toggle = (idx: number) => setOpenIdx(prev => (prev === idx ? null : idx));

  return (
    <div className="min-h-screen bg-[#080810]">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Hero */}
        <div className="text-center mb-16">
          {/* Language switcher — top right of hero */}
          <div className="flex justify-end mb-8">
            <LangSwitch lang={lang} setLang={handleLangChange} />
          </div>

          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-lg font-black">T</span>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
            {t.hero_title_prefix} <span className="text-cyan-400">TIDEMARK</span>?
          </h1>
          <p className="text-lg text-gray-400 mb-2">{t.hero_sub}</p>
          <p className="text-gray-500 text-sm max-w-2xl mx-auto leading-relaxed">
            {t.hero_desc}
          </p>
        </div>

        {/* Feature cards */}
        <section className="mb-16">
          <h2 className="text-white font-bold text-xl mb-6">{t.section_features}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {t.features.map(f => (
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
          <h2 className="text-white font-bold text-xl mb-6">{t.section_faq}</h2>
          <div className="space-y-2">
            {t.faq.map((item, idx) => (
              <AccordionItem
                key={`${lang}-${idx}`}
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
          <h2 className="text-white font-bold text-xl mb-6">{t.section_sources}</h2>
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
                <div className="text-gray-500 text-xs leading-relaxed">
                  {lang === 'pl' ? src.desc_pl : src.desc_en}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <div className="border border-white/5 bg-white/[0.02] rounded-xl p-5 text-center">
          <p className="text-gray-500 text-xs leading-relaxed">{t.footer_note}</p>
        </div>

      </div>
    </div>
  );
}
