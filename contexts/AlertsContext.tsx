'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertNotification, Transaction } from '@/lib/types';
import { lookupWallet } from '@/lib/knownWallets';
import { formatUSD } from '@/lib/formatters';

interface AlertsCtx {
  alerts: AlertNotification[];
  visibleAlerts: AlertNotification[];
  unreadCount: number;
  addTransactionAlert: (tx: Transaction) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<AlertsCtx>({
  alerts: [], visibleAlerts: [], unreadCount: 0,
  addTransactionAlert: () => {}, markAllRead: () => {}, dismiss: () => {},
});

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [visibleAlerts, setVisibleAlerts] = useState<AlertNotification[]>([]);
  const timeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setVisibleAlerts(prev => prev.filter(a => a.id !== id));
    const t = timeouts.current.get(id);
    if (t) { clearTimeout(t); timeouts.current.delete(id); }
  }, []);

  const addTransactionAlert = useCallback((tx: Transaction) => {
    let type: AlertNotification['type'];
    let message: string;
    let detail: string;

    const fromLabel = lookupWallet(tx.from)?.label;
    const toLabel = lookupWallet(tx.to)?.label;
    const valueStr = formatUSD(tx.value, true);

    if (tx.value >= 10_000_000) {
      type = 'mega_whale';
      message = `🚨 MEGA WHALE: ${valueStr} ${tx.token} transferred`;
      detail = `${fromLabel ?? tx.from.slice(0, 8)}... → ${toLabel ?? tx.to.slice(0, 8)}...`;
    } else if (fromLabel?.includes('Binance') || toLabel?.includes('Binance') || fromLabel?.includes('Coinbase') || toLabel?.includes('Coinbase')) {
      type = 'exchange';
      const exchName = (fromLabel ?? toLabel) ?? 'Exchange';
      message = `📊 ${exchName}: ${valueStr} ${tx.token} ${fromLabel ? 'outflow' : 'inflow'}`;
      detail = `${tx.chain} chain | Block #${tx.blockNumber.toLocaleString()}`;
    } else {
      type = 'whale';
      message = `🐋 Whale Alert: ${valueStr} ${tx.token} moved`;
      detail = `${tx.chain} | ${fromLabel ?? tx.from.slice(0, 8)}... → ${toLabel ?? tx.to.slice(0, 8)}...`;
    }

    const notification: AlertNotification = {
      id: `alert-${Date.now()}-${Math.random()}`,
      type, message, detail,
      timestamp: tx.timestamp,
      transaction: tx,
      read: false,
    };

    setAlerts(prev => [notification, ...prev].slice(0, 50));
    setVisibleAlerts(prev => {
      const next = [notification, ...prev].slice(0, 3);
      return next;
    });

    const t = setTimeout(() => dismiss(notification.id), 8000);
    timeouts.current.set(notification.id, t);
  }, [dismiss]);

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <Ctx.Provider value={{ alerts, visibleAlerts, unreadCount, addTransactionAlert, markAllRead, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAlerts() {
  return useContext(Ctx);
}
