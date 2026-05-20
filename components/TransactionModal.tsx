'use client';
import React, { useEffect, useCallback, useState } from 'react';
import { Transaction } from '@/lib/types';
import { formatUSD, formatTimestamp, formatTokenAmount, formatNumber } from '@/lib/formatters';
import { lookupWallet } from '@/lib/knownWallets';
import { X, Copy, ExternalLink, Wallet, Loader2 } from 'lucide-react';
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
  BTC: 'https://mempool.space/tx/',
  BSC: 'https://bscscan.com/tx/',
  SOL: 'https://solscan.io/tx/',
  ARB: 'https://arbiscan.io/tx/',
  MATIC: 'https://polygonscan.com/tx/',
  AVAX: 'https://snowtrace.io/tx/',
  OP: 'https://optimistic.etherscan.io/tx/',
};

const ADDR_EXPLORERS: Record<string, string> = {
  ETH: 'https://etherscan.io/address/',
  BTC: 'https://mempool.space/address/',
  BSC: 'https://bscscan.com/address/',
  SOL: 'https://solscan.io/account/',
  ARB: 'https://arbiscan.io/address/',
  MATIC: 'https://polygonscan.com/address/',
  AVAX: 'https://snowtrace.io/address/',
  OP: 'https://optimistic.etherscan.io/address/',
};

const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Huobi', 'Bitfinex'];

function getQuickAnalysis(tx: Transaction, fromLabel?: string, toLabel?: string): string {
  const token = tx.token?.toUpperCase() ?? '';
  const from = fromLabel ?? '';
  const to = toLabel ?? '';

  // Stablecoins
  if (token === 'USDC' || token === 'USDT' || token === 'DAI' || token === 'BUSD') {
    return 'Stablecoin transfer — likely exchange deposit/withdrawal or OTC settlement';
  }

  // Wrapped BTC
  if (token === 'WBTC') {
    return 'Wrapped Bitcoin transfer — BTC equivalent moving on Ethereum';
  }

  // Native ETH
  if (token === 'ETH') {
    return 'Native ETH transfer';
  }

  // Exchange outflow
  const outExchange = EXCHANGES.find(e => from.includes(e));
  if (outExchange) {
    return `Exchange outflow — withdrawal from ${outExchange}`;
  }

  // Exchange inflow
  const inExchange = EXCHANGES.find(e => to.includes(e));
  if (inExchange) {
    return `Exchange inflow — deposit to ${inExchange}`;
  }

  // Mega whale
  if (tx.value >= 10_000_000) {
    return 'Mega whale move — top 0.01% transaction size';
  }

  // Whale tier
  if (tx.value >= 1_000_000) {
    return 'Whale-tier transaction — institutional or large holder activity';
  }

  return `${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} transaction on ${tx.chain}`;
}

function useEthPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [estimated, setEstimated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        // Use proxy to avoid CORS blocks
        const res = await fetch(
          '/api/coingecko?path=%2Fsimple%2Fprice&ids=ethereum&vs_currencies=usd',
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        const p = data?.ethereum?.usd;
        if (!cancelled && typeof p === 'number') {
          setPrice(p);
          setEstimated(false);
        }
      } catch {
        if (!cancelled) {
          // Fallback to a conservative estimate and flag it
          setPrice(3400);
          setEstimated(true);
        }
      }
    }
    fetchPrice();
    return () => { cancelled = true; };
  }, []);

  return { price, estimated };
}

export default function TransactionModal({ tx, onClose }: Props) {
  const router = useRouter();
  const { price: ethPrice, estimated: ethPriceEstimated } = useEthPrice();

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  if (!tx) return null;

  const fromWallet = lookupWallet(tx.from);
  const toWallet = lookupWallet(tx.to);

  // DexScreener entries use pair addresses as hash — link to DexScreener instead of block explorer
  const explorerTx = tx.source === 'dexscreener'
    ? `https://dexscreener.com/ethereum/${tx.hash}`
    : (EXPLORER_URLS[tx.chain] ?? EXPLORER_URLS.ETH) + tx.hash;

  const addrBase = ADDR_EXPLORERS[tx.chain] ?? ADDR_EXPLORERS.ETH;

  const quickAnalysis = getQuickAnalysis(tx, fromWallet?.label, toWallet?.label);

  const gasFeeUSD = tx.gasUsed && tx.gasPrice && ethPrice != null
    ? (tx.gasUsed * tx.gasPrice * 1e-9) * ethPrice
    : null;

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
              {gasFeeUSD != null ? (
                <span className="text-yellow-400">
                  {ethPriceEstimated ? '~' : ''}${gasFeeUSD.toFixed(4)}
                  {ethPriceEstimated && <span className="text-gray-500 text-xs ml-1">(est.)</span>}
                </span>
              ) : (
                <span className="text-gray-500 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> calculating...
                </span>
              )}
            </Row>
          )}
        </div>

        {/* Quick Analysis */}
        <div className="bg-gradient-to-r from-slate-950/60 to-gray-950/60 border border-white/10 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full" />
            <span className="text-cyan-300 text-xs font-semibold uppercase tracking-wide">Quick Analysis</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{quickAnalysis}</p>
          <a
            href={explorerTx}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/20 rounded-lg px-2.5 py-1.5 bg-cyan-500/5 hover:bg-cyan-500/10"
          >
            <ExternalLink size={11} />
            {tx.source === 'dexscreener' ? 'View on DexScreener'
              : tx.chain === 'BTC' ? 'View on Mempool.space'
              : tx.chain === 'SOL' ? 'View on Solscan'
              : tx.chain === 'BASE' ? 'View on Basescan'
              : tx.chain === 'ARB' ? 'View on Arbiscan'
              : 'View on Etherscan'}
          </a>
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
