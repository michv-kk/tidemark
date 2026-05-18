'use client';
import React, { useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { AppSettings } from '@/lib/types';
import { Save, Check, Key, Bell, RefreshCw, DollarSign, Filter, Moon } from 'lucide-react';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d1421] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        {icon}
        <h2 className="text-white font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function OptionGroup<T extends string | number>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T; desc?: string }[];
}) {
  return (
    <div>
      <div className="text-sm text-gray-300 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 rounded-lg text-sm border transition-all ${
              value === opt.value
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                : 'bg-white/3 text-gray-400 border-white/5 hover:border-white/15 hover:text-white'
            }`}
          >
            {opt.label}
            {opt.desc && <div className="text-xs opacity-60 mt-0.5">{opt.desc}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-300">{label}</div>
        {desc && <div className="text-xs text-gray-500 mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-cyan-500' : 'bg-white/10'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState(settings.etherscanApiKey ?? '');

  const handleSave = () => {
    update({ etherscanApiKey: apiKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Customize your TIDEMARK experience</p>
      </div>

      <div className="space-y-4">
        {/* Currency */}
        <Section icon={<DollarSign size={16} className="text-cyan-400" />} title="Display Currency">
          <OptionGroup
            label="All prices will be converted to your selected currency"
            value={settings.currency}
            onChange={v => update({ currency: v as AppSettings['currency'] })}
            options={[
              { label: '$ USD', value: 'USD' as const },
              { label: '€ EUR', value: 'EUR' as const },
              { label: '£ GBP', value: 'GBP' as const },
              { label: 'zł PLN', value: 'PLN' as const },
            ]}
          />
        </Section>

        {/* Whale filter */}
        <Section icon={<Filter size={16} className="text-yellow-400" />} title="Minimum Whale Size">
          <OptionGroup
            label="Only show transactions above this value"
            value={settings.minWhaleSize}
            onChange={v => update({ minWhaleSize: v as AppSettings['minWhaleSize'] })}
            options={[
              { label: '$100K', value: 100_000 as const, desc: 'Small whale' },
              { label: '$500K', value: 500_000 as const, desc: 'Medium whale' },
              { label: '$1M', value: 1_000_000 as const, desc: 'Large whale' },
              { label: '$10M', value: 10_000_000 as const, desc: 'Mega whale' },
            ]}
          />
        </Section>

        {/* Alerts */}
        <Section icon={<Bell size={16} className="text-orange-400" />} title="Alerts">
          <Toggle
            label="Sound Alerts"
            desc="Play a subtle ping sound when a whale transaction is detected"
            value={settings.soundAlerts}
            onChange={v => update({ soundAlerts: v })}
          />
        </Section>

        {/* Auto-refresh */}
        <Section icon={<RefreshCw size={16} className="text-green-400" />} title="Auto Refresh">
          <OptionGroup
            label="How often the live feed fetches new data"
            value={settings.autoRefresh}
            onChange={v => update({ autoRefresh: v as AppSettings['autoRefresh'] })}
            options={[
              { label: '10s', value: 10 as const, desc: 'Fast' },
              { label: '30s', value: 30 as const, desc: 'Default' },
              { label: '60s', value: 60 as const, desc: 'Slow' },
            ]}
          />
        </Section>

        {/* Theme */}
        <Section icon={<Moon size={16} className="text-purple-400" />} title="Theme">
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg text-sm border bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
              🌙 Dark (Active)
            </button>
            <button className="px-3 py-2 rounded-lg text-sm border bg-white/3 text-gray-600 border-white/5 cursor-not-allowed" disabled>
              ☀️ Light (Coming soon)
            </button>
          </div>
        </Section>

        {/* API Key */}
        <Section icon={<Key size={16} className="text-red-400" />} title="Etherscan API Key">
          <div>
            <div className="text-sm text-gray-300 mb-2">
              Required for full wallet transaction history. Get a free key at{' '}
              <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                etherscan.io
              </a>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter your Etherscan API key..."
              className="w-full bg-white/3 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors font-mono"
            />
            <div className="text-xs text-gray-600 mt-1.5">
              Free tier: 5 requests/second, 100k requests/day. Never shared or stored remotely.
            </div>
          </div>
        </Section>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2 px-6">
            {saved ? <><Check size={16} /> Saved!</> : <><Save size={16} /> Save Settings</>}
          </button>
        </div>
      </div>
    </div>
  );
}
