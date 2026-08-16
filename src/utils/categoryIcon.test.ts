import { describe, expect, it } from 'vitest';
import type { IconName } from '../icons';
import { selectCategoryIcon } from './categoryIcon';

describe('selectCategoryIcon', () => {
  it('selects a relevant icon from the category name and type', () => {
    expect(selectCategoryIcon({ name: 'Food & Dining', type: 'expense', categories: [] })).toBe('Utensils');
    expect(selectCategoryIcon({ name: 'Monthly Salary', type: 'income', categories: [] })).toBe('Banknote');
    expect(selectCategoryIcon({ name: 'Petrol and Fuel', type: 'expense', categories: [] })).toBe('Car');
    expect(selectCategoryIcon({ name: 'Home Rent', type: 'expense', categories: [] })).toBe('Home');
  });

  it('uses another relevant icon when the first choice is already used', () => {
    const icon = selectCategoryIcon({
      name: 'Restaurant meals',
      type: 'expense',
      categories: [{ id: 'food-existing', icon: 'Utensils' }],
    });
    expect(icon).toBe('Coffee');
  });

  it('does not duplicate a used icon when another library icon is available', () => {
    const used: IconName[] = [
      'Utensils', 'Coffee', 'Tag', 'ShoppingBag', 'CreditCard', 'Home', 'Car', 'Activity', 'Bell', 'Banknote',
    ];
    const categories = used.map((icon, index) => ({ id: String(index), icon }));
    const icon = selectCategoryIcon({ name: 'Food & Dining', type: 'expense', categories });
    expect(used).not.toContain(icon);
  });

  it('keeps a relevant existing icon stable while editing when no other category uses it', () => {
    const icon = selectCategoryIcon({
      name: 'Travel',
      type: 'expense',
      categories: [
        { id: 'travel', icon: 'Map' },
        { id: 'other', icon: 'Plane' },
      ],
      editingId: 'travel',
      preferredIcon: 'Map',
    });
    expect(icon).toBe('Map');
  });

  it('uses income-aware fallbacks for unknown names', () => {
    expect(selectCategoryIcon({ name: 'Something new', type: 'income', categories: [] })).toBe('Banknote');
    expect(selectCategoryIcon({ name: 'Something new', type: 'expense', categories: [] })).toBe('Tag');
  });
});
