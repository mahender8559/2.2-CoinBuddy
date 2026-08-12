import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { AffordabilitySettings as AffordabilitySettingsType } from '../types';
import { useAppContext } from '../context/AppContext';
import { normalizeAffordabilitySettings } from '../domain/affordabilitySettings';
import { CurrencyInput } from './CurrencyInput';

interface Props {
  onClose: () => void;
}

export function AffordabilitySettings({ onClose }: Props) {
  const { affordabilitySettings, setAffordabilitySettings, formatCurrency, showToast } = useAppContext();
  const [draft, setDraft] = useState<AffordabilitySettingsType>(() => ({ ...affordabilitySettings }));

  useEffect(() => setDraft({ ...affordabilitySettings }), [affordabilitySettings]);

  const update = <K extends keyof AffordabilitySettingsType>(key: K, value: AffordabilitySettingsType[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const save = () => {
    const normalized = normalizeAffordabilitySettings({ ...draft, setupCompleted: true });
    setAffordabilitySettings(normalized);
    showToast('Affordability safety preferences saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="affordability-settings-title">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Safety preferences</span></div>
            <h3 id="affordability-settings-title" className="mt-2 text-xl font-bold text-on-surface">Protect what matters before spending</h3>
            <p className="mt-1 text-sm text-on-surface-variant">These are planning rules only. CoinBuddy does not move money or create transactions when you change them.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high" aria-label="Close safety preferences"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Monthly savings target</span>
            <span className="block text-xs text-on-surface-variant mt-1">Money you want the planner to protect for savings each financial cycle.</span>
            <CurrencyInput value={draft.monthlySavingsTarget || ''} onValueChange={value => update('monthlySavingsTarget', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Protected cash reserve</span>
            <span className="block text-xs text-on-surface-variant mt-1">A liquid-cash floor CoinBuddy should never call safe to spend. It is not a separate emergency-fund account.</span>
            <CurrencyInput value={draft.protectedCashReserve || ''} onValueChange={value => update('protectedCashReserve', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-on-surface">Unexpected-spending buffer</legend>
            <p className="text-xs text-on-surface-variant mt-1">Use historical irregular spending when available, or protect a fixed amount.</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['AUTO', 'FIXED'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => update('contingencyMode', mode)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${draft.contingencyMode === mode ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface'}`}>
                  {mode === 'AUTO' ? 'Estimate automatically' : 'Use fixed amount'}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.contingencyMode === 'FIXED' && (
            <label className="block">
              <span className="text-sm font-semibold text-on-surface">Fixed contingency amount</span>
              <CurrencyInput value={draft.fixedContingencyAmount || ''} onValueChange={value => update('fixedContingencyAmount', Math.max(0, Number(value) || 0))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-numeric focus:outline-none focus:border-primary/60" placeholder="0.00" />
            </label>
          )}

          {draft.contingencyMode === 'AUTO' && (
            <label className="block">
              <span className="text-sm font-semibold text-on-surface">History window</span>
              <select value={draft.historicalMonths} onChange={event => update('historicalMonths', Number(event.target.value))} className="mt-2 w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary/60">
                <option value={3}>Last 3 completed cycles</option>
                <option value={6}>Last 6 completed cycles</option>
                <option value={12}>Last 12 completed cycles</option>
                <option value={18}>Last 18 completed cycles</option>
                <option value={24}>Last 24 completed cycles</option>
              </select>
            </label>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-on-surface">Safety posture</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {([
                ['FLEXIBLE', 'Flexible', 'Use the historical estimate as-is.'],
                ['BALANCED', 'Balanced', 'Add a moderate safety margin.'],
                ['CONSERVATIVE', 'Conservative', 'Protect a larger safety margin.'],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" onClick={() => update('safetyLevel', value)} className={`rounded-xl border p-3 text-left transition ${draft.safetyLevel === value ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'}`}>
                  <span className="block text-sm font-bold text-on-surface">{label}</span>
                  <span className="block mt-1 text-xs text-on-surface-variant">{description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4 text-xs text-on-surface-variant">
            Current protection: {formatCurrency(draft.monthlySavingsTarget)} savings target + {formatCurrency(draft.protectedCashReserve)} cash reserve{draft.contingencyMode === 'FIXED' ? ` + ${formatCurrency(draft.fixedContingencyAmount)} fixed contingency` : ' + automatic contingency when enough history exists'}.
          </div>

          <button type="button" onClick={save} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Save safety preferences</button>
        </div>
      </div>
    </div>
  );
}
