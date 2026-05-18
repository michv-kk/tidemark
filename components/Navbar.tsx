'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Search, Settings, X, Wallet, TrendingUp, LayoutDashboard } from 'lucide-react';
import { useAlerts } from '@/contexts/AlertsContext';
import { formatTimeAgo } from '@/lib/formatters';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { href: '/markets', label: 'Markets', icon: <TrendingUp size={14} /> },
  { href: '/wallets', label: 'Wallets', icon: <Wallet size={14} /> },
];

async function searchCoins(q: string) {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
    const data = await res.json();
    return (data.coins ?? []).slice(0, 5).map((c: { id: string; symbol: string; name: string; market_cap_rank: number }) => ({
      id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, rank: c.market_cap_rank,
    }));
  } catch { return []; }
}

function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s) || s.length === 44;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount, alerts, markAllRead } = useAlerts();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; symbol: string; name: string; rank: number }[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // CMD+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setAlertsOpen(false);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setAlertsOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (isAddress(value)) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchCoins(value);
      setResults(res);
    }, 300);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    if (isAddress(query)) {
      router.push(`/wallets?address=${encodeURIComponent(query)}`);
      setSearchOpen(false);
      setQuery('');
    }
  }, [query, router]);

  const openSearch = () => {
    setSearchOpen(true);
    setAlertsOpen(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#080d18]/95 backdrop-blur-xl">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-black">T</span>
          </div>
          <span className="text-white font-bold tracking-wider text-lg">TIDEMARK</span>
          <span className="hidden sm:inline text-xs text-cyan-400/60 uppercase tracking-widest border border-cyan-500/20 px-1.5 py-0.5 rounded">PRO</span>
        </Link>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname === link.href
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm border border-white/5 hover:border-white/10"
          >
            <Search size={14} />
            <span className="hidden sm:inline text-xs">Search</span>
            <kbd className="hidden lg:inline text-xs bg-white/5 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
          </button>

          {/* Alerts bell */}
          <div className="relative">
            <button
              onClick={() => { setAlertsOpen(p => !p); setSearchOpen(false); markAllRead(); }}
              className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Alerts drawer */}
            {alertsOpen && (
              <div className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto bg-[#0d1421] border border-white/10 rounded-xl shadow-2xl z-50">
                <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0d1421]">
                  <span className="text-white text-sm font-semibold">Alert History</span>
                  <span className="text-gray-500 text-xs">{alerts.length} total</span>
                </div>
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">No alerts yet</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {alerts.slice(0, 50).map(a => (
                      <div key={a.id} className={`px-4 py-3 ${a.read ? '' : 'bg-white/3'}`}>
                        <div className="text-white text-xs font-medium">{a.message}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{a.detail}</div>
                        <div className="text-gray-600 text-xs mt-0.5">{formatTimeAgo(a.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Settings */}
          <Link href="/settings" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <Settings size={16} />
          </Link>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg bg-[#0d1421] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <Search size={16} className="text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }}
                placeholder="Search coin, ticker, or wallet address..."
                className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
              />
              <button onClick={() => setSearchOpen(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {isAddress(query) && (
              <div
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer"
                onClick={handleSearchSubmit}
              >
                <Wallet size={14} className="text-cyan-400" />
                <div>
                  <div className="text-white text-sm font-mono">{query.slice(0, 12)}...{query.slice(-6)}</div>
                  <div className="text-gray-500 text-xs">Wallet address — click to analyze</div>
                </div>
              </div>
            )}
            {results.length > 0 && (
              <div className="divide-y divide-white/5 max-h-60 overflow-y-auto">
                {results.map(r => (
                  <div
                    key={r.id}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer"
                    onClick={() => { router.push(`/markets?coin=${r.id}`); setSearchOpen(false); setQuery(''); }}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-cyan-400">
                      {r.symbol[0]}
                    </div>
                    <div className="flex-1">
                      <span className="text-white text-sm font-medium">{r.name}</span>
                      <span className="text-gray-500 text-xs ml-2">{r.symbol}</span>
                    </div>
                    {r.rank && <span className="text-gray-600 text-xs">#{r.rank}</span>}
                  </div>
                ))}
              </div>
            )}
            {!query && (
              <div className="px-4 py-3 text-gray-600 text-xs">
                Type a coin name, symbol, or paste a wallet address
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
