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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com",
              "frame-src 'self' https://www.tradingview.com",
              "connect-src 'self' https://api.coingecko.com https://api.etherscan.io https://api.exchangerate-api.com wss://stream.binance.com",
              "img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
