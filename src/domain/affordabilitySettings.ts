import type { AffordabilitySafetyLevel, AffordabilitySettings } from '../types';

export const AFFORDABILITY_SETTINGS_KEY = 'affordabilitySettings';

export const DEFAULT_AFFORDABILITY_SETTINGS: AffordabilitySettings = {
  version: 1,
  setupCompleted: false,
  monthlySavingsTarget: 0,
  protectedCashReserve: 0,
  contingencyMode: 'AUTO',
  fixedContingencyAmount: 0,
  historicalMonths: 6,
  safetyLevel: 'BALANCED',
};

export const AFFORDABILITY_SAFETY_MULTIPLIERS: Record<AffordabilitySafetyLevel, number> = {
  FLEXIBLE: 1,
  BALANCED: 1.25,
  CONSERVATIVE: 1.5,
};

function nonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeHistoricalMonths(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AFFORDABILITY_SETTINGS.historicalMonths;
  return Math.min(24, Math.max(1, Math.round(parsed)));
}

export function normalizeAffordabilitySettings(value: unknown): AffordabilitySettings {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<AffordabilitySettings>
    : {};
  const contingencyMode = String(input.contingencyMode ?? '').toUpperCase() === 'FIXED' ? 'FIXED' : 'AUTO';
  const rawSafety = String(input.safetyLevel ?? '').toUpperCase();
  const safetyLevel: AffordabilitySafetyLevel = rawSafety === 'FLEXIBLE' || rawSafety === 'CONSERVATIVE'
    ? rawSafety
    : 'BALANCED';

  return {
    version: 1,
    setupCompleted: input.setupCompleted === true,
    monthlySavingsTarget: nonNegative(input.monthlySavingsTarget),
    protectedCashReserve: nonNegative(input.protectedCashReserve),
    contingencyMode,
    fixedContingencyAmount: nonNegative(input.fixedContingencyAmount),
    historicalMonths: normalizeHistoricalMonths(input.historicalMonths),
    safetyLevel,
  };
}

/** Resolves the amount that Phase 2 should reserve for uncertainty.
 * Fixed mode respects the user's exact amount. Automatic mode applies the
 * selected safety posture to the historical estimate produced in Phase 5. */
export function resolveContingencyBuffer(settings: AffordabilitySettings, automaticEstimate: number): number {
  const normalized = normalizeAffordabilitySettings(settings);
  if (normalized.contingencyMode === 'FIXED') return normalized.fixedContingencyAmount;
  const estimate = nonNegative(automaticEstimate);
  return estimate * AFFORDABILITY_SAFETY_MULTIPLIERS[normalized.safetyLevel];
}
