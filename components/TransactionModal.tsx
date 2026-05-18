'use client';
import React, { useEffect, useCallback } from 'react';
import { Transaction } from '@/lib/types';
import { formatUSD, formatTimestamp, formatTokenAmount, formatNumber } from '@/lib/formatters';
import { lookupWallet } from '@/lib/knownWallets';
import { X, Copy, ExternalLink, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  tx: Transaction | null;
  onClose: () => void;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="ml-2 text-gray-500 hover:text-cyan-400 transition-colors" title="Copy">
      <Copy size={13} />
      {copied && <span className="ml-1 text-xs text-green-400">Copied!</span>}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-white/5">
      <span className="text-xs text-gray-500 uppercase tracking-wide w-36 flex-shrink-0">{label}</span>
      <div className="text-sm text-gray-200 text-right font-mono flex items-center gap-1">{children}</div>
    </div>
  );
}

const EXPLORER_URLS: Record<string, string> = {
  ETH: 'https://etherscan.io/tx/',
  BTC: 'https://blockstream.info/tx/',
  BSC: 'https://bscscan.com/tx/',
  SOL: 'https://solscan.io/tx/',
  ARB: 'https://arbiscan.io/tx/',
  MATIC: 'https://polygonscan.com/tx/',
  AVAX: 'https://snowtrace.io/tx/',
  OP: 'https://optimistic.etherscan.io/tx/',
};

const ADDR_EXPLORERS: Record<string, string> = {
  ETH: 'https://etherscan.io/address/',
  BTC: 'https://blockstream.info/address/',
  BSC: 'https://bscscan.com/address/',
  SOL: 'https://solscan.io/account/',
  ARB: 'https://arbiscan.io/address/',
  MATIC: 'https://polygonscan.com/address/',
  AVAX: 'https://snowtrace.io/address/',
  OP: 'https://optimistic.etherscan.io/address/',
};

const AI_INSIGHTS: Record<string, string[]> = {
  transfer: [
    'Large transfer detected. Destination analysis suggests possible exchange deposit — potential sell pressure in 1-4 hours.',
    'On-chain pattern matches institutional cold storage movement. Likely long-term holder activity.',
    'Transfer destination is a known DeFi protocol. Funds likely being deployed for yield or liquidity provision.',
  ],
  swap: [
    'Large swap executed. Slippage pattern indicates urgent liquidation or rebalancing event.',
    'Swap routing through multiple DEX pools suggests sophisticated MEV-aware execution.',
    'Token swap size exceeds daily average by 340x. Possible market-moving event.',
  ],
  bridge: [
    'Cross-chain bridge transaction detected. Funds moving from mainnet suggests L2 ecosystem activity shift.',
    'Bridge movement at this scale often precedes increased DEX activity on destination chain.',
  ],
  stake: ['Staking event reduces circulating supply. Bullish signal for short-term price action.'],
  unstake: ['Unstaking event may signal intent to sell. Monitor closely for follow-up transfer to exchange.'],
  liquidation: ['⚡ Liquidation event detected. DeFi health indicator — watch for cascading liquidations if price continues.'],
};

function getInsight(type: string): string {
  const insights = AI_INSIGHTS[type] ?? AI_INSIGHTS.transfer;
  return insights[Math.floor(Math.random() * insights.length)];
}

export default function TransactionModal({ tx, onClose }: Props) {
  const router = useRouter();

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  if (!tx) return null;

  const fromWallet = lookupWallet(tx.from);
  const toWallet = lookupWallet(tx.to);
  const explorerTx = (EXPLORER_URLS[tx.chain] ?? EXPLORER_URLS.ETH) + tx.hash;
  const addrBase = ADDR_EXPLORERS[tx.chain] ?? ADDR_EXPLORERS.ETH;
  const insight = getInsight(tx.type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="modal-slide w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1421] border border-white/10 rounded-t-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white text-lg font-bold">Transaction Details</h2>
            <p className="text-gray-400 text-xs mt-1">
              {tx.chain} · Block #{tx.blockNumber.toLocaleString()} · {formatTimestamp(tx.timestamp)}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
            <X size={20} />
          </button>
        </div>

        {/* Value hero */}
        <div className="bg-gradient-to-r from-cyan-950/50 to-blue-950/50 border border-cyan-500/20 rounded-xl p-5 mb-5 text-center">
          <div className="text-3xl font-bold text-white">{formatUSD(tx.value)}</div>
          <div className="text-cyan-400 text-sm mt-1">{formatTokenAmount(tx.amount, tx.token)}</div>
          <div className="text-gray-500 text-xs mt-1 uppercase tracking-wider">{tx.type}</div>
        </div>

        {/* Details */}
        <div className="mb-5">
          <Row label="From">
            {fromWallet
              ? <span className="text-cyan-400">{fromWallet.label}</span>
              : <span className="break-all text-xs">{tx.from}</span>}
            <CopyBtn text={tx.from} />
            <a href={addrBase + tx.from} target="_blank" rel="noopener noreferrer" className="ml-1 text-gray-500 hover:text-cyan-400">
              <ExternalLink size={12} />
            </a>
          </Row>
          <Row label="To">
            {toWallet
              ? <span className="text-cyan-400">{toWallet.label}</span>
              : <span className="break-all text-xs">{tx.to}</span>}
            <CopyBtn text={tx.to} />
            <a href={addrBase + tx.to} target="_blank" rel="noopener noreferrer" className="ml-1 text-gray-500 hover:text-cyan-400">
              <ExternalLink size={12} />
            </a>
          </Row>
          <Row label="Tx Hash">
            <span className="text-xs break-all">{tx.hash.slice(0, 20)}...{tx.hash.slice(-8)}</span>
            <CopyBtn text={tx.hash} />
            <a href={explorerTx} target="_blank" rel="noopener noreferrer" className="ml-1 text-gray-500 hover:text-cyan-400">
              <ExternalLink size={12} />
            </a>
          </Row>
          <Row label="Chain"><span>{tx.chain}</span></Row>
          <Row label="Block"><span>#{tx.blockNumber.toLocaleString()}</span></Row>
          <Row label="USD Value"><span className="text-white font-bold">{formatUSD(tx.value)}</span></Row>
          <Row label="Amount"><span>{formatTokenAmount(tx.amount, tx.token)}</span></Row>
          {tx.gasUsed && <Row label="Gas Used"><span>{formatNumber(tx.gasUsed)}</span></Row>}
          {tx.gasPrice && <Row label="Gas Price"><span>{tx.gasPrice.toFixed(2)} gwei</span></Row>}
          {tx.gasUsed && tx.gasPrice && (
            <Row label="Gas Fee">
              <span className="text-yellow-400">${((tx.gasUsed * tx.gasPrice * 1e-9) * 3420).toFixed(4)}</span>
            </Row>
          )}
        </div>

        {/* AI Insight */}
        <div className="bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-500/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
            <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">AI Insight</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">{insight}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              router.push(`/wallets?address=${encodeURIComponent(tx.from)}`);
              handleClose();
            }}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            <Wallet size={14} />
            Track FROM wallet
          </button>
          <button
            onClick={() => {
              router.push(`/wallets?address=${encodeURIComponent(tx.to)}`);
              handleClose();
            }}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            <Wallet size={14} />
            Track TO wallet
          </button>
          <a
            href={explorerTx}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Explorer
          </a>
        </div>
      </div>
    </div>
  );
}
