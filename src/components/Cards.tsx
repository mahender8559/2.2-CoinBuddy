import { Plus, Building2, Wallet, TrendingUp, CreditCard, Car, HardDrive, Trash2, Target, Pencil } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { AnimatedNumber } from './AnimatedNumber';
import { motion } from 'framer-motion';

export function Cards() {
  const { 
    formatCurrency, 
    creditCards, 
    setAddAccountModalType, 
    setPayCardModalState, 
    accounts, 
    deleteAccount, 
    setEditingAccount, 
    setEditingCreditCard 
  } = useAppContext();
  
  const assets = accounts.filter(a => a.type === 'asset');
  const liabilities = accounts.filter(a => a.type === 'liability');

  const handleEditAsset = (account: any) => {
    setEditingAccount(account);
    setEditingCreditCard(null);
    setAddAccountModalType('asset');
  };

  const handleEditLiability = (account: any, ccDetails: any) => {
    if (ccDetails) {
      setEditingCreditCard(ccDetails);
      setEditingAccount(null);
    } else {
      setEditingAccount(account);
      setEditingCreditCard(null);
    }
    setAddAccountModalType('liability');
  };

  // Simple heuristic for icons
  const getAssetIcon = (account: any) => {
    const l = (account.group || account.name).toLowerCase();
    if (l.includes('cash') || l.includes('wallet')) return <Wallet className="w-5 h-5 text-emerald-400" />;
    if (l.includes('invest') || l.includes('broker') || l.includes('vanguard')) return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    return <Building2 className="w-5 h-5 text-emerald-400" />;
  };

  const getLiabilityIcon = (account: any) => {
    const l = (account.group || account.name).toLowerCase();
    if (l.includes('car') || l.includes('auto') || l.includes('vehicle')) return <Car className="w-5 h-5 text-rose-400" />;
    return <CreditCard className="w-5 h-5 text-rose-400" />;
  };

  return (
    <div className="space-y-10 pb-24 md:pb-0 animate-fade-in max-w-3xl mx-auto">
      {/* Assets Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <h2 className="text-xl font-bold text-on-surface">My Assets</h2>
        </div>
        
        <div className="space-y-4">
          {assets.map(account => {
            const isInvestment = account.group === 'Investment';
            const profitLoss = isInvestment && account.investedAmount ? account.balance - account.investedAmount : null;
            const profitLossPercent = isInvestment && account.investedAmount ? (profitLoss! / account.investedAmount) * 100 : null;

            return (
              <div key={account.id} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                    {getAssetIcon(account)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-on-surface text-[15px]">{account.name}</h3>
                    <p className="text-xs text-on-surface-variant">{account.group || 'Asset account'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-2 sm:mt-0">
                  {isInvestment && profitLoss !== null && (
                    <div className="text-right mr-2 hidden sm:block">
                      <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-0.5">Returns</p>
                      <p className={`text-xs font-bold font-numeric ${profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)} ({profitLoss >= 0 ? '+' : ''}{profitLossPercent?.toFixed(2)}%)
                      </p>
                    </div>
                  )}
                  <div className="text-right flex items-center gap-2 sm:gap-3">
                    <p className="text-xl font-bold font-numeric text-emerald-400"><AnimatedNumber value={account.balance} format={formatCurrency} /></p>
                    <button 
                      onClick={() => handleEditAsset(account)}
                      className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                      title="Edit asset"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteAccount(account.id)}
                      className="p-2 text-on-surface-variant hover:text-rose-400 hover:bg-rose-400/10 rounded-full transition-colors"
                      title="Delete asset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          
          <button 
            onClick={() => {
              setEditingAccount(null);
              setEditingCreditCard(null);
              setAddAccountModalType('asset');
            }}
            className="w-full py-4 border border-dashed border-outline-variant/40 rounded-2xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:border-outline-variant transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Asset
          </button>
        </div>
      </div>
      {/* Liabilities Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-rose-400"></div>
          <h2 className="text-xl font-bold text-on-surface">My Liabilities</h2>
        </div>
        
        <div className="space-y-4">
          {liabilities.map(account => {
            const ccDetails = creditCards.find(c => c.name === account.name);
            
            let dueDateStr = '';
            let isDueSoon = false;
            
            if (ccDetails) {
              dueDateStr = new Date(ccDetails.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              isDueSoon = (new Date(ccDetails.dueDate).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000);
            } else if (account.group === 'Loan' && account.nextEMIDate) {
              dueDateStr = new Date(account.nextEMIDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              isDueSoon = (new Date(account.nextEMIDate).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000);
            } else if (account.group === 'Interest-Only Loan' && account.nextInterestDueDate) {
              dueDateStr = new Date(account.nextInterestDueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              isDueSoon = (new Date(account.nextInterestDueDate).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000);
            }
            
            return (
              <div key={account.id} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/20 flex flex-col gap-3 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                      {getLiabilityIcon(account)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-on-surface text-[15px]">{account.name}</h3>
                      {dueDateStr ? (
                        <p className="text-xs text-on-surface-variant mt-0.5">Due: {dueDateStr}</p>
                      ) : (
                        <p className="text-xs text-on-surface-variant mt-0.5">{account.group || 'Liability account'}</p>
                      )}
                    </div>
                  </div>
                  
                  {isDueSoon && (
                    <div className="absolute top-4 right-4 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                      <span className="text-[9px] font-bold text-rose-300 tracking-wider uppercase">Due Soon</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                    <div className="text-right flex items-center gap-2 sm:gap-3">
                      <p className="text-xl font-bold font-numeric text-rose-400">-{formatCurrency(account.balance)}</p>
                      
                      <button
                        onClick={() => {
                          if (ccDetails) {
                            setPayCardModalState({isOpen: true, cardId: ccDetails.id});
                          } else {
                            setPayCardModalState({isOpen: true, cardId: account.id});
                          }
                        }}
                        className="bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 shrink-0 flex items-center gap-1"
                      >
                        Pay Down
                      </button>

                      <button 
                        onClick={() => handleEditLiability(account, ccDetails)}
                        className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                        title="Edit liability"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button 
                        onClick={() => deleteAccount(account.id)}
                        className="p-2 text-on-surface-variant hover:text-rose-400 hover:bg-rose-400/10 rounded-full transition-colors"
                        title="Delete liability"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Credit Card Utilization or Loan Payoff Progress Indicator */}
                {(() => {
                  const isCreditCard = Boolean(ccDetails || account.group === 'Credit Card');
                  
                  if (isCreditCard) {
                    const limit = ccDetails?.limit || 0;
                    const utilization = limit > 0 ? Math.min(100, Math.max(0, (account.balance / limit) * 100)) : 0;
                    
                    let statusText = '0% Utilized (Ideal)';
                    let statusColor = 'text-emerald-500';
                    let barColor = 'bg-emerald-500';

                    if (account.balance > 0) {
                      if (utilization <= 30) {
                        statusText = `${utilization.toFixed(0)}% Utilized (Healthy <30%)`;
                        statusColor = 'text-emerald-400';
                        barColor = 'bg-emerald-500';
                      } else if (utilization <= 70) {
                        statusText = `${utilization.toFixed(0)}% Utilized (Caution)`;
                        statusColor = 'text-amber-400';
                        barColor = 'bg-amber-500';
                      } else {
                        statusText = `${utilization.toFixed(0)}% Utilized (High Limit Warning)`;
                        statusColor = 'text-rose-400';
                        barColor = 'bg-rose-500';
                      }
                    }

                    return (
                      <div className="pt-2 border-t border-outline-variant/10">
                        <div className="flex justify-between items-center text-[11px] font-medium text-on-surface-variant mb-1">
                          <span>
                            {limit > 0 
                              ? `Credit Limit Utilized (${formatCurrency(account.balance)} / ${formatCurrency(limit)})` 
                              : 'Credit Card Utilization'}
                          </span>
                          <span className={`font-bold font-numeric ${statusColor}`}>
                            {statusText}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-dim rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${barColor} transition-all duration-500`} 
                            style={{ width: `${limit > 0 ? utilization : (account.balance > 0 ? 80 : 0)}%` }} 
                          />
                        </div>
                        {account.balance > 0 && (
                          <p className="text-[10px] text-on-surface-variant/80 mt-1 flex items-center justify-between">
                            <span>💡 Keep utilization under 30% to protect credit score</span>
                            <span className="text-emerald-500 font-medium">Pay down to restore limit</span>
                          </p>
                        )}
                      </div>
                    );
                  } else {
                    const cap = account.originalPrincipal || 0;
                    const paid = cap ? Math.max(0, cap - account.balance) : 0;
                    const pct = cap ? Math.min(100, Math.max(0, (paid / cap) * 100)) : (account.balance === 0 ? 100 : 50);
                    return (
                      <div className="pt-2 border-t border-outline-variant/10">
                        <div className="flex justify-between items-center text-[11px] font-medium text-on-surface-variant mb-1">
                          <span>
                            {cap > 0 
                              ? `Loan Principal Paid (${formatCurrency(paid)} / ${formatCurrency(cap)})` 
                              : 'Payoff Progress'}
                          </span>
                          <span className="font-bold text-emerald-500 font-numeric">
                            {account.balance === 0 ? 'DEBT FREE 🎉' : `${pct.toFixed(0)}% Paid Off`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-dim rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-500" 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            );
          })}
          
          <button 
            onClick={() => {
              setEditingAccount(null);
              setEditingCreditCard(null);
              setAddAccountModalType('liability');
            }}
            className="w-full py-4 border border-dashed border-outline-variant/40 rounded-2xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:border-outline-variant transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Liability
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-8 pb-4 opacity-50">
        <HardDrive className="w-3.5 h-3.5 text-on-surface-variant" />
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Local Storage Encryption Active</span>
      </div>
    </div>
  );
}

