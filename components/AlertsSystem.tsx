'use client';
import React from 'react';
import { useAlerts } from '@/contexts/AlertsContext';
import { formatTimeAgo } from '@/lib/formatters';
import { X, ExternalLink } from 'lucide-react';

const COLORS: Record<string, string> = {
  mega_whale: 'border-red-500 bg-red-950/80',
  whale:      'border-cyan-500 bg-cyan-950/80',
  exchange:   'border-yellow-500 bg-yellow-950/80',
  info:       'border-gray-500 bg-gray-900/80',
};

export default function AlertsSystem() {
  const { visibleAlerts, dismiss, selectTx } = useAlerts();

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80">
      {visibleAlerts.map(alert => (
        <div
          key={alert.id}
          className={`relative rounded-lg border backdrop-blur-md shadow-2xl animate-slide-in overflow-hidden ${COLORS[alert.type] ?? COLORS.info} ${alert.transaction ? 'cursor-pointer' : ''}`}
          onClick={() => {
            if (alert.transaction) {
              selectTx(alert.transaction);
              dismiss(alert.id);
            }
          }}
        >
          {/* Dismiss button */}
          <button
            onClick={e => { e.stopPropagation(); dismiss(alert.id); }}
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors z-10"
          >
            <X size={14} />
          </button>

          <div className="p-4">
            <p className="text-white text-sm font-semibold pr-5 leading-snug">{alert.message}</p>
            <p className="text-gray-300 text-xs mt-1">{alert.detail}</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-gray-500 text-xs">{formatTimeAgo(alert.timestamp)}</p>
              {alert.transaction && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-400/70 font-medium">
                  <ExternalLink size={9} />
                  Click to view
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 animate-shrink rounded-b-lg w-full" />
        </div>
      ))}
    </div>
  );
}
