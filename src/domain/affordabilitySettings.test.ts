import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AFFORDABILITY_SETTINGS,
  normalizeAffordabilitySettings,
  resolveContingencyBuffer,
} from './affordabilitySettings';

describe('affordability settings', () => {
  it('uses transparent safe defaults when setup has not been completed', () => {
    expect(normalizeAffordabilitySettings(undefined)).toEqual(DEFAULT_AFFORDABILITY_SETTINGS);
  });

  it('sanitizes malformed or unsafe persisted values', () => {
    expect(normalizeAffordabilitySettings({
      setupCompleted: 'yes',
      monthlySavingsTarget: -100,
      protectedCashReserve: Number.NaN,
      contingencyMode: 'something-else',
      fixedContingencyAmount: -5,
      historicalMonths: 200,
      safetyLevel: 'unknown',
    })).toEqual({
      version: 1,
      setupCompleted: false,
      monthlySavingsTarget: 0,
      protectedCashReserve: 0,
      contingencyMode: 'AUTO',
      fixedContingencyAmount: 0,
      historicalMonths: 24,
      safetyLevel: 'BALANCED',
    });
  });

  it('preserves valid user preferences and normalizes enum casing', () => {
    expect(normalizeAffordabilitySettings({
      setupCompleted: true,
      monthlySavingsTarget: 15000,
      protectedCashReserve: 30000,
      contingencyMode: 'fixed',
      fixedContingencyAmount: 8000,
      historicalMonths: 9.4,
      safetyLevel: 'conservative',
    })).toEqual({
      version: 1,
      setupCompleted: true,
      monthlySavingsTarget: 15000,
      protectedCashReserve: 30000,
      contingencyMode: 'FIXED',
      fixedContingencyAmount: 8000,
      historicalMonths: 9,
      safetyLevel: 'CONSERVATIVE',
    });
  });

  it('uses the exact fixed contingency and applies safety posture only to automatic estimates', () => {
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ contingencyMode: 'FIXED', fixedContingencyAmount: 7000 }), 10000)).toBe(7000);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'FLEXIBLE' }), 10000)).toBe(10000);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'BALANCED' }), 10000)).toBe(12500);
    expect(resolveContingencyBuffer(normalizeAffordabilitySettings({ safetyLevel: 'CONSERVATIVE' }), 10000)).toBe(15000);
  });
});
