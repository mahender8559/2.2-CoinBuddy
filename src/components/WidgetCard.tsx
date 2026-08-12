import { X, TrendingUp, Building2, List } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import { Widget } from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { getCategorySpend } from '../utils/budget';

import React from 'react';

export const WidgetCard: React.FC<{ widget: Widget }> = ({ widget }) => {
  const { categories, accounts, removeWidget, transactions, isDateInCurrentCycle, formatCurrency } = useAppContext();

  if (widget.type === 'category') {
    const category = categories.find(c => c.id === widget.targetId);
    if (!category) return null;

    const spent = getCategorySpend(category, transactions, isDateInCurrentCycle);
    
    const Icon = icons[category.icon as keyof typeof icons] || List;
    const progress = category.budget && category.budget > 0 ? (spent / category.budget) * 100 : 0;

    return (
      <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative group">
        <button aria-label={`Remove ${category.name} widget`} title={`Remove ${category.name} widget`} onClick={() => removeWidget(widget.id)} className="absolute top-3 right-3 p-1 rounded-full bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-all focus:opacity-100">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface text-sm">{category.name}</h3>
            <p className="text-xs text-on-surface-variant">Category Tracker</p>
          </div>
        </div>
        
        <div className="flex justify-between items-end mb-2">
          <div>
            <p className="text-xl font-bold font-numeric text-on-surface"><AnimatedNumber value={spent} format={formatCurrency} /></p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">Spent</p>
          </div>
          {category.budget ? (
            <div className="text-right">
              <p className="text-sm font-semibold font-numeric text-on-surface-variant">{formatCurrency(category.budget)}</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">Budget</p>
            </div>
          ) : null}
        </div>
        
        {category.budget ? (
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex relative mt-3">
             <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(100, progress)}%` }}></div>
             {progress > 100 && (
                <div className="bg-error h-full rounded-full" style={{ width: `${Math.min(100, progress - 100)}%` }}></div>
             )}
          </div>
        ) : null}
      </div>
    );
  }

  if (widget.type === 'asset' || widget.type === 'liability') {
    const account = accounts.find(a => a.id === widget.targetId);
    if (!account || account.is_archived) return null;
    
    const isAsset = widget.type === 'asset';
    const Icon = isAsset ? TrendingUp : Building2;
    const colorClass = isAsset ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10';

    return (
      <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative group">
        <button aria-label={`Remove ${account.name} widget`} title={`Remove ${account.name} widget`} onClick={() => removeWidget(widget.id)} className="absolute top-3 right-3 p-1 rounded-full bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-all focus:opacity-100">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface text-sm">{account.name}</h3>
            <p className="text-xs text-on-surface-variant capitalize">{widget.type}</p>
          </div>
        </div>
        
        <p className="text-2xl font-bold font-numeric text-on-surface tracking-tight">
          <AnimatedNumber value={account.balance} format={formatCurrency} />
        </p>
      </div>
    );
  }

  return null;
}
