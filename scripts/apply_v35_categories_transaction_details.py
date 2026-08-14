from pathlib import Path

# ---------------------------------------------------------------------------
# Manage becomes composition only. Category CRUD now belongs to the dedicated
# V35CategoriesPanel, while Accounts/Goals/Sharing keep their existing focused
# components. No finance/domain state is reimplemented here.
# ---------------------------------------------------------------------------
manage_path = Path('src/components/ManageFinances.tsx')
manage_path.write_text(r'''import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { V35AccountsPanel } from './V35AccountsPanel';
import { V35CategoriesPanel } from './V35CategoriesPanel';
import { V35GoalsPanel } from './V35GoalsPanel';
import { SharingPanel } from './SharingPanel';

type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';

function requestedManageDestination(): ManageDestination {
  if (typeof window === 'undefined') return 'Accounts';
  const requested = sessionStorage.getItem('coinbuddy_manage_destination') as ManageDestination | null;
  return requested === 'Categories' || requested === 'Sharing' || requested === 'Goals' ? requested : 'Accounts';
}

export function ManageFinances() {
  const { isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();
  const [destination, setDestination] = useState<ManageDestination>(requestedManageDestination);

  useEffect(() => {
    if (!isManageCategoriesOpen) return;
    setDestination('Categories');
    setManageCategoriesOpen(false);
  }, [isManageCategoriesOpen, setManageCategoriesOpen]);

  useEffect(() => {
    const requested = sessionStorage.getItem('coinbuddy_manage_destination') as ManageDestination | null;
    if (requested === 'Accounts' || requested === 'Categories' || requested === 'Sharing' || requested === 'Goals') setDestination(requested);
    sessionStorage.removeItem('coinbuddy_manage_destination');

    const handleDestination = (event: Event) => {
      const next = (event as CustomEvent<ManageDestination>).detail;
      if (next === 'Accounts' || next === 'Categories' || next === 'Sharing' || next === 'Goals') setDestination(next);
    };
    document.addEventListener('coinbuddy:manage-destination', handleDestination);
    return () => document.removeEventListener('coinbuddy:manage-destination', handleDestination);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('coinbuddy_current_manage_destination', destination);
    document.dispatchEvent(new CustomEvent<ManageDestination>('coinbuddy:manage-current', { detail: destination }));
  }, [destination]);

  return (
    <div data-testid="page-manage" className="w-full animate-fade-in pb-safe touch-pan-y">
      {destination === 'Accounts' ? <V35AccountsPanel /> : null}
      {destination === 'Categories' ? <V35CategoriesPanel /> : null}
      {destination === 'Sharing' ? <SharingPanel /> : null}
      {destination === 'Goals' ? <V35GoalsPanel /> : null}
    </div>
  );
}
''')

# ---------------------------------------------------------------------------
# Activity: open a read-first details sheet. Editing remains available from the
# sheet, while ordinary row taps no longer throw users straight into a form.
# ---------------------------------------------------------------------------
activity_path = Path('src/components/Activity.tsx')
activity = activity_path.read_text()
activity = activity.replace(
    "import { isEventAssignableTransaction } from '../domain/eventRules';\n",
    "import { isEventAssignableTransaction } from '../domain/eventRules';\nimport { V35TransactionDetail } from './V35TransactionDetail';\n",
    1,
)
activity = activity.replace(
    'export function Activity() {',
    'export function Activity({ onOpenSharing }: { onOpenSharing?: (transactionId: string) => void }) {',
    1,
)
state_marker = "  const pendingTransactions = useMemo(() => transactions.filter(tx => tx.is_verified === 0), [transactions]);\n"
if "const [detailTransactionId" not in activity:
    if state_marker not in activity:
        raise SystemExit('Activity pending marker not found')
    activity = activity.replace(state_marker, state_marker + "  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null);\n  const detailTransaction = detailTransactionId ? transactions.find(tx => tx.id === detailTransactionId) : undefined;\n", 1)

# Give each transaction row a read-first action while preserving the old edit
# callback as a fallback/secondary action.
row_call_marker = """                    isPending={tx.is_verified === 0}\n                    type={tx.type}\n                    onDelete={tx.isOpeningBalance ? undefined : () => deleteTransaction(tx.id)}\n"""
row_call_replacement = """                    isPending={tx.is_verified === 0}\n                    type={tx.type}\n                    onOpen={() => setDetailTransactionId(tx.id)}\n                    onDelete={tx.isOpeningBalance ? undefined : () => deleteTransaction(tx.id)}\n"""
if row_call_replacement not in activity:
    if row_call_marker not in activity:
        raise SystemExit('Activity transaction row marker not found')
    activity = activity.replace(row_call_marker, row_call_replacement, 1)

# Render details before other Activity overlays.
detail_mount = r'''      {detailTransaction ? (
        <V35TransactionDetail
          transaction={detailTransaction}
          onClose={() => setDetailTransactionId(null)}
          onEdit={detailTransaction.isOpeningBalance ? undefined : () => {
            setEditingTransaction(detailTransaction);
            setDetailTransactionId(null);
            setAddModalOpen(true);
          }}
          onOpenSharing={onOpenSharing ? transactionId => {
            setDetailTransactionId(null);
            onOpenSharing(transactionId);
          } : undefined}
        />
      ) : null}

'''
mount_marker = "{isEventPickerOpen && (\n"
if detail_mount not in activity:
    index = activity.find(mount_marker)
    if index == -1:
        raise SystemExit('Activity overlay mount marker not found')
    activity = activity[:index] + detail_mount + activity[index:]

activity = activity.replace(
    "  onDelete?: () => void;\n  onEdit?: () => void;\n",
    "  onDelete?: () => void;\n  onEdit?: () => void;\n  onOpen?: () => void;\n",
    1,
)
activity = activity.replace(
    "function TransactionRow({ icon: Icon, title, eventName, subtitle, amount, tag, color, isIncome = false, isTransfer = false, isPending = false, type, onDelete, onEdit, isSelectionMode, isSelected, onToggleSelect, onLongPress, tourId }: TransactionRowProps) {",
    "function TransactionRow({ icon: Icon, title, eventName, subtitle, amount, tag, color, isIncome = false, isTransfer = false, isPending = false, type, onDelete, onEdit, onOpen, isSelectionMode, isSelected, onToggleSelect, onLongPress, tourId }: TransactionRowProps) {",
    1,
)
activity = activity.replace(
    "    aria-pressed={isSelectionMode ? isSelected : undefined}\n",
    "    role=\"button\"\n    tabIndex={0}\n    aria-label={`${isSelectionMode ? (isSelected ? 'Deselect' : 'Select') : 'Open transaction'} ${title}`}\n    aria-pressed={isSelectionMode ? isSelected : undefined}\n",
    1,
)
activity = activity.replace(
    "      if (isSelectionMode) onToggleSelect();\n      else if (onEdit) onEdit();\n    }}\n",
    "      if (isSelectionMode) onToggleSelect();\n      else if (onOpen) onOpen();\n      else if (onEdit) onEdit();\n    }}\n    onKeyDown={(event) => {\n      if (event.key !== 'Enter' && event.key !== ' ') return;\n      event.preventDefault();\n      if (isSelectionMode) onToggleSelect();\n      else if (onOpen) onOpen();\n      else if (onEdit) onEdit();\n    }}\n",
    1,
)
activity_path.write_text(activity)

# ---------------------------------------------------------------------------
# App: a UI-only handoff from Transaction Details to the existing Sharing
# workspace. It stores only transient navigation intent; the original ledger
# transaction remains untouched.
# ---------------------------------------------------------------------------
app_path = Path('src/App.tsx')
app = app_path.read_text()
handler_marker = """  const handleTabChange = (tab: Tab) => {\n    if (tab !== activeTab) {\n      window.history.pushState({ tab }, '', `?tab=${tab}`);\n      setActiveTab(tab);\n    }\n  };\n"""
handler_replacement = handler_marker + """\n  const handleOpenSharingForTransaction = (transactionId: string) => {\n    sessionStorage.setItem('coinbuddy_share_transaction_id', transactionId);\n    sessionStorage.setItem('coinbuddy_manage_destination', 'Sharing');\n    handleTabChange('manage');\n  };\n"""
if 'handleOpenSharingForTransaction' not in app:
    if handler_marker not in app:
        raise SystemExit('App tab handler marker not found')
    app = app.replace(handler_marker, handler_replacement, 1)
app = app.replace("{activeTab === 'activity' && <Activity />}", "{activeTab === 'activity' && <Activity onOpenSharing={handleOpenSharingForTransaction} />}", 1)
app_path.write_text(app)

# ---------------------------------------------------------------------------
# Sharing: consume the transient transaction intent once and pre-fill the
# existing Shared Expense form. No new shared-finance logic is introduced.
# ---------------------------------------------------------------------------
sharing_path = Path('src/components/SharingPanel.tsx')
sharing = sharing_path.read_text()
sharing = sharing.replace("import { useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';", 1)
expense_marker = """  const sharedLoans = accounts.filter(account =>\n    account.type === 'liability' && account.is_archived !== 1 && loanSharingRules.some(rule => rule.accountId === account.id && rule.isShared)\n  );\n\n"""
prefill_block = """  const preselectedTransactionId = typeof window !== 'undefined' ? sessionStorage.getItem('coinbuddy_share_transaction_id') ?? '' : '';\n  const preselectedTransaction = expenseTransactions.find(transaction => transaction.id === preselectedTransactionId);\n\n"""
if prefill_block not in sharing:
    if expense_marker not in sharing:
        raise SystemExit('Sharing loans marker not found')
    sharing = sharing.replace(expense_marker, expense_marker + prefill_block, 1)
sharing = sharing.replace("  const [workspace, setWorkspace] = useState<SharingWorkspace>('HOME');", "  const [workspace, setWorkspace] = useState<SharingWorkspace>(() => preselectedTransaction ? 'EXPENSES' : 'HOME');", 1)
sharing = sharing.replace("  const [title, setTitle] = useState('');", "  const [title, setTitle] = useState(() => preselectedTransaction?.title ?? '');", 1)
sharing = sharing.replace("  const [total, setTotal] = useState('');", "  const [total, setTotal] = useState(() => preselectedTransaction ? String(Math.abs(preselectedTransaction.amount)) : '');", 1)
sharing = sharing.replace("  const [categoryId, setCategoryId] = useState('');", "  const [categoryId, setCategoryId] = useState(() => preselectedTransaction?.category ?? '');", 1)
sharing = sharing.replace("  const [dueDate, setDueDate] = useState(todayKey());", "  const [dueDate, setDueDate] = useState(() => preselectedTransaction?.date?.slice(0, 10) || todayKey());", 1)
sharing = sharing.replace("  const [transactionId, setTransactionId] = useState('');", "  const [transactionId, setTransactionId] = useState(() => preselectedTransaction?.id ?? '');", 1)
cleanup_marker = "  const totalNumber = Math.abs(Number(total) || 0);\n"
cleanup_block = """  useEffect(() => {\n    if (preselectedTransactionId) sessionStorage.removeItem('coinbuddy_share_transaction_id');\n  }, [preselectedTransactionId]);\n\n"""
if cleanup_block not in sharing:
    if cleanup_marker not in sharing:
        raise SystemExit('Sharing total marker not found')
    sharing = sharing.replace(cleanup_marker, cleanup_block + cleanup_marker, 1)
sharing_path.write_text(sharing)

# Stable Pie rendering for visual screenshots: avoid a blank mobile chart while
# Recharts is still animating during the screenshot capture.
insights_path = Path('src/components/V35Insights.tsx')
insights = insights_path.read_text()
insights = insights.replace(
    '<Pie data={spendingByCategory.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} strokeWidth={0} paddingAngle={2}>',
    '<Pie data={spendingByCategory.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} strokeWidth={0} paddingAngle={2} isAnimationActive={false}>',
    1,
)
insights_path.write_text(insights)

print('Applied V3.5 Categories + Transaction Details and Sharing prefill')
