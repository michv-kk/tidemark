'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import WalletAnalyzer from '@/components/WalletAnalyzer';
import { KNOWN_WALLETS } from '@/lib/knownWallets';
import { formatAddress } from '@/lib/formatters';
import { Shield, TrendingUp, Database } from 'lucide-react';

const FEATURED_WALLETS = KNOWN_WALLETS.filter(w =>
  w.type === 'exchange' || w.type === 'fund'
).slice(0, 12);

export default function WalletsContent() {
  const searchParams = useSearchParams();
  const prefilledAddress = searchParams.get('address') ?? '';

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Wallet Tracker</h1>
        <p className="text-gray-500 text-sm mt-1">
          Analyze any ETH wallet — view transactions, whale score, and on-chain history
        </p>
      </div>

      {/* Features strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: <Database size={16} className="text-cyan-400" />, title: '60+ Known Wallets', desc: 'Exchanges, funds, whales' },
          { icon: <Shield size={16} className="text-green-400" />, title: 'Whale Score', desc: 'Risk & influence rating' },
          { icon: <TrendingUp size={16} className="text-purple-400" />, title: 'Full History', desc: 'Via Etherscan API' },
        ].map((f, i) => (
          <div key={i} className="stat-card flex items-center gap-3">
            <div className="flex-shrink-0">{f.icon}</div>
            <div>
              <div className="text-white text-xs font-semibold">{f.title}</div>
              <div className="text-gray-500 text-xs">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main analyzer with pre-filled address */}
      <WalletAnalyzer initialAddress={prefilledAddress} />

      {/* Known wallets directory */}
      <div className="mt-8">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-3">Known Wallets Directory</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {FEATURED_WALLETS.map(wallet => (
            <a
              key={wallet.address}
              href={`/wallets?address=${wallet.address}`}
              className="flex items-center gap-3 bg-[#0d1421] border border-white/5 rounded-lg px-3 py-2.5 hover:border-cyan-500/30 transition-all group"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                wallet.type === 'exchange' ? 'bg-blue-400' :
                wallet.type === 'fund' ? 'bg-purple-400' :
                'bg-gray-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-medium truncate group-hover:text-cyan-400 transition-colors">
                  {wallet.label}
                </div>
                <div className="text-gray-600 text-xs font-mono truncate">{formatAddress(wallet.address)}</div>
              </div>
              <div className={`text-xs capitalize px-1.5 py-0.5 rounded flex-shrink-0 ${
                wallet.type === 'exchange' ? 'text-blue-400 bg-blue-900/30' :
                wallet.type === 'fund' ? 'text-purple-400 bg-purple-900/30' :
                'text-gray-400 bg-gray-900/30'
              }`}>{wallet.type}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
