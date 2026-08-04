import type { Category } from '../types';

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'housing', name: 'Housing', icon: 'Home', budget: 0, tags: ['#rent', '#utilities'], group: 'Essential', type: 'expense' },
  { id: 'food-dining', name: 'Food & Dining', icon: 'Utensils', budget: 0, tags: ['#groceries', '#eatout'], group: 'Essential', type: 'expense' },
  { id: 'transportation', name: 'Transportation', icon: 'Car', budget: 0, tags: ['#fuel', '#maintenance'], group: 'Essential', type: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: 'Briefcase', budget: 0, tags: ['#streaming', '#events'], group: 'Leisure', type: 'expense' },
  { id: 'health', name: 'Health', icon: 'Zap', budget: 0, tags: ['#gym', '#medical'], group: 'Savings', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'ShoppingBag', budget: 0, tags: ['#clothing'], group: 'Leisure', type: 'expense' },
  { id: 'salary', name: 'Salary', icon: 'Banknote', tags: ['#paycheck', '#salary'], group: 'Essential', type: 'income' },
  { id: 'other-income', name: 'Other Income', icon: 'Gift', tags: ['#bonus', '#freelance'], group: 'Essential', type: 'income' },
];

export function createDefaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map(category => ({ ...category, tags: category.tags ? [...category.tags] : undefined }));
}
