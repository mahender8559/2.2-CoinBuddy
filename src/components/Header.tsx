import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Undo2, Redo2, LogOut, Eye, EyeOff, SlidersHorizontal, WalletCards } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onLogout: () => void;
  showLogout?: boolean;
}

type DashboardTargets = {
  netWorthAmount: HTMLElement | null;
  greetingRow: HTMLElement | null;
  cycleChip: HTMLElement | null;
  incomeCaption: HTMLElement | null;
};

function DashboardQuickActions() {
  const { setWalletModalOpen, balancesVisible, toggleBalancesVisible, monthCycleDay } = useAppContext();
  const [targets, setTargets] = useState<DashboardTargets>({
    netWorthAmount: null,
    greetingRow: null,
    cycleChip: null,
    incomeCaption: null,
  });

  useEffect(() => {
    const locateTargets = () => {
      const netWorth = document.querySelector<HTMLElement>('[aria-label="Net Worth overview"]');
      const greetingSection = document.querySelector<HTMLElement>('[aria-labelledby="v35-dashboard-title"]');
      const greetingRow = greetingSection?.querySelector<HTMLElement>(':scope > div:first-child') ?? null;
      // The original cycle chip is always the second direct child of the greeting row.
      // Do not use :last-child here because the portal itself becomes the last child.
      const cycleChip = (greetingRow?.children.item(1) as HTMLElement | null) ?? null;
      const incomeCard = document.querySelector<HTMLElement>('[data-tour-id="tour-summary-widgets"]');
      // Income card paragraphs are: amount, then the "This cycle" caption.
      const incomeCaption = (incomeCard?.querySelectorAll<HTMLElement>('p').item(1)) ?? null;
      const netWorthAmount = netWorth?.querySelector<HTMLElement>(':scope > div:first-child > div:first-child > p:nth-of-type(2)') ?? null;

      setTargets(previous => {
        if (
          previous.netWorthAmount === netWorthAmount
          && previous.greetingRow === greetingRow
          && previous.cycleChip === cycleChip
          && previous.incomeCaption === incomeCaption
        ) return previous;
        return { netWorthAmount, greetingRow, cycleChip, incomeCaption };
      });
    };

    locateTargets();
    const observer = new MutationObserver(locateTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cycleChip = targets.cycleChip;
    const incomeCaption = targets.incomeCaption;
    if (cycleChip) cycleChip.style.display = 'none';
    if (incomeCaption) incomeCaption.style.whiteSpace = 'nowrap';

    return () => {
      if (cycleChip) cycleChip.style.display = '';
      if (incomeCaption) incomeCaption.style.whiteSpace = '';
    };
  }, [targets.cycleChip, targets.incomeCaption]);

  const openSettings = () => {
    const state = { tab: 'settings' };
    window.history.pushState(state, '', '?tab=settings');
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  };

  const cycleLabel = monthCycleDay > 1 ? `Cycle starts day ${monthCycleDay}` : 'Calendar month';

  return (
    <>
      {targets.netWorthAmount ? createPortal(
        <button
          type="button"
          onClick={toggleBalancesVisible}
          className="v35-focus-ring ml-2 inline-flex h-8 w-8 -translate-y-0.5 items-center justify-center rounded-lg align-middle text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary sm:h-9 sm:w-9"
          title={balancesVisible ? 'Hide balances' : 'Show balances'}
          aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
          data-testid="dashboard-privacy-toggle"
        >
          {balancesVisible ? <EyeOff className="h-4 w-4 sm:h-[18px] sm:w-[18px]" /> : <Eye className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />}
        </button>,
        targets.netWorthAmount,
      ) : null}

      {targets.greetingRow ? createPortal(
        <div
          data-testid="dashboard-header-actions"
          className="inline-flex shrink-0 items-center gap-2"
          aria-label="Dashboard shortcuts"
        >
          <button
            type="button"
            onClick={() => setWalletModalOpen(true)}
            className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/45 bg-surface-container-low text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/10 sm:h-11 sm:w-11"
            title="Wallet Summary"
            aria-label="Wallet Summary"
            data-testid="dashboard-wallet-summary"
          >
            <WalletCards className="h-5 w-5 sm:h-[21px] sm:w-[21px]" strokeWidth={2.15} />
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/45 bg-surface-container-low text-on-surface-variant shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/8 hover:text-primary sm:h-11 sm:w-11"
            title="Settings"
            aria-label="Settings"
            data-testid="dashboard-settings-shortcut"
          >
            <SlidersHorizontal className="h-5 w-5 sm:h-[21px] sm:w-[21px]" strokeWidth={2.15} />
          </button>
        </div>,
        targets.greetingRow,
      ) : null}

      {targets.incomeCaption ? createPortal(
        <span
          data-testid="dashboard-cycle-indicator"
          className="ml-1.5 inline-flex items-center text-[9.5px] font-semibold text-on-surface-variant sm:text-[10px]"
          aria-label={cycleLabel}
        >
          <span aria-hidden="true" className="mr-1 text-outline">•</span>
          {cycleLabel}
        </span>,
        targets.incomeCaption,
      ) : null}
    </>
  );
}

export function Header({ onLogout, showLogout = true }: HeaderProps) {
  const { canUndo, canRedo, handleUndo, handleRedo } = useAppContext();

  return (
    <>
      <header data-testid="app-header" className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center justify-between md:flex border-b border-outline-variant/35 bg-background/88 px-4 backdrop-blur-xl md:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/logo.png" alt="CoinBuddy" className="h-9 w-9 rounded-xl object-cover ring-1 ring-primary/25" />
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight text-on-surface sm:text-xl">CoinBuddy</h1>
            <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary sm:inline">V3.5</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="mr-1 hidden items-center gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-low px-3 py-2 lg:flex">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-on-surface-variant">Local Ledger</span>
          </div>

          <button onClick={handleUndo} disabled={!canUndo} aria-label="Undo" title="Undo" className={`v35-focus-ring hidden h-10 w-10 items-center justify-center rounded-xl transition-colors sm:flex ${canUndo ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface' : 'cursor-not-allowed text-on-surface-variant/25'}`}>
            <Undo2 className="h-5 w-5" />
          </button>
          <button onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo" className={`v35-focus-ring hidden h-10 w-10 items-center justify-center rounded-xl transition-colors sm:flex ${canRedo ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface' : 'cursor-not-allowed text-on-surface-variant/25'}`}>
            <Redo2 className="h-5 w-5" />
          </button>
          {showLogout ? (
            <button onClick={onLogout} className="v35-focus-ring hidden h-10 items-center gap-2 rounded-xl px-3 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error md:flex" title="Sign out" aria-label="Sign out">
              <LogOut className="h-5 w-5" />
              <span className="hidden text-sm font-medium xl:inline">Sign out</span>
            </button>
          ) : null}
        </div>
      </header>
      <DashboardQuickActions />
    </>
  );
}
