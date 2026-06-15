<div align="center">

# TIDEMARK

**Real-time crypto whale transaction monitor across 6 blockchains**

[![Live Demo](https://img.shields.io/badge/Live_Demo-tidemark--five.vercel.app-00C389?style=for-the-badge)](https://tidemark-five.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000?style=flat-square&logo=vercel)](https://vercel.com)
[![Redis](https://img.shields.io/badge/Upstash_Redis-00C389?style=flat-square&logo=redis&logoColor=white)](https://upstash.com)

</div>

---

TIDEMARK tracks on-chain transfers above **$100K** in real time across ETH, BTC, BSC, Arbitrum, Polygon, and Avalanche — giving traders and analysts a live view of whale movements as they happen.

## Features

- **Live Whale Feed** — scrolling transaction stream with 30-second auto-refresh and value filters ($100K / $500K / $1M+)
- **Multi-chain** — Ethereum, Bitcoin, BNB Chain, Arbitrum, Polygon, Avalanche from one dashboard
- **Server-side accumulation** — Redis-backed rolling history; every device sees the same data
- **Prices & Charts** — TradingView candlestick charts for BTC, ETH, and 10+ altcoins
- **AI Whale Insights** — Claude-powered analysis: chain distribution, top wallets, volume patterns
- **On-Chain Analytics** — ETH gas tracker, DEX pool volumes, trending coins, market sentiment
- **API Status Bar** — live health indicator for every data source

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router + ISR) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Storage | Upstash Redis |
| Deployment | Vercel |
| Charts | TradingView Widgets |
| AI | Anthropic Claude API |

**Data sources:** Etherscan V2 (ETH/ARB/MATIC) · mempool.space (BTC) · public RPC `eth_getLogs` (BSC/AVAX) · DexScreener · CoinGecko

## How it works

```
Browser  ──(30s poll)──►  /api/whale-txs
                               │
                 ┌─────────────┼─────────────────┐
                 ▼             ▼                  ▼
          Etherscan V2    eth_getLogs RPC    mempool.space
          ETH/ARB/MATIC   BSC / AVAX         BTC blocks
                 │             │                  │
                 └─────────────┴──────────────────┘
                               │
                  deduplicate + filter >$100K
                               │
                               ▼
                         Upstash Redis
                      (24h rolling window)
                               │
                               ▼
                         JSON response
```

On first deploy Redis is empty — the BTC fetcher runs in *sparse mode* and pulls 72 blocks (~12h) in parallel to seed history immediately. After that it switches to *normal mode* (6 blocks per poll) and Redis accumulates the rest.

## Getting Started

### Prerequisites

- Node.js 18+
- [Upstash Redis](https://upstash.com) database (free tier)
- [Etherscan](https://etherscan.io/apis) API key (free)
- [Anthropic](https://console.anthropic.com) API key (for AI Insights)

### Install

```bash
git clone https://github.com/michv-kk/tidemark.git
cd tidemark
npm install
```

### Environment variables

```env
# .env.local

NEXT_PUBLIC_ETHERSCAN_API_KEY=your_key

UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

ANTHROPIC_API_KEY=your_key
```

### Run

```bash
npm run dev    # http://localhost:3000
npm run build
npm start
```

## Project Structure

```
app/
├── page.tsx              # Dashboard — live whale feed
├── prices/               # TradingView charts
├── analytics/            # On-chain analytics
├── ai/                   # AI whale insights
├── markets/              # Market overview
├── wallets/              # Wallet analyzer
└── api/
    ├── whale-txs/        # Main data pipeline → Redis
    ├── analyze/          # Claude AI endpoint
    ├── coingecko/        # Proxied prices
    ├── gas/              # ETH gas tracker
    └── exchange-flows/

components/
├── TransactionCard       # Whale transaction row
├── TransactionModal      # Expanded TX detail
├── StatsBar              # Volume / rate / chains
├── Navbar                # Nav + live price ticker
├── ApiStatusBar          # Data source health
└── TradingViewChart      # Embedded chart widget

hooks/
└── useRealTransactions   # Polling + Redis-backed state

lib/
├── api/
│   ├── etherscan.ts
│   ├── prices.ts
│   └── mempool.ts
├── types.ts
└── knownWallets.ts       # Labeled whale addresses
```

## Deploying to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add the four environment variables
4. Deploy

The API route uses `maxDuration = 25` (fits Vercel hobby tier). Redis usage is ~4 commands per request — well within Upstash's free tier of 10K/day.

## License

MIT
