import { useState, FormEvent, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X } from 'lucide-react';

export function AddAccountModal() {
  const { 
    addAccountModalType, 
    setAddAccountModalType, 
    addAccount, 
    updateAccount, 
    deleteAccount,
    addCreditCard, 
    updateCreditCard,
    editingAccount,
    setEditingAccount,
    editingCreditCard,
    setEditingCreditCard
  } = useAppContext();
  
  // Generic fields
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  
  // Asset fields
  const [group, setGroup] = useState('Bank Account');
  const [investmentMethod, setInvestmentMethod] = useState<'SIP' | 'Lump Sum'>('SIP');
  const [investedAmount, setInvestedAmount] = useState('');
  const [monthlySIPAmount, setMonthlySIPAmount] = useState('');
  const [nextSIPDate, setNextSIPDate] = useState('');

  // Liability fields
  const [liabilityType, setLiabilityType] = useState('Credit Card');
  const [dueAmount, setDueAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [billingCycleDay, setBillingCycleDay] = useState('1');
  const [limit, setLimit] = useState('');
  
  // Loan fields
  const [originalPrincipal, setOriginalPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyEMI, setMonthlyEMI] = useState('');
  const [nextEMIDate, setNextEMIDate] = useState('');
  
  // Interest-Only Loan fields
  const [monthlyInterestRate, setMonthlyInterestRate] = useState('');
  const [nextInterestDueDate, setNextInterestDueDate] = useState('');

  // Populate or reset fields when modal opens/edits
  useEffect(() => {
    if (editingCreditCard) {
      setName(editingCreditCard.name || '');
      setBalance(editingCreditCard.balance !== undefined ? editingCreditCard.balance.toString() : '');
      setLiabilityType('Credit Card');
      setDueAmount(editingCreditCard.dueAmount !== undefined ? editingCreditCard.dueAmount.toString() : '');
      setDueDate(editingCreditCard.dueDate || '');
      setBillingCycleDay(editingCreditCard.billingCycleDay ? editingCreditCard.billingCycleDay.toString() : '1');
      setLimit(editingCreditCard.limit !== undefined ? editingCreditCard.limit.toString() : '');
    } else if (editingAccount) {
      setName(editingAccount.name || '');
      setBalance(editingAccount.balance !== undefined ? editingAccount.balance.toString() : '');
      if (editingAccount.type === 'asset') {
        setGroup(editingAccount.group || 'Bank Account');
        setInvestmentMethod(editingAccount.investmentMethod || 'SIP');
        setInvestedAmount(editingAccount.investedAmount !== undefined ? editingAccount.investedAmount.toString() : '');
        setMonthlySIPAmount(editingAccount.monthlySIPAmount !== undefined ? editingAccount.monthlySIPAmount.toString() : '');
        setNextSIPDate(editingAccount.nextSIPDate || '');
      } else {
        setLiabilityType(editingAccount.group || 'Other');
        setOriginalPrincipal(editingAccount.originalPrincipal !== undefined ? editingAccount.originalPrincipal.toString() : '');
        setInterestRate(editingAccount.interestRate !== undefined ? editingAccount.interestRate.toString() : '');
        setMonthlyEMI(editingAccount.monthlyEMI !== undefined ? editingAccount.monthlyEMI.toString() : '');
        setNextEMIDate(editingAccount.nextEMIDate || '');
        setMonthlyInterestRate(editingAccount.monthlyInterestRate !== undefined ? editingAccount.monthlyInterestRate.toString() : '');
        setNextInterestDueDate(editingAccount.nextInterestDueDate || '');
      }
    } else if (addAccountModalType) {
      setName('');
      setBalance('');
      setGroup('Bank Account');
      setInvestmentMethod('SIP');
      setInvestedAmount('');
      setMonthlySIPAmount('');
      setNextSIPDate('');
      setLiabilityType('Credit Card');
      setDueAmount('');
      setDueDate('');
      setBillingCycleDay('1');
      setLimit('');
      setOriginalPrincipal('');
      setInterestRate('');
      setMonthlyEMI('');
      setNextEMIDate('');
      setMonthlyInterestRate('');
      setNextInterestDueDate('');
    }
  }, [addAccountModalType, editingAccount, editingCreditCard]);

  if (!addAccountModalType) return null;

  const handleClose = () => {
    setAddAccountModalType(null);
    setEditingAccount(null);
    setEditingCreditCard(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || balance === '') return;

    const numBalance = Math.abs(Number(balance) || 0);

    if (addAccountModalType === 'asset') {
      const assetData = {
        name,
        type: 'asset' as const,
        balance: numBalance,
        group,
        ...(group === 'Investment' ? {
          investmentMethod,
          investedAmount: Math.abs(Number(investedAmount) || 0),
          ...(investmentMethod === 'SIP' ? {
            monthlySIPAmount: Math.abs(Number(monthlySIPAmount) || 0),
            nextSIPDate: nextSIPDate
          } : {})
        } : {})
      };

      if (editingAccount) {
        updateAccount(editingAccount.id, assetData);
      } else {
        addAccount(assetData);
      }
    } else {
      if (liabilityType === 'Credit Card') {
        if (!dueDate || !limit) return;
        const cardData = {
          name,
          balance: numBalance,
          dueAmount: Math.abs(Number(dueAmount) || 0),
          dueDate,
          billingCycleDay: parseInt(billingCycleDay, 10) || 1,
          limit: Math.abs(Number(limit) || 0)
        };

        if (editingCreditCard) {
          updateCreditCard(editingCreditCard.id, cardData);
        } else {
          if (editingAccount) {
            deleteAccount(editingAccount.id);
          }
          addCreditCard(cardData);
        }
      } else if (liabilityType === 'Loan') {
        const loanData = {
          name,
          type: 'liability' as const,
          balance: numBalance,
          group: liabilityType,
          originalPrincipal: Math.abs(Number(originalPrincipal) || 0),
          interestRate: Math.abs(Number(interestRate) || 0),
          monthlyEMI: Math.abs(Number(monthlyEMI) || 0),
          nextEMIDate: nextEMIDate
        };

        if (editingCreditCard) {
          deleteAccount(editingCreditCard.id);
          addAccount(loanData);
        } else if (editingAccount) {
          updateAccount(editingAccount.id, loanData);
        } else {
          addAccount(loanData);
        }
      } else if (liabilityType === 'Interest-Only Loan') {
        const ioData = {
          name,
          type: 'liability' as const,
          balance: numBalance,
          group: liabilityType,
          monthlyInterestRate: Math.abs(Number(monthlyInterestRate) || 0),
          nextInterestDueDate: nextInterestDueDate
        };

        if (editingCreditCard) {
          deleteAccount(editingCreditCard.id);
          addAccount(ioData);
        } else if (editingAccount) {
          updateAccount(editingAccount.id, ioData);
        } else {
          addAccount(ioData);
        }
      } else {
        const otherData = {
          name,
          type: 'liability' as const,
          balance: numBalance,
          group: liabilityType
        };

        if (editingCreditCard) {
          deleteAccount(editingCreditCard.id);
          addAccount(otherData);
        } else if (editingAccount) {
          updateAccount(editingAccount.id, otherData);
        } else {
          addAccount(otherData);
        }
      }
    }
    
    handleClose();
  };

  const isEditing = Boolean(editingAccount || editingCreditCard);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="bg-surface-container rounded-3xl w-full max-w-md p-6 border border-outline-variant/30 shadow-2xl animate-fade-in relative">
        <button 
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-bold text-on-surface mb-6">
          {isEditing 
            ? (addAccountModalType === 'asset' ? 'Edit Asset' : 'Edit Liability')
            : (addAccountModalType === 'asset' ? 'Add Asset' : 'Add Liability')
          }
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              {addAccountModalType === 'asset' ? 'Asset Name' : 'Liability Name'}
            </label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
              placeholder={addAccountModalType === 'asset' ? 'e.g. Primary Checking' : 'e.g. Car Loan'}
            />
          </div>

          {addAccountModalType === 'asset' ? (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Asset Type</label>
              <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 flex-wrap sm:flex-nowrap">
                {['Bank Account', 'Cash', 'Investment', 'Physical Asset'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setGroup(type)}
                    className={`flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-colors min-w-fit ${
                      group === type 
                        ? 'bg-surface-container-high text-on-surface shadow-sm' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Liability Type</label>
              <select
                value={liabilityType}
                onChange={(e) => setLiabilityType(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
              >
                <option value="Credit Card">Credit Card</option>
                <option value="Loan">Loan</option>
                <option value="Interest-Only Loan">Interest-Only Loan</option>
                <option value="Mortgage">Mortgage</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}

          {addAccountModalType === 'liability' && liabilityType === 'Credit Card' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Credit Limit</label>
              <input 
                type="number"
                step="0.01"
                required
                value={limit}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setLimit(isNaN(val) ? '' : e.target.value);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                placeholder="e.g. 5000"
              />
            </div>
          )}

          {addAccountModalType === 'asset' && group === 'Investment' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Investment Method</label>
                <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
                  {['SIP', 'Lump Sum'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setInvestmentMethod(method as 'SIP' | 'Lump Sum')}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
                        investmentMethod === method 
                          ? 'bg-surface-container-high text-on-surface shadow-sm' 
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Total Invested Amount</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={investedAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setInvestedAmount(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Current Market Value</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={balance}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setBalance(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {investmentMethod === 'SIP' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Monthly SIP Amount</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={monthlySIPAmount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setMonthlySIPAmount(isNaN(val) ? '' : e.target.value);
                      }}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next SIP Date</label>
                    <input 
                      type="date"
                      required
                      value={nextSIPDate}
                      onChange={(e) => setNextSIPDate(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {addAccountModalType === 'asset' && group !== 'Investment' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                {group === 'Physical Asset' ? 'Estimated Current Value' : 'Current Balance'}
              </label>
              <input 
                type="number"
                step="0.01"
                required
                value={balance}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBalance(isNaN(val) ? '' : e.target.value);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                placeholder="0.00"
              />
            </div>
          )}

          {addAccountModalType === 'liability' && (
            <div className="grid grid-cols-2 gap-4">
              <div className={liabilityType === 'Credit Card' ? '' : 'col-span-2'}>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Current Balance</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={balance}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setBalance(isNaN(val) ? '' : e.target.value);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="0.00"
                />
              </div>
              {liabilityType === 'Credit Card' && (
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Due Amount</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={dueAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setDueAmount(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          )}

          {addAccountModalType === 'liability' && liabilityType === 'Credit Card' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next Due Date</label>
                <input 
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Billing Cycle Day</label>
                <input 
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={billingCycleDay}
                  onChange={(e) => setBillingCycleDay(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="e.g. 15"
                />
              </div>
            </div>
          )}

          {addAccountModalType === 'liability' && liabilityType === 'Loan' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Original Principal</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={originalPrincipal}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setOriginalPrincipal(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="e.g. 15000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Interest Rate (APR %)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={interestRate}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setInterestRate(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="e.g. 5.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Monthly EMI Amount</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={monthlyEMI}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setMonthlyEMI(isNaN(val) ? '' : e.target.value);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next EMI Date</label>
                  <input 
                    type="date"
                    required
                    value={nextEMIDate}
                    onChange={(e) => setNextEMIDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {addAccountModalType === 'liability' && liabilityType === 'Interest-Only Loan' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Monthly Interest Rate (%)</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={monthlyInterestRate}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setMonthlyInterestRate(isNaN(val) ? '' : e.target.value);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface font-numeric focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="e.g. 2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Next Interest Due</label>
                <input 
                  type="date"
                  required
                  value={nextInterestDueDate}
                  onChange={(e) => setNextInterestDueDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-on-primary font-bold py-3.5 rounded-xl transition-colors mt-2"
          >
            {addAccountModalType === 'asset' ? 'Add Asset' : 'Add Liability'}
          </button>
        </form>
      </div>
    </div>
  );
}
