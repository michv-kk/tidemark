'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { lookupWallet } from '@/lib/knownWallets';
import { formatTimestamp, formatAddress } from '@/lib/formatters';
import { Search, Copy, ExternalLink, Zap, TrendingUp, Clock, Activity } from 'lucide-react';
import { useSettings, useCurrency } from '@/contexts/SettingsContext';

interface EtherTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
}

interface WalletData {
  address: string;
  ethBalance?: number;
  transactions: EtherTx[];
  firstTx?: EtherTx;
  error?: string;
}

async function fetchWalletData(address: string, apiKey: string): Promise<WalletData> {
  // Use V2 API (V1 is deprecated). Fall back to env key if settings key is empty.
  const key = apiKey || process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || '';
  const base = 'https://api.etherscan.io/v2/api';
  const keyParam = key ? `&apikey=${key}` : '';
  const chainParam = '&chainid=1';

  try {
    const [balRes, txRes] = await Promise.allSettled([
      fetch(`${base}?module=account&action=balance&address=${address}&tag=latest${chainParam}${keyParam}`),
      fetch(`${base}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc${chainParam}${keyParam}`),
    ]);

    let ethBalance: number | undefined;
    let transactions: EtherTx[] = [];

    if (balRes.status === 'fulfilled' && balRes.value.ok) {
      const balData = await balRes.value.json();
      if (balData.status === '1') ethBalance = parseInt(balData.result) / 1e18;
    }

    if (txRes.status === 'fulfilled' && txRes.value.ok) {
      const txData = await txRes.value.json();
      if (txData.status === '1') transactions = txData.result;
    }

    return { address, ethBalance, transactions, firstTx: transactions[transactions.length - 1] };
  } catch {
    return { address, transactions: [], error: 'Failed to fetch wallet data' };
  }
}

async function fetchEthPrice(): Promise<number> {
  try {
    const res = await fetch('/api/coingecko?path=/simple/price&ids=ethereum&vs_currencies=usd');
    if (!res.ok) return 2100;
    const data = await res.json();
    return data?.ethereum?.usd ?? 2100;
  } catch {
    return 2100;
  }
}

function calcWhaleScore(txs: EtherTx[], ethPrice: number): number {
  if (txs.length === 0) return 0;
  const total = txs.reduce((s, t) => s + parseInt(t.value) / 1e18 * ethPrice, 0);
  const avg = total / txs.length;
  const freq = txs.length;
  const scoreVolume = Math.min(40, Math.log10(total + 1) * 8);
  const scoreFreq = Math.min(30, Math.log2(freq + 1) * 5);
  const scoreAvg = Math.min(30, Math.log10(avg + 1) * 8);
  return Math.round(scoreVolume + scoreFreq + scoreAvg);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-gray-500 hover:text-cyan-400 transition-colors"
    >
      {copied ? <span className="text-xs text-green-400">Copied!</span> : <Copy size={13} />}
    </button>
  );
}

interface AnalyzerProps { initialAddress?: string }

export default function WalletAnalyzer({ initialAddress = '' }: AnalyzerProps) {
  const { settings } = useSettings();
  const fmt = useCurrency();
  const [address, setAddress] = useState(initialAddress);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ethPrice, setEthPrice] = useState(2100);

  // Load live ETH price once on mount
  useEffect(() => {
    fetchEthPrice().then(setEthPrice);
  }, []);

  useEffect(() => {
    if (initialAddress) analyze(initialAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAddress]);

  const analyze = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    setLoading(true);
    const result = await fetchWalletData(addr.trim(), settings.etherscanApiKey);
    setData(result);
    setLoading(false);
  }, [settings.etherscanApiKey]);

  const known = data ? lookupWallet(data.address) : null;
  const whaleScore = data ? calcWhaleScore(data.transactions, ethPrice) : 0;
  const totalVolume = data ? data.transactions.reduce((s, t) => s + parseInt(t.value) / 1e18 * ethPrice, 0) : 0;

  const scoreColor = whaleScore >= 70 ? 'text-red-400' : whaleScore >= 40 ? 'text-yellow-400' : 'text-green-400';
  const scoreRing = whaleScore >= 70 ? 'border-red-500' : whaleScore >= 40 ? 'border-yellow-500' : 'border-green-500';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 flex items-center gap-3 bg-[#0d1421] border border-white/10 rounded-xl px-4 py-3 focus-within:border-cyan-500/50 transition-colors">
          <Search size={16} className="text-gray-500 flex-shrink-0" />
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze(address)}
            placeholder="Enter ETH / BTC / SOL wallet address..."
            className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm outline-none font-mono"
          />
          {address && <CopyButton text={address} />}
        </div>
        <button onClick={() => analyze(address)} disabled={loading} className="btn-primary px-6">
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Analyze'}
        </button>
      </div>

      {/* Quick search known wallets */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-600">Quick:</span>
        {[
          '0x28C6c06298d514Db089934071355E5743bf21d60',
          '0x503828976D22510aad0201ac7EC88293211D23Da',
          '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2',
        ].map(addr => {
          const w = lookupWallet(addr);
          return (
            <button
              key={addr}
              onClick={() => { setAddress(addr); analyze(addr); }}
              className="text-xs text-cyan-400/70 hover:text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/40 px-2 py-1 rounded transition-colors"
            >
              {w?.label ?? formatAddress(addr)}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Scanning blockchain...</p>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Wallet header */}
          <div className="bg-[#0d1421] border border-white/5 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
              <div>
                {known ? (
                  <div>
                    <h2 className="text-xl font-bold text-white">{known.label}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize border ${
                        known.type === 'exchange' ? 'bg-blue-900/40 text-blue-300 border-blue-500/30' :
                        known.type === 'fund' ? 'bg-purple-900/40 text-purple-300 border-purple-500/30' :
                        'bg-gray-900/40 text-gray-300 border-gray-500/30'
                      }`}>{known.type}</span>
                      {known.exchange && <span className="text-xs text-gray-400">{known.exchange}</span>}
                    </div>
                  </div>
                ) : (
                  <h2 className="text-lg font-mono text-gray-300">{formatAddress(data.address, 10)}</h2>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 font-mono">
                  <span>{data.address}</span>
                  <CopyButton text={data.address} />
                  <a href={`https://etherscan.io/address/${data.address}`} target="_blank" rel="noopener noreferrer"
                     className="hover:text-cyan-400 transition-colors">
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Whale score */}
              <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 ${scoreRing}`}>
                <span className={`text-2xl font-black ${scoreColor}`}>{whaleScore}</span>
                <span className="text-gray-500 text-xs">WHALE</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { icon: <TrendingUp size={14} className="text-cyan-400" />, label: 'Total Volume', value: fmt(totalVolume, true) },
                { icon: <Activity size={14} className="text-green-400" />, label: 'Transactions', value: data.transactions.length.toString() },
                { icon: <Zap size={14} className="text-yellow-400" />, label: 'ETH Balance', value: data.ethBalance != null ? `${data.ethBalance.toFixed(4)} ETH` : 'N/A' },
                { icon: <Clock size={14} className="text-purple-400" />, label: 'First TX', value: data.firstTx ? formatTimestamp(parseInt(data.firstTx.timeStamp) * 1000).split(',')[0] : 'N/A' },
              ].map((s, i) => (
                <div key={i} className="bg-white/3 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
                  <div className="text-white font-bold text-sm">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Transactions */}
          {data.transactions.length > 0 ? (
            <div className="bg-[#0d1421] border border-white/5 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h3 className="text-white font-semibold text-sm">Recent Transactions</h3>
              </div>
              <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                {data.transactions.slice(0, 25).map(tx => {
                  const ethVal = parseInt(tx.value) / 1e18;
                  const usdVal = ethVal * ethPrice;
                  const isOut = tx.from.toLowerCase() === data.address.toLowerCase();
                  return (
                    <div key={tx.hash} className="px-4 py-3 hover:bg-white/3 transition-colors flex items-center gap-4 text-sm">
                      <span className={`text-xs w-8 font-bold ${isOut ? 'text-red-400' : 'text-green-400'}`}>
                        {isOut ? 'OUT' : 'IN'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-300 font-mono text-xs truncate">{formatAddress(isOut ? tx.to : tx.from, 8)}</div>
                        <div className="text-gray-600 text-xs">{formatTimestamp(parseInt(tx.timeStamp) * 1000)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-mono text-xs">{ethVal.toFixed(4)} ETH</div>
                        <div className="text-gray-500 text-xs">{fmt(usdVal, true)}</div>
                      </div>
                      <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                         className="text-gray-600 hover:text-cyan-400 transition-colors flex-shrink-0">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-[#0d1421] border border-white/5 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">
                {data.error ?? 'No transaction history found. Add an Etherscan API key in Settings for full data access.'}
              </p>
              {!settings.etherscanApiKey && (
                <a href="/settings" className="mt-3 inline-block text-cyan-400 text-xs hover:underline">
                  → Add API key in Settings
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
