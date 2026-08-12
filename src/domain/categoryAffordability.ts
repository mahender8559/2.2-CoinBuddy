import type { AffordabilityClass, Category } from '../types';

export const AFFORDABILITY_CLASSES: readonly AffordabilityClass[] = [
  'COMMITTED',
  'NORMAL',
  'FLEXIBLE',
  'IRREGULAR',
  'SAVINGS',
] as const;

const CLASS_SET = new Set<string>(AFFORDABILITY_CLASSES);

/**
 * Converts persisted/legacy category metadata into the planning classification.
 * We intentionally do not guess from category names. The old three-way grouping
 * is used only as a safe migration hint and can be removed after legacy UI is
 * retired.
 */
export function normalizeAffordabilityClass(
  value?: string | null,
  legacyGroup?: string | null,
  categoryType?: string | null,
): AffordabilityClass {
  const explicit = String(value ?? '').trim().toUpperCase();
  if (CLASS_SET.has(explicit)) return explicit as AffordabilityClass;

  const legacy = String(legacyGroup ?? '').trim().toLowerCase();
  if (legacy === 'savings') return 'SAVINGS';
  if (legacy === 'leisure') return 'FLEXIBLE';
  if (legacy === 'essential') return 'NORMAL';

  // Income categories do not consume an expense class in the affordability
  // engine. NORMAL is the neutral persisted fallback for them.
  if (String(categoryType ?? '').trim().toLowerCase() === 'income') return 'NORMAL';
  return 'NORMAL';
}

export function ensureCategoryAffordabilityClass<T extends Category>(category: T): T {
  return {
    ...category,
    affordabilityClass: normalizeAffordabilityClass(
      category.affordabilityClass,
      category.group,
      category.type,
    ),
  };
}
