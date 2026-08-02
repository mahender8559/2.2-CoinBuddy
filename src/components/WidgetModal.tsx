import { useState } from 'react';
import { Plus, X, List, TrendingUp, Building2, Tag } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { icons } from '../icons';

export function WidgetModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { categories, accounts, addWidget, widgets } = useAppContext();
  const [step, setStep] = useState<'type' | 'select'>('type');
  const [type, setType] = useState<'category' | 'asset' | 'liability' | null>(null);

  if (!isOpen) return null;

  const handleSelectType = (t: 'category' | 'asset' | 'liability') => {
    setType(t);
    setStep('select');
  };

  const handleAddWidget = (targetId: string) => {
    if (type) {
      addWidget({ type, targetId });
      onClose();
      // Reset state after a short delay
      setTimeout(() => {
        setStep('type');
        setType(null);
      }, 300);
    }
  };

  const getAvailableOptions = () => {
    if (type === 'category') {
      return categories.filter(c => !widgets.find(w => w.type === 'category' && w.targetId === c.id));
    }
    if (type === 'asset' || type === 'liability') {
      return accounts.filter(a => !a.is_archived && a.type === type && !widgets.find(w => w.type === type && w.targetId === a.id));
    }
    return [];
  };

  const options = getAvailableOptions();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-container rounded-3xl w-full max-w-md overflow-hidden shadow-xl border border-outline-variant/30 flex flex-col">
        <div className="p-4 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">
            {step === 'type' ? 'Add Widget' : `Select ${type === 'category' ? 'Category' : type === 'asset' ? 'Asset' : 'Liability'}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto no-scrollbar">
          {step === 'type' && (
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => handleSelectType('category')} className="flex items-center p-4 bg-surface-container-high hover:bg-surface-container-highest rounded-2xl transition-colors text-left gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0"><Tag className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-semibold text-on-surface text-sm">Category Spending</h3>
                  <p className="text-xs text-on-surface-variant">Track spending for a specific category</p>
                </div>
              </button>
              <button onClick={() => handleSelectType('asset')} className="flex items-center p-4 bg-surface-container-high hover:bg-surface-container-highest rounded-2xl transition-colors text-left gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0"><TrendingUp className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-semibold text-on-surface text-sm">Asset Account</h3>
                  <p className="text-xs text-on-surface-variant">Track the balance of an asset</p>
                </div>
              </button>
              <button onClick={() => handleSelectType('liability')} className="flex items-center p-4 bg-surface-container-high hover:bg-surface-container-highest rounded-2xl transition-colors text-left gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0"><Building2 className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-semibold text-on-surface text-sm">Liability Account</h3>
                  <p className="text-xs text-on-surface-variant">Track the balance of a liability</p>
                </div>
              </button>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-2">
              <button onClick={() => setStep('type')} className="text-sm font-medium text-primary hover:opacity-80 mb-2">
                &larr; Back
              </button>
              {options.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-8">No more items to track.</p>
              ) : (
                options.map((opt: any) => {
                  const Icon = type === 'category' ? icons[opt.icon as keyof typeof icons] || List : (type === 'asset' ? TrendingUp : Building2);
                  return (
                    <button 
                      key={opt.id}
                      onClick={() => handleAddWidget(opt.id)}
                      className="w-full flex items-center justify-between p-4 bg-surface-container-high hover:bg-surface-container-highest rounded-2xl transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'asset' ? 'bg-emerald-500/10 text-emerald-500' : type === 'liability' ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-medium text-sm text-on-surface">{opt.name}</span>
                      </div>
                      <Plus className="w-5 h-5 text-on-surface-variant" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
