/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.coingecko.com' },
      { protocol: 'https', hostname: 'coin-images.coingecko.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com https://s.tradingview.com",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com",
              "connect-src 'self' https://api.coingecko.com https://api.etherscan.io https://mempool.space https://api.dexscreener.com https://api.exchangerate-api.com https://api.alternative.me wss://stream.binance.com wss://*.tradingview.com https://*.tradingview.com https://fapi.binance.com https://api.owlracle.info https://api.mainnet-beta.solana.com",
              "img-src 'self' data: blob: https: http:",
              "style-src 'self' 'unsafe-inline' https://s3.tradingview.com",
              "font-src 'self' data: https://s3.tradingview.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
