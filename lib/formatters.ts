export function formatUSD(value: number, compact = false): string {
  if (compact) {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value);
}

export function formatCurrency(value: number, currency: string, compact = false): string {
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł' };
  const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, PLN: 4.02 };
  const converted = value * (rates[currency] ?? 1);
  const sym = symbols[currency] ?? '$';

  if (compact) {
    if (converted >= 1e12) return `${sym}${(converted / 1e12).toFixed(2)}T`;
    if (converted >= 1e9) return `${sym}${(converted / 1e9).toFixed(2)}B`;
    if (converted >= 1e6) return `${sym}${(converted / 1e6).toFixed(2)}M`;
    if (converted >= 1e3) return `${sym}${(converted / 1e3).toFixed(1)}K`;
    return `${sym}${converted.toFixed(2)}`;
  }
  return `${sym}${converted.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatAddress(address: string, chars = 6): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function formatPercent(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatTokenAmount(amount: number, token: string): string {
  const decimals = ['BTC', 'ETH', 'SOL'].includes(token) ? 4 : 2;
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${token}`;
}

export function getChangeColor(change: number): string {
  if (change > 0) return 'text-green-400';
  if (change < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function getChangeBg(change: number): string {
  if (change > 3) return 'bg-green-500';
  if (change > 1) return 'bg-green-600';
  if (change > 0) return 'bg-green-800';
  if (change < -3) return 'bg-red-500';
  if (change < -1) return 'bg-red-600';
  if (change < 0) return 'bg-red-800';
  return 'bg-gray-700';
}
