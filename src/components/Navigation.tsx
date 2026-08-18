import { useEffect, useState } from 'react';
import { Home, ReceiptText, Plus, UsersRound, Menu, WalletCards, Target, LineChart, Settings, Tags, X, ChevronRight, CalendarClock } from 'lucide-react';
import { Tab } from '../types';
import { useAppContext } from '../context/AppContext';

type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';

interface NavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const getCurrentManageDestination = (): ManageDestination => {
  if (typeof window === 'undefined') return 'Accounts';
  const value = sessionStorage.getItem('coinbuddy_current_manage_destination');
  return value === 'Categories' || value === 'Sharing' || value === 'Goals' ? value : 'Accounts';
};

export function Navigation({ activeTab, setActiveTab }: NavProps) {
  const { setEditingTransaction, setAddModalOpen } = useAppContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const [manageDestination, setManageDestination] = useState<ManageDestination>(getCurrentManageDestination);

  useEffect(() => {
    const handleCurrent = (event: Event) => {
      const destination = (event as CustomEvent<ManageDestination>).detail;
      if (destination) setManageDestination(destination);
    };
    document.addEventListener('coinbuddy:manage-current', handleCurrent);
    return () => document.removeEventListener('coinbuddy:manage-current', handleCurrent);
  }, []);

  const openAdd = () => {
    setEditingTransaction(null);
    setAddModalOpen(true);
  };

  const openManage = (destination: ManageDestination) => {
    sessionStorage.setItem('coinbuddy_manage_destination', destination);
    sessionStorage.setItem('coinbuddy_current_manage_destination', destination);
    setManageDestination(destination);
    setActiveTab('manage');
    setMoreOpen(false);
    window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent<ManageDestination>('coinbuddy:manage-destination', { detail: destination }));
    }, 0);
  };

  const mobilePrimary = [
    { id: 'dashboard', label: 'Home', icon: Home, onClick: () => setActiveTab('dashboard'), active: activeTab === 'dashboard' },
    { id: 'activity', label: 'Activity', icon: ReceiptText, onClick: () => setActiveTab('activity'), active: activeTab === 'activity' },
  ];

  const moreActive = activeTab === 'insights' || activeTab === 'scheduled' || (activeTab === 'manage' && manageDestination !== 'Sharing');

  const desktopItems = [
    { key: 'home', label: 'Home', icon: Home, active: activeTab === 'dashboard', action: () => setActiveTab('dashboard') },
    { key: 'activity', label: 'Activity', icon: ReceiptText, active: activeTab === 'activity', action: () => setActiveTab('activity') },
    { key: 'accounts', label: 'Accounts', icon: WalletCards, active: activeTab === 'manage' && manageDestination === 'Accounts', action: () => openManage('Accounts'), group: 'Money' },
    { key: 'scheduled', label: 'Scheduled Payments', icon: CalendarClock, active: activeTab === 'scheduled', action: () => setActiveTab('scheduled') },
    { key: 'categories', label: 'Categories', icon: Tags, active: activeTab === 'manage' && manageDestination === 'Categories', action: () => openManage('Categories') },
    { key: 'goals', label: 'Goals', icon: Target, active: activeTab === 'manage' && manageDestination === 'Goals', action: () => openManage('Goals') },
    { key: 'insights', label: 'Insights', icon: LineChart, active: activeTab === 'insights', action: () => setActiveTab('insights') },
    { key: 'sharing', label: 'Sharing', icon: UsersRound, active: activeTab === 'manage' && manageDestination === 'Sharing', action: () => openManage('Sharing'), group: 'Shared' },
    { key: 'settings', label: 'Settings', icon: Settings, active: activeTab === 'settings', action: () => setActiveTab('settings'), group: 'System' },
  ];

  return (
    <>
      <nav data-testid="mobile-bottom-nav" className="v35-nav-safe fixed inset-x-0 bottom-0 z-50 flex items-end justify-around border-t border-outline-variant/40 bg-[rgba(4,11,21,.94)] px-2 pt-1.5 backdrop-blur-xl md:hidden">
        {mobilePrimary.map(({ id, label, icon: Icon, onClick, active }) => (
          <button key={id} onClick={onClick} aria-label={label} className={`v35-focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
            <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.3 : 1.9} />
            <span>{label}</span>
          </button>
        ))}

        <button data-tour-id="tour-add-transaction" onClick={openAdd} aria-label="Add Transaction" className="v35-focus-ring -mt-5 flex min-h-16 flex-1 flex-col items-center justify-end gap-1 text-[10px] font-semibold text-primary">
          <span className="v35-blue-glow flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary text-white shadow-lg transition-transform active:scale-95">
            <Plus className="h-7 w-7" strokeWidth={2.2} />
          </span>
          <span>Add</span>
        </button>

        <button onClick={() => openManage('Sharing')} aria-label="Sharing" className={`v35-focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${activeTab === 'manage' && manageDestination === 'Sharing' ? 'text-primary' : 'text-on-surface-variant'}`}>
          <UsersRound className="h-[21px] w-[21px]" strokeWidth={activeTab === 'manage' && manageDestination === 'Sharing' ? 2.3 : 1.9} />
          <span>Sharing</span>
        </button>

        <button onClick={() => setMoreOpen(true)} aria-label="Menu" className={`v35-focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${moreActive ? 'text-primary' : 'text-on-surface-variant'}`}>
          <Menu className="h-[21px] w-[21px]" />
          <span>Menu</span>
        </button>
      </nav>

      <nav data-testid="desktop-sidebar" className="fixed bottom-0 left-0 top-16 z-40 hidden w-20 flex-col border-r border-outline-variant/35 bg-[rgba(4,11,21,.82)] px-3 py-5 backdrop-blur-xl md:flex xl:w-60 xl:px-4">
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {desktopItems.map(({ key, label, icon: Icon, active, action, group }, index) => {
            const previousGroup = index > 0 ? desktopItems[index - 1].group : undefined;
            const showGroup = group && group !== previousGroup;
            return (
              <div key={key}>
                {showGroup ? <div className="mt-5 hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/60 xl:block">{group}</div> : null}
                <button onClick={action} title={label} aria-label={label} className={`v35-focus-ring group flex h-11 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors xl:justify-start ${active ? 'bg-primary/12 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}>
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                  <span className="hidden truncate xl:block">{label}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-on-surface-variant xl:block">
          <div className="font-semibold text-on-surface">Your money, clearer ✨</div>
          <div className="mt-1">Local-first finance tracking with your data staying on your device.</div>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="Money tools navigation">
          <button className="absolute inset-0 min-h-0 w-full bg-black/60" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-outline-variant/40 bg-surface-container-low p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Money tools</h2>
                <p className="text-sm text-on-surface-variant">Accounts, schedules, categories, goals and insights.</p>
              </div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container">
              {[
                { label: 'Accounts', icon: WalletCards, action: () => openManage('Accounts') },
                { label: 'Scheduled Payments', icon: CalendarClock, action: () => { setMoreOpen(false); setActiveTab('scheduled'); } },
                { label: 'Categories', icon: Tags, action: () => openManage('Categories') },
                { label: 'Goals', icon: Target, action: () => openManage('Goals') },
                { label: 'Insights', icon: LineChart, action: () => { setMoreOpen(false); setActiveTab('insights'); } },
              ].map(({ label, icon: Icon, action }) => (
                <button key={label} onClick={action} className="v35-focus-ring flex min-h-14 w-full items-center gap-3 border-b border-outline-variant/20 px-4 text-left last:border-b-0 hover:bg-surface-container-high">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <span className="flex-1 text-sm font-medium text-on-surface">{label}</span>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
