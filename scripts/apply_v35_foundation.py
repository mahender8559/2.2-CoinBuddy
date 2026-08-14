from pathlib import Path

ROOT = Path('.')

v35_css = r'''/* CoinBuddy V3.5 — Minimal Dark foundation */
:root {
  --cb-bg: #06101e;
  --cb-bg-deep: #040b15;
  --cb-surface-1: #0a1627;
  --cb-surface-2: #0e1b2e;
  --cb-surface-3: #132238;
  --cb-surface-hover: #172941;
  --cb-border: #203047;
  --cb-border-soft: rgba(148, 163, 184, 0.12);
  --cb-text: #f8fafc;
  --cb-text-secondary: #c7d0dc;
  --cb-text-muted: #94a3b8;
  --cb-text-disabled: #64748b;
  --cb-blue: #4c8dff;
  --cb-blue-strong: #2878ff;
  --cb-blue-soft: rgba(76, 141, 255, 0.14);
  --cb-blue-glow: rgba(76, 141, 255, 0.26);
  --cb-green: #22c55e;
  --cb-green-soft: rgba(34, 197, 94, 0.13);
  --cb-red: #ff6668;
  --cb-red-soft: rgba(255, 102, 104, 0.13);
  --cb-purple: #a855f7;
  --cb-purple-soft: rgba(168, 85, 247, 0.14);
  --cb-amber: #fbbf24;
  --cb-amber-soft: rgba(251, 191, 36, 0.14);
}

.dark {
  --background: var(--cb-bg);
  --on-background: var(--cb-text);
  --surface: var(--cb-bg);
  --surface-dim: var(--cb-bg-deep);
  --surface-bright: #16263b;
  --surface-container-lowest: var(--cb-bg-deep);
  --surface-container-low: var(--cb-surface-1);
  --surface-container: var(--cb-surface-2);
  --surface-container-high: var(--cb-surface-3);
  --surface-container-highest: var(--cb-surface-hover);
  --on-surface: var(--cb-text);
  --on-surface-variant: var(--cb-text-muted);
  --outline: #5f7189;
  --outline-variant: var(--cb-border);
  --surface-tint: var(--cb-blue);
  --primary: var(--cb-blue);
  --on-primary: #ffffff;
  --primary-container: #153a72;
  --on-primary-container: #dceaff;
  --inverse-primary: #8eb6ff;
  --secondary: #8da8cf;
  --on-secondary: #081426;
  --secondary-container: #142d4d;
  --on-secondary-container: #d6e5ff;
  --tertiary: var(--cb-purple);
  --on-tertiary: #ffffff;
  --tertiary-container: #40205f;
  --on-tertiary-container: #f3e8ff;
  --error: var(--cb-red);
  --on-error: #ffffff;
  --error-container: #531f2b;
  --on-error-container: #ffe1e3;
}

.dark body {
  background:
    radial-gradient(circle at 50% -10%, rgba(40, 120, 255, 0.10), transparent 38rem),
    var(--cb-bg);
}

.v35-surface {
  background: linear-gradient(180deg, rgba(14, 27, 46, 0.97), rgba(10, 22, 39, 0.97));
  border: 1px solid var(--cb-border-soft);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}

.v35-surface-hover {
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.v35-surface-hover:hover {
  border-color: rgba(76, 141, 255, 0.28);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
}

.v35-blue-glow {
  box-shadow: 0 0 28px var(--cb-blue-glow);
}

.v35-focus-ring:focus-visible {
  outline: 2px solid var(--cb-blue);
  outline-offset: 2px;
}

.v35-nav-safe {
  padding-bottom: max(0.45rem, env(safe-area-inset-bottom));
}

@media (max-width: 767px) {
  /* V3.5 central bottom-nav Add replaces the legacy floating mobile Add button. */
  main + button[data-tour-id="tour-add-transaction"] {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .v35-surface-hover,
  .v35-blue-glow {
    transition: none !important;
  }
}
'''

v35_ui = r'''import type { ComponentType, HTMLAttributes, ReactNode, SVGProps } from 'react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const join = (...parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' ');

export function SurfaceCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join('v35-surface rounded-2xl', className)} {...props} />;
}

export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-on-surface">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function IconBadge({ icon: Icon, tone = 'blue', size = 'md' }: { icon: IconComponent; tone?: 'blue' | 'green' | 'red' | 'purple' | 'amber'; size?: 'sm' | 'md' | 'lg' }) {
  const tones = {
    blue: 'bg-[var(--cb-blue-soft)] text-[var(--cb-blue)] border-[rgba(76,141,255,.24)]',
    green: 'bg-[var(--cb-green-soft)] text-[var(--cb-green)] border-[rgba(34,197,94,.24)]',
    red: 'bg-[var(--cb-red-soft)] text-[var(--cb-red)] border-[rgba(255,102,104,.24)]',
    purple: 'bg-[var(--cb-purple-soft)] text-[var(--cb-purple)] border-[rgba(168,85,247,.24)]',
    amber: 'bg-[var(--cb-amber-soft)] text-[var(--cb-amber)] border-[rgba(251,191,36,.24)]',
  } as const;
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' } as const;
  const iconSizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' } as const;
  return <span className={join('inline-flex shrink-0 items-center justify-center rounded-xl border', tones[tone], sizes[size])}><Icon className={iconSizes[size]} /></span>;
}

export function MoneyValue({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={join('font-numeric tabular-nums tracking-tight', className)}>{children}</span>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'positive' | 'negative' | 'warning' | 'neutral' | 'primary' }) {
  const tones = {
    positive: 'bg-[var(--cb-green-soft)] text-[var(--cb-green)]',
    negative: 'bg-[var(--cb-red-soft)] text-[var(--cb-red)]',
    warning: 'bg-[var(--cb-amber-soft)] text-[var(--cb-amber)]',
    primary: 'bg-[var(--cb-blue-soft)] text-[var(--cb-blue)]',
    neutral: 'bg-surface-container-high text-on-surface-variant',
  } as const;
  return <span className={join('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>;
}
'''

header = r'''import { ShieldCheck, Wallet, Undo2, Redo2, LogOut, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {
  onLogout: () => void;
  showLogout?: boolean;
}

export function Header({ onLogout, showLogout = true }: HeaderProps) {
  const { setWalletModalOpen, canUndo, canRedo, handleUndo, handleRedo, balancesVisible, toggleBalancesVisible } = useAppContext();

  return (
    <header data-testid="app-header" className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-outline-variant/35 bg-background/88 px-4 backdrop-blur-xl md:px-6 xl:px-8">
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
        <button onClick={toggleBalancesVisible} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary" title={balancesVisible ? 'Hide balances' : 'Show balances'} aria-label={balancesVisible ? 'Hide balances' : 'Show balances'} data-testid="privacy-toggle">
          {balancesVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
        <button onClick={() => setWalletModalOpen(true)} className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary" title="Wallet Summary" aria-label="Wallet Summary">
          <Wallet className="h-5 w-5" />
        </button>
        {showLogout ? (
          <button onClick={onLogout} className="v35-focus-ring hidden h-10 items-center gap-2 rounded-xl px-3 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error md:flex" title="Sign out" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
            <span className="hidden text-sm font-medium xl:inline">Sign out</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
'''

navigation = r'''import { useEffect, useState } from 'react';
import { Home, ReceiptText, Plus, UsersRound, Menu, WalletCards, Target, LineChart, Settings, Tags, X, ChevronRight } from 'lucide-react';
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

  const moreActive = activeTab === 'settings' || activeTab === 'insights' || (activeTab === 'manage' && manageDestination !== 'Sharing');

  const desktopItems = [
    { key: 'home', label: 'Home', icon: Home, active: activeTab === 'dashboard', action: () => setActiveTab('dashboard') },
    { key: 'activity', label: 'Activity', icon: ReceiptText, active: activeTab === 'activity', action: () => setActiveTab('activity') },
    { key: 'accounts', label: 'Accounts', icon: WalletCards, active: activeTab === 'manage' && manageDestination === 'Accounts', action: () => openManage('Accounts'), group: 'Money' },
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

        <button onClick={() => setMoreOpen(true)} aria-label="More" className={`v35-focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${moreActive ? 'text-primary' : 'text-on-surface-variant'}`}>
          <Menu className="h-[21px] w-[21px]" />
          <span>More</span>
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
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <button className="absolute inset-0 min-h-0 w-full bg-black/60" aria-label="Close More menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-outline-variant/40 bg-surface-container-low p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">More</h2>
                <p className="text-sm text-on-surface-variant">Everything else, without crowding your main navigation.</p>
              </div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="v35-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container">
              {[
                { label: 'Accounts', icon: WalletCards, action: () => openManage('Accounts') },
                { label: 'Categories', icon: Tags, action: () => openManage('Categories') },
                { label: 'Goals', icon: Target, action: () => openManage('Goals') },
                { label: 'Insights', icon: LineChart, action: () => { setMoreOpen(false); setActiveTab('insights'); } },
                { label: 'Settings', icon: Settings, action: () => { setMoreOpen(false); setActiveTab('settings'); } },
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
'''

shell_test = r'''import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
}

test('v3.5 shell exposes intentional mobile and desktop navigation', async ({ page }) => {
  await prepare(page);
  await page.goto('/?tab=dashboard');
  const width = page.viewportSize()?.width ?? 0;

  if (width < 768) {
    await expect(page.getByTestId('mobile-bottom-nav')).toBeVisible();
    await expect(page.getByTestId('desktop-sidebar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add Transaction' })).toBeVisible();

    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'More navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Accounts' }).click();
    await expect(page.getByTestId('page-accounts')).toBeVisible();

    await page.getByRole('button', { name: 'Sharing' }).click();
    await expect(page.getByText('What do you want to do?')).toBeVisible();
  } else {
    await expect(page.getByTestId('desktop-sidebar')).toBeVisible();
    await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden();
    await page.getByRole('button', { name: 'Sharing' }).click();
    await expect(page.getByText('What do you want to do?')).toBeVisible();
    await page.getByRole('button', { name: 'Accounts' }).click();
    await expect(page.getByTestId('page-accounts')).toBeVisible();
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
'''

(ROOT / 'src/v35.css').write_text(v35_css)
(ROOT / 'src/components/ui').mkdir(parents=True, exist_ok=True)
(ROOT / 'src/components/ui/V35.tsx').write_text(v35_ui)
(ROOT / 'src/components/Header.tsx').write_text(header)
(ROOT / 'src/components/Navigation.tsx').write_text(navigation)
(ROOT / 'e2e/v35-shell.spec.ts').write_text(shell_test)

# Load the new design layer after the existing semantic theme so it can intentionally refine it.
main_path = ROOT / 'src/main.tsx'
main = main_path.read_text()
needle = "import './index.css';"
replacement = "import './index.css';\nimport './v35.css';"
if replacement not in main:
    if needle not in main:
        raise SystemExit('main.tsx index.css import marker not found')
    main = main.replace(needle, replacement, 1)
main_path.write_text(main)

# Give the expanded desktop sidebar room while preserving the tablet icon rail.
app_path = ROOT / 'src/App.tsx'
app = app_path.read_text()
old_main = '<main className="pt-20 min-h-screen md:pl-20">'
new_main = '<main className="pt-20 min-h-screen md:pl-20 xl:pl-60">'
if new_main not in app:
    if old_main not in app:
        raise SystemExit('App.tsx main layout marker not found')
    app = app.replace(old_main, new_main, 1)
app_path.write_text(app)

# Let the guided tour choose the visible Add button at each breakpoint.
tour_path = ROOT / 'src/components/ButtonTourOverlay.tsx'
tour = tour_path.read_text()
helper = '''\nfunction findVisibleTourTarget(targetId: string): HTMLElement | null {\n  const elements = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`));\n  return elements.find(element => {\n    const rect = element.getBoundingClientRect();\n    const style = window.getComputedStyle(element);\n    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';\n  }) ?? null;\n}\n'''
marker = "export const TOUR_STEPS: TourStep[] = ["
if 'function findVisibleTourTarget' not in tour:
    if marker not in tour:
        raise SystemExit('ButtonTourOverlay marker not found')
    tour = tour.replace(marker, helper + '\n' + marker, 1)
tour = tour.replace('document.querySelector(`[data-tour-id="${step.targetId}"]`)', 'findVisibleTourTarget(step.targetId)')
tour_path.write_text(tour)

# Make Manage a routable destination for the new shell without duplicating any finance features.
manage_path = ROOT / 'src/components/ManageFinances.tsx'
manage = manage_path.read_text()
old_intro = "export function ManageFinances() {\n  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, personalExpenseRecords, getCurrencySymbol, isDateInCurrentCycle, isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();\n  \n  const [mainTab, setMainTab] = useState<'Accounts' | 'Categories' | 'Sharing'>(() => isManageCategoriesOpen ? 'Categories' : 'Accounts');"
new_intro = "export function ManageFinances() {\n  const { categories, accounts, addCategory, updateCategory, deleteCategory, formatCurrency, transactions, personalExpenseRecords, getCurrencySymbol, isDateInCurrentCycle, isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();\n\n  type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';\n  const requestedDestination = typeof window !== 'undefined' ? sessionStorage.getItem('coinbuddy_manage_destination') as ManageDestination | null : null;\n  const [mainTab, setMainTab] = useState<'Accounts' | 'Categories' | 'Sharing'>(() => isManageCategoriesOpen ? 'Categories' : requestedDestination === 'Sharing' ? 'Sharing' : requestedDestination === 'Categories' || requestedDestination === 'Goals' ? 'Categories' : 'Accounts');"
if new_intro not in manage:
    if old_intro not in manage:
        raise SystemExit('ManageFinances intro marker not found')
    manage = manage.replace(old_intro, new_intro, 1)

old_active = "  const [activeTab, setActiveTab] = useState<'Categories' | 'Goals'>('Categories');"
new_active = "  const [activeTab, setActiveTab] = useState<'Categories' | 'Goals'>(() => requestedDestination === 'Goals' ? 'Goals' : 'Categories');"
if new_active not in manage:
    if old_active not in manage:
        raise SystemExit('ManageFinances active tab marker not found')
    manage = manage.replace(old_active, new_active, 1)

insert_after = "  const [activeTab, setActiveTab] = useState<'Categories' | 'Goals'>(() => requestedDestination === 'Goals' ? 'Goals' : 'Categories');\n"
extra_effects = r'''\n  useEffect(() => {
    const applyDestination = (destination: ManageDestination) => {
      if (destination === 'Sharing') {
        setMainTab('Sharing');
      } else if (destination === 'Accounts') {
        setMainTab('Accounts');
      } else {
        setMainTab('Categories');
        setActiveTab(destination === 'Goals' ? 'Goals' : 'Categories');
      }
    };

    if (requestedDestination) applyDestination(requestedDestination);
    sessionStorage.removeItem('coinbuddy_manage_destination');

    const handleDestination = (event: Event) => {
      const destination = (event as CustomEvent<ManageDestination>).detail;
      if (destination) applyDestination(destination);
    };
    document.addEventListener('coinbuddy:manage-destination', handleDestination);
    return () => document.removeEventListener('coinbuddy:manage-destination', handleDestination);
  }, []);

  useEffect(() => {
    const destination: ManageDestination = mainTab === 'Categories' && activeTab === 'Goals' ? 'Goals' : mainTab;
    sessionStorage.setItem('coinbuddy_current_manage_destination', destination);
    document.dispatchEvent(new CustomEvent<ManageDestination>('coinbuddy:manage-current', { detail: destination }));
  }, [mainTab, activeTab]);
'''
if 'coinbuddy:manage-destination' not in manage:
    manage = manage.replace(insert_after, insert_after + extra_effects, 1)
manage_path.write_text(manage)

print('Applied CoinBuddy V3.5 foundation')
