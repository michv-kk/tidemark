'use client';
import React, { memo } from 'react';
import { Transaction } from '@/lib/types';
import { formatUSD, formatAddress, formatTimeAgo, formatTokenAmount } from '@/lib/formatters';
import { lookupWallet } from '@/lib/knownWallets';
import { ArrowRight, ExternalLink } from 'lucide-react';

const CHAIN_COLORS: Record<string, string> = {
  ETH: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BTC: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  BSC: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  SOL: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ARB: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  MATIC: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  AVAX: 'bg-red-500/20 text-red-300 border-red-500/30',
  OP: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

const TYPE_LABELS: Record<string, string> = {
  transfer: 'TRANSFER', swap: 'SWAP', bridge: 'BRIDGE',
  stake: 'STAKE', unstake: 'UNSTAKE', liquidation: '⚡ LIQUIDATION',
  mint: 'MINT', burn: 'BURN',
};

function getWhaleBadge(value: number): { label: string; cls: string } | null {
  if (value >= 100_000_000) return { label: '🔥 GIGANTIC', cls: 'bg-red-600 text-white' };
  if (value >= 10_000_000) return { label: '🚨 MEGA', cls: 'bg-orange-500 text-white' };
  if (value >= 1_000_000) return { label: '🐋 WHALE', cls: 'bg-cyan-600 text-white' };
  return null;
}

interface Props {
  tx: Transaction;
  onClick: (tx: Transaction) => void;
}

function TransactionCard({ tx, onClick }: Props) {
  const fromLabel = lookupWallet(tx.from)?.label;
  const toLabel = lookupWallet(tx.to)?.label;
  const badge = getWhaleBadge(tx.value);
  const chainCls = CHAIN_COLORS[tx.chain] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  const etherscanBase = tx.chain === 'BTC'
    ? 'https://blockstream.info/tx/'
    : tx.chain === 'SOL'
    ? 'https://solscan.io/tx/'
    : 'https://etherscan.io/tx/';

  return (
    <div
      className="tx-card group cursor-pointer"
      onClick={() => onClick(tx)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(tx)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chain-badge border ${chainCls}`}>{tx.chain}</span>
          <span className="text-xs text-gray-500 uppercase tracking-wide font-mono">{TYPE_LABELS[tx.type] ?? tx.type}</span>
          {badge && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${badge.cls}`}>{badge.label}</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white">{formatUSD(tx.value, true)}</div>
          <div className="text-xs text-gray-400">{formatTokenAmount(tx.amount, tx.token)}</div>
        </div>
      </div>

      {/* Addresses */}
      <div className="flex items-center gap-2 text-sm mb-3 overflow-hidden">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">FROM</div>
          <div className="text-gray-200 font-mono text-xs truncate" title={tx.from}>
            {fromLabel
              ? <span className="text-cyan-400 font-semibold">{fromLabel}</span>
              : formatAddress(tx.from)}
          </div>
        </div>
        <ArrowRight size={16} className="text-gray-600 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-right">
          <div className="text-xs text-gray-500 mb-0.5">TO</div>
          <div className="text-gray-200 font-mono text-xs truncate" title={tx.to}>
            {toLabel
              ? <span className="text-cyan-400 font-semibold">{toLabel}</span>
              : formatAddress(tx.to)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatTimeAgo(tx.timestamp)}</span>
        <div className="flex items-center gap-3">
          {tx.gasPrice && (
            <span className="text-gray-600">{tx.gasPrice.toFixed(1)} gwei</span>
          )}
          <span className="font-mono text-gray-600">{formatAddress(tx.hash, 6)}</span>
          <a
            href={`${etherscanBase}${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-gray-600 hover:text-cyan-400 transition-colors"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default memo(TransactionCard);
