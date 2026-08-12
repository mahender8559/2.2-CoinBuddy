import { X } from 'lucide-react';
import type { AffordabilityClass, Category } from '../types';
import { useAppContext } from '../context/AppContext';
import { normalizeAffordabilityClass } from '../domain/categoryAffordability';

interface Props { onClose: () => void; }

const OPTIONS: Array<{ value: AffordabilityClass; label: string; description: string }> = [
  { value: 'COMMITTED', label: 'Committed', description: 'Known obligations such as rent, insurance or subscriptions.' },
  { value: 'NORMAL', label: 'Normal spending', description: 'Regular day-to-day spending such as groceries, fuel or utilities.' },
  { value: 'FLEXIBLE', label: 'Flexible', description: 'Spending that can usually be reduced, such as dining or shopping.' },
  { value: 'IRREGULAR', label: 'Irregular', description: 'Unpredictable costs such as medical bills, repairs or urgent travel.' },
  { value: 'SAVINGS', label: 'Savings', description: 'Money intentionally set aside or invested toward a goal.' },
];

export function CategoryAffordabilityReview({ onClose }: Props) {
  const { categories, updateCategory, showToast } = useAppContext();
  const expenses = categories.filter(category => category.type !== 'income');

  const changeClass = (category: Category, affordabilityClass: AffordabilityClass) => {
    const { id, ...editable } = category;
    updateCategory(id, { ...editable, affordabilityClass });
  };

  return (
    <div className="fixed inset-0 z-[220] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="category-behavior-title">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-low shadow-2xl flex flex-col">
        <div className="p-5 sm:p-6 border-b border-outline-variant/20 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Affordability categories</p>
            <h3 id="category-behavior-title" className="mt-2 text-xl font-bold text-on-surface">Tell CoinBuddy how each expense behaves</h3>
            <p className="mt-1 text-sm text-on-surface-variant">These are not new transaction categories. They only tell the planner how to treat the categories you already use.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close category review" className="p-2 rounded-full hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-3">
          <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-4 text-xs text-on-surface-variant">
            For automatic unexpected-spending estimates, mark genuinely unpredictable categories such as medical expenses or repairs as <strong className="text-on-surface">Irregular</strong>. CoinBuddy will not guess category meanings from their names.
          </div>
          {expenses.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No expense categories are available yet.</p>
          ) : expenses.map(category => {
            const current = normalizeAffordabilityClass(category.affordabilityClass, category.group, category.type);
            const currentOption = OPTIONS.find(option => option.value === current)!;
            return (
              <div key={category.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4 sm:flex sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface truncate">{category.name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{currentOption.description}</p>
                </div>
                <select aria-label={`${category.name} affordability behavior`} value={current} onChange={event => changeClass(category, event.target.value as AffordabilityClass)} className="mt-3 sm:mt-0 w-full sm:w-48 min-h-11 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 text-sm text-on-surface focus:outline-none focus:border-primary/60">
                  {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-outline-variant/20">
          <button type="button" onClick={() => { showToast('Category financial behavior updated'); onClose(); }} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Done</button>
        </div>
      </div>
    </div>
  );
}
