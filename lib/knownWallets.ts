import { KnownWallet } from './types';

export const KNOWN_WALLETS: KnownWallet[] = [
  // ─── Major Exchanges (ETH) ───────────────────────────────────────────
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance Hot Wallet', type: 'exchange', exchange: 'Binance' },
  { address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', label: 'Binance Cold Wallet', type: 'exchange', exchange: 'Binance' },
  { address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', label: 'Binance Reserve', type: 'exchange', exchange: 'Binance' },
  { address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', label: 'Binance Whale Wallet', type: 'exchange', exchange: 'Binance' },
  { address: '0x503828976D22510aad0201ac7EC88293211D23Da', label: 'Coinbase Hot Wallet', type: 'exchange', exchange: 'Coinbase' },
  { address: '0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740', label: 'Coinbase 2', type: 'exchange', exchange: 'Coinbase' },
  { address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', label: 'Coinbase 3', type: 'exchange', exchange: 'Coinbase' },
  { address: '0xA090e606E30bD747d4E6245a1517EbE430F0057e', label: 'Coinbase Prime', type: 'exchange', exchange: 'Coinbase' },
  { address: '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2', label: 'Kraken 1', type: 'exchange', exchange: 'Kraken' },
  { address: '0x0A869d79a7052C7f1b55a8EbAbbEa3420F0D1E13', label: 'Kraken 2', type: 'exchange', exchange: 'Kraken' },
  { address: '0xE853c56864A2ebe4576a807D26Fdc4A0adA51919', label: 'Kraken 3', type: 'exchange', exchange: 'Kraken' },
  { address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', label: 'OKX Hot Wallet', type: 'exchange', exchange: 'OKX' },
  { address: '0x98EC059Dc3aDFBdd63429454aeB0c990FBA4A128', label: 'OKX 2', type: 'exchange', exchange: 'OKX' },
  { address: '0x236f9f97e0E62388479bf9E1B38590f2A99C4Be1', label: 'Bybit Hot Wallet', type: 'exchange', exchange: 'Bybit' },
  { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', label: 'Bybit 2', type: 'exchange', exchange: 'Bybit' },
  { address: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', label: 'KuCoin Hot Wallet', type: 'exchange', exchange: 'KuCoin' },
  { address: '0x2B5634C42055806a59e9107ED44D43c426E58258', label: 'KuCoin 2', type: 'exchange', exchange: 'KuCoin' },
  { address: '0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2', label: 'FTX Exchange (defunct)', type: 'exchange', exchange: 'FTX' },
  { address: '0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94', label: 'FTX US', type: 'exchange', exchange: 'FTX' },
  { address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', label: 'Binance Legacy', type: 'exchange', exchange: 'Binance' },
  { address: '0xd551234Ae421e3BCBA99A0Da6d736074f22192FF', label: 'Binance 5', type: 'exchange', exchange: 'Binance' },
  { address: '0x564286362092D8e7936f0549571a803B203aAceD', label: 'Binance 6', type: 'exchange', exchange: 'Binance' },
  { address: '0x0681d8Db095565FE8A346fA0277bFfdE9C0eDBBF', label: 'Huobi 1', type: 'exchange', exchange: 'Huobi' },
  { address: '0xaB5C66752a9e8167967685F1450532fB96d5d24f', label: 'Huobi 2', type: 'exchange', exchange: 'Huobi' },
  { address: '0x6f48d3c8A1B1e2B7C9B8f6A3dD3f4C6e8B9A0d2E', label: 'Gate.io', type: 'exchange', exchange: 'Gate.io' },

  // ─── Known Funds & Institutions ─────────────────────────────────────
  { address: '0x0c23fc0ef06716d2f8ba19bc4bed0e3a89a67064', label: 'Jump Trading', type: 'fund' },
  { address: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0', label: 'Jump Crypto', type: 'fund' },
  { address: '0x4862733B5FdDFd35f35ea8CCf08F5045e57388B3', label: 'Alameda Research (historical)', type: 'fund' },
  { address: '0x224990806f5c0d2904aa9f5c95b6be6f9da5a0b0', label: 'a16z Crypto', type: 'fund' },
  { address: '0x05e793ce0c6027323ac150f6d45c2344d28b6019', label: 'Wintermute', type: 'fund' },
  { address: '0xE92d1A43df510F82C66382592a047d288f85226f', label: 'Cumberland DRW', type: 'fund' },
  { address: '0x9c2fc4fc75fa2d7eb5ba9147fa7430756654faa9', label: 'Paradigm', type: 'fund' },
  { address: '0x275C1d28F98c4b6f3CF74E88C32CC34de87A4cAf', label: 'Multicoin Capital', type: 'fund' },

  // ─── DeFi Protocols ──────────────────────────────────────────────────
  { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', label: 'Uniswap V3 Router', type: 'defi' },
  { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', label: 'Uniswap V2 Router', type: 'defi' },
  { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', label: 'Uniswap V3 Factory', type: 'defi' },
  { address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', label: 'Aave V3 Pool', type: 'defi' },
  { address: '0xBA12222222228d8Ba445958a75a0704d566BF2C8', label: 'Balancer Vault', type: 'defi' },
  { address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', label: 'SushiSwap Router', type: 'defi' },
  { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', label: '1inch Router', type: 'defi' },
  { address: '0x00000000219ab540356cBB839Cbe05303d7705Fa', label: 'ETH 2.0 Deposit', type: 'protocol' },

  // ─── Stablecoins & Protocols ─────────────────────────────────────────
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', label: 'Tether (USDT) Contract', type: 'protocol' },
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', label: 'USD Coin (USDC) Contract', type: 'protocol' },
  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', label: 'DAI Contract', type: 'protocol' },
  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', label: 'Wrapped ETH (WETH)', type: 'protocol' },
  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', label: 'Wrapped BTC (WBTC)', type: 'protocol' },

  // ─── Bridges ─────────────────────────────────────────────────────────
  { address: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35', label: 'Arbitrum Bridge', type: 'bridge' },
  { address: '0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf', label: 'Polygon Bridge', type: 'bridge' },
  { address: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1', label: 'Optimism Bridge', type: 'bridge' },
  { address: '0x8EB8a3b98659Cce290402893d0123abb75E3ab28', label: 'Avalanche Bridge', type: 'bridge' },

  // ─── BTC Addresses ───────────────────────────────────────────────────
  { address: '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s', label: 'Binance BTC Cold', type: 'exchange', exchange: 'Binance' },
  { address: '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j', label: 'Coinbase BTC', type: 'exchange', exchange: 'Coinbase' },
  { address: '1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC', label: 'Kraken BTC', type: 'exchange', exchange: 'Kraken' },
  { address: '385cR5DM96n1HvBDMzLHPYcw89fZAXULJP', label: 'OKX BTC Cold', type: 'exchange', exchange: 'OKX' },
  { address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo', label: 'Binance BTC 2', type: 'exchange', exchange: 'Binance' },

  // ─── Whale Wallets ────────────────────────────────────────────────────
  { address: '0xF66852bC122fD40bFECc63CD48217e88bda12109', label: 'Ethereum Whale #1', type: 'whale' },
  { address: '0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0', label: 'Ethereum Whale #2', type: 'whale' },
  { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', label: 'MKR Whale', type: 'whale' },
  { address: '0xdc76cd25977e0a5ae17155770273ad58648900d3', label: 'Large ETH Holder', type: 'whale' },
  { address: '0xbE0Eb53F46Cd790Cd13851d5EFf43D12404d33e8', label: 'Institutional Whale', type: 'whale' },
];

const walletMap = new Map<string, KnownWallet>(
  KNOWN_WALLETS.map(w => [w.address.toLowerCase(), w])
);

export function lookupWallet(address: string): KnownWallet | null {
  return walletMap.get(address.toLowerCase()) ?? null;
}

export function getWalletLabel(address: string): string {
  const known = lookupWallet(address);
  return known ? known.label : 'Unknown Wallet';
}

export function getWalletType(address: string): string {
  const known = lookupWallet(address);
  if (!known) return 'unknown';
  return known.type;
}

export const EXCHANGE_ADDRESSES = new Set(
  KNOWN_WALLETS.filter(w => w.type === 'exchange').map(w => w.address.toLowerCase())
);

export function isExchangeWallet(address: string): boolean {
  return EXCHANGE_ADDRESSES.has(address.toLowerCase());
}
