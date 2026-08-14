from pathlib import Path

# Mobile follows the locked board: no persistent global header, but desktop keeps it.
header_path = Path('src/components/Header.tsx')
header = header_path.read_text()
header = header.replace(
    'className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between',
    'className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center justify-between md:flex',
    1,
)
header_path.write_text(header)

# Remove the mobile header offset while preserving desktop header/sidebar geometry.
app_path = Path('src/App.tsx')
app = app_path.read_text()
for old in [
    '<main className="pt-20 min-h-screen md:pl-20 xl:pl-60">',
    '<main className="pt-20 min-h-screen md:pl-20">',
]:
    if old in app:
        app = app.replace(old, '<main className="min-h-screen pt-3 md:pl-20 md:pt-20 xl:pl-60">', 1)
        break
app_path.write_text(app)

# Preserve mobile access to functionality removed with the compact header.
nav_path = Path('src/components/Navigation.tsx')
nav = nav_path.read_text()
nav = nav.replace(
    "import { Home, ReceiptText, Plus, UsersRound, Menu, WalletCards, Target, LineChart, Settings, Tags, X, ChevronRight } from 'lucide-react';",
    "import { Home, ReceiptText, Plus, UsersRound, Menu, WalletCards, Target, LineChart, Settings, Tags, X, ChevronRight, Wallet, Eye, EyeOff } from 'lucide-react';",
    1,
)
nav = nav.replace(
    "const { setEditingTransaction, setAddModalOpen } = useAppContext();",
    "const { setEditingTransaction, setAddModalOpen, balancesVisible, toggleBalancesVisible, setWalletModalOpen } = useAppContext();",
    1,
)
settings_row = "                { label: 'Settings', icon: Settings, action: () => { setMoreOpen(false); setActiveTab('settings'); } },"
extra_rows = """                { label: 'Wallet Summary', icon: Wallet, action: () => { setMoreOpen(false); setWalletModalOpen(true); } },
                { label: balancesVisible ? 'Hide balances' : 'Show balances', icon: balancesVisible ? EyeOff : Eye, action: () => { toggleBalancesVisible(); setMoreOpen(false); } },
                { label: 'Settings', icon: Settings, action: () => { setMoreOpen(false); setActiveTab('settings'); } },"""
if 'Wallet Summary' not in nav:
    if settings_row not in nav:
        raise SystemExit('More-menu settings row not found')
    nav = nav.replace(settings_row, extra_rows, 1)
nav_path.write_text(nav)

# Tighten the mobile Dashboard first viewport while retaining the roomy desktop layout.
dash_path = Path('src/components/Dashboard.tsx')
dash = dash_path.read_text()
dash = dash.replace(
    'className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"',
    'className="flex items-start justify-between gap-3"',
    1,
)
dash = dash.replace(
    '            <p className="text-sm font-medium text-primary">Your financial overview</p>\n',
    '',
    1,
)
dash = dash.replace(
    'className="mt-1 text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl"',
    'className="text-xl font-semibold tracking-tight text-on-surface sm:text-3xl"',
    1,
)
dash = dash.replace(
    '<p className="mt-1 text-sm text-on-surface-variant">Here’s what your money looks like right now.</p>',
    '<p className="mt-1 hidden text-sm text-on-surface-variant sm:block">Here’s what your money looks like right now.</p>',
    1,
)
dash = dash.replace(
    '<div className="inline-flex min-h-10 w-fit items-center rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 text-xs font-semibold text-on-surface-variant">\n            {cycleLabel}\n          </div>',
    '<div className="inline-flex min-h-9 shrink-0 items-center rounded-xl border border-outline-variant/40 bg-surface-container-low px-2.5 text-[11px] font-semibold text-on-surface-variant sm:min-h-10 sm:px-3 sm:text-xs">\n            <span className="sm:hidden">{monthCycleDay > 1 ? `Cycle · ${monthCycleDay}` : \'This month\'}</span>\n            <span className="hidden sm:inline">{cycleLabel}</span>\n          </div>',
    1,
)
dash = dash.replace(
    'className="v35-surface overflow-hidden rounded-2xl p-5 sm:p-6"',
    'className="v35-surface overflow-hidden rounded-2xl p-4 sm:p-6"',
    1,
)
dash = dash.replace(
    'className="mt-5 h-48 w-full sm:h-56"',
    'className="mt-3 h-32 w-full sm:mt-5 sm:h-48 xl:h-56"',
    1,
)
dash = dash.replace('className="v35-surface rounded-2xl p-4 sm:p-5"', 'className="v35-surface rounded-2xl p-3.5 sm:p-5"')
dash = dash.replace('className="v35-surface rounded-2xl p-4 sm:p-5" data-tour-id="tour-summary-widgets"', 'className="v35-surface rounded-2xl p-3.5 sm:p-5" data-tour-id="tour-summary-widgets"')
dash = dash.replace('className="mt-3 text-lg font-semibold text-on-surface sm:text-xl"', 'className="mt-2.5 text-base font-semibold text-on-surface sm:mt-3 sm:text-xl"')
dash_path.write_text(dash)

# The shell contract now explicitly verifies that mobile starts with content rather than a global header.
shell_path = Path('e2e/v35-shell.spec.ts')
shell = shell_path.read_text()
mobile_anchor = "    await expect(page.getByTestId('mobile-bottom-nav')).toBeVisible();\n    await expect(page.getByTestId('desktop-sidebar')).toBeHidden();"
mobile_replacement = mobile_anchor + "\n    await expect(page.getByTestId('app-header')).toBeHidden();"
if "getByTestId('app-header')).toBeHidden()" not in shell:
    shell = shell.replace(mobile_anchor, mobile_replacement, 1)
desktop_anchor = "    await expect(page.getByTestId('desktop-sidebar')).toBeVisible();\n    await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden();"
desktop_replacement = desktop_anchor + "\n    await expect(page.getByTestId('app-header')).toBeVisible();"
if "getByTestId('app-header')).toBeVisible()" not in shell:
    shell = shell.replace(desktop_anchor, desktop_replacement, 1)
shell_path.write_text(shell)

print('Refined V3.5 mobile shell and Dashboard fidelity')
