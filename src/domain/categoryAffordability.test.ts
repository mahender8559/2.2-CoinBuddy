import { describe, expect, it } from 'vitest';
import { ensureCategoryAffordabilityClass, normalizeAffordabilityClass } from './categoryAffordability';


describe('category affordability classification', () => {
  it('preserves an explicit new affordability class', () => {
    expect(normalizeAffordabilityClass('IRREGULAR', 'Essential', 'expense')).toBe('IRREGULAR');
  });

  it('migrates legacy Savings, Leisure, and Essential groups without name guessing', () => {
    expect(normalizeAffordabilityClass(undefined, 'Savings', 'expense')).toBe('SAVINGS');
    expect(normalizeAffordabilityClass(undefined, 'Leisure', 'expense')).toBe('FLEXIBLE');
    expect(normalizeAffordabilityClass(undefined, 'Essential', 'expense')).toBe('NORMAL');
  });

  it('uses NORMAL as the neutral fallback for unclassified categories', () => {
    expect(normalizeAffordabilityClass(undefined, undefined, 'expense')).toBe('NORMAL');
    expect(normalizeAffordabilityClass(undefined, undefined, 'income')).toBe('NORMAL');
  });

  it('normalizes an in-memory category immediately', () => {
    const category = ensureCategoryAffordabilityClass({
      id: 'repairs', name: 'Repairs', icon: 'Heart', type: 'expense', affordabilityClass: 'IRREGULAR',
    });
    expect(category.affordabilityClass).toBe('IRREGULAR');
  });
});
