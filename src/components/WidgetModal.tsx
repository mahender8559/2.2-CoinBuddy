import { useState } from 'react';
import { Building2, ChevronLeft, List, Plus, Tag, TrendingUp, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';
import type { Account, Category } from '../types';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function WidgetModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { categories, accounts, addWidget, widgets } = useAppContext();
  const [step, setStep] = useState<'type' | 'select'>('type');
  const [type, setType] = useState<'category' | 'asset' | 'liability' | null>(null);

  if (!isOpen) return null;

  const handleSelectType = (nextType: 'category' | 'asset' | 'liability') => {
    setType(nextType);
    setStep('select');
  };

  const handleAddWidget = (targetId: string) => {
    if (!type) return;
    addWidget({ type, targetId });
    onClose();
    window.setTimeout(() => {
      setStep('type');
      setType(null);
    }, 300);
  };

  const options = type === 'category'
    ? categories.filter(category => !widgets.find(widget => widget.type === 'category' && widget.targetId === category.id))
    : type === 'asset' || type === 'liability'
      ? accounts.filter(account => !account.is_archived && account.type === type && !widgets.find(widget => widget.type === type && widget.targetId === account.id))
      : [];

  const title = step === 'type' ? 'Add Widget' : `Select ${type === 'category' ? 'Category' : type === 'asset' ? 'Asset' : 'Liability'}`;

  return (
    <V35ModalFrame size="sm" testId="widget-config-sheet" labelledBy="widget-config-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {step === 'select' ? <button type="button" aria-label="Back to widget types" onClick={() => setStep('type')} className="v35-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><ChevronLeft className="h-5 w-5" /></button> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h2 id="widget-config-title" className="truncate text-lg font-semibold text-on-surface">{title}</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">{step === 'type' ? 'Pin one useful number to your Dashboard.' : 'Choose the item you want to keep visible.'}</p>
          </div>
        </div>
        <button type="button" aria-label="Close widget configuration" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {step === 'type' ? (
          <div className="space-y-2">
            <WidgetTypeButton label="Category Spending" description="Watch spending against one category." icon={Tag} onClick={() => handleSelectType('category')} />
            <WidgetTypeButton label="Asset Account" description="Keep an asset balance in view." icon={TrendingUp} onClick={() => handleSelectType('asset')} />
            <WidgetTypeButton label="Liability Account" description="Keep a debt balance in view." icon={Building2} onClick={() => handleSelectType('liability')} />
          </div>
        ) : options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/35 bg-surface-container-low px-5 py-10 text-center">
            <p className="text-sm font-semibold text-on-surface">Everything here is already pinned.</p>
            <p className="mt-1 text-xs text-on-surface-variant">Go back and choose another widget type.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((option: Account | Category) => {
              const Icon = type === 'category' && 'icon' in option ? icons[option.icon as keyof typeof icons] || List : type === 'asset' ? TrendingUp : Building2;
              return (
                <button key={option.id} type="button" aria-label={`Add widget ${option.name}`} onClick={() => handleAddWidget(option.id)} className="v35-focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3.5 py-3 text-left transition-colors hover:bg-surface-container-high">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{option.name}</span>
                  <Plus className="h-4 w-4 shrink-0 text-on-surface-variant" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </V35ModalFrame>
  );
}

function WidgetTypeButton({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: typeof Tag; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="v35-focus-ring flex min-h-[72px] w-full items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3.5 py-3 text-left transition-colors hover:bg-surface-container-high">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">{label}</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{description}</span></span>
      <Plus className="h-4 w-4 shrink-0 text-on-surface-variant" />
    </button>
  );
}
