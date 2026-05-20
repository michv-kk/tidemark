'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/types';
import { formatCurrency } from '@/lib/formatters';

interface SettingsCtx {
  settings: AppSettings;
  update: (partial: Partial<AppSettings>) => void;
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, update: () => {} });

const KEY = 'tidemark_settings';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}

/** Returns a currency-aware formatter that respects the user's selected currency. */
export function useCurrency() {
  const { settings } = useContext(Ctx);
  return useCallback(
    (value: number, compact = false) => formatCurrency(value, settings.currency, compact),
    [settings.currency]
  );
}
