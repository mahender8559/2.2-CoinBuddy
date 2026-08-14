from pathlib import Path

path = Path('src/components/Activity.tsx')
text = path.read_text()

text = text.replace(
    "import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft, ArrowUpDown, Layers } from 'lucide-react';",
    "import { Search, Filter, ShieldCheck, Sparkles, Database, Utensils, Banknote, Car, Briefcase, ShoppingBag, Plus, Zap, Home, Trash2, Check, X, ArrowRightLeft, ArrowUpDown, Layers, ChevronDown } from 'lucide-react';",
    1,
)

state_marker = "  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);\n"
if "isPendingPanelOpen" not in text:
    if state_marker not in text:
        raise SystemExit('Activity filter panel state marker not found')
    text = text.replace(state_marker, state_marker + "  const [isPendingPanelOpen, setIsPendingPanelOpen] = useState(false);\n", 1)

old = r'''      {pendingTransactions.length > 0 && (
        <section className="v35-surface overflow-hidden rounded-2xl border-[rgba(251,191,36,.20)]">
          <div className="border-b border-outline-variant/20 px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--cb-amber)]">Needs confirmation</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">Scheduled items affect balances only after you confirm them.</p>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {pendingTransactions.map(tx => (
              <div key={tx.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <span className="min-w-0 text-sm font-medium text-on-surface">{tx.title} · <span className="font-numeric">{formatCurrency(tx.amount)}</span></span>
                <input aria-label={`Confirmation date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={event => setApprovalDates(previous => ({ ...previous, [tx.id]: event.target.value }))} className="rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm" />
                <button className="rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary" onClick={() => {
                  const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));
                  setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));
                }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>
                <button className="rounded-xl border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>
                {approvalErrors[tx.id] ? <span role="alert" className="text-xs font-medium text-error sm:col-span-4">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}
'''

new = r'''      {pendingTransactions.length > 0 && (
        <section className="v35-surface overflow-hidden rounded-2xl border-[rgba(251,191,36,.20)]">
          <button
            type="button"
            aria-expanded={isPendingPanelOpen}
            aria-controls="pending-confirmations"
            onClick={() => setIsPendingPanelOpen(current => !current)}
            className="v35-focus-ring flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cb-amber-soft)] text-[var(--cb-amber)]">
              <Check className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                Needs confirmation
                <span className="rounded-full bg-[var(--cb-amber-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--cb-amber)]">{pendingTransactions.length}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-on-surface-variant">Scheduled items are waiting for your confirmation.</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${isPendingPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {isPendingPanelOpen ? (
            <div id="pending-confirmations" className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
              {pendingTransactions.map(tx => (
                <div key={tx.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                  <span className="min-w-0 text-sm font-medium text-on-surface">{tx.title} · <span className="font-numeric">{formatCurrency(tx.amount)}</span></span>
                  <input aria-label={`Confirmation date for ${tx.title}`} type="date" value={approvalDates[tx.id] ?? tx.date.slice(0, 10)} onChange={event => setApprovalDates(previous => ({ ...previous, [tx.id]: event.target.value }))} className="rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-sm" />
                  <button className="rounded-xl bg-primary px-3 text-xs font-semibold text-on-primary" onClick={() => {
                    const outcome = approveTransaction(tx.id, approvalDates[tx.id] ?? tx.date.slice(0, 10));
                    setApprovalErrors(previous => ({ ...previous, [tx.id]: outcome.success ? '' : (outcome.error || 'This scheduled transaction cannot be confirmed yet.') }));
                  }}>{tx.type === 'income' ? 'Received ✓' : tx.type === 'expense' ? 'Paid ✓' : 'Transferred ✓'}</button>
                  <button className="rounded-xl border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant" onClick={() => { rejectTransaction(tx.id); setApprovalErrors(previous => ({ ...previous, [tx.id]: '' })); }}>Skip</button>
                  {approvalErrors[tx.id] ? <span role="alert" className="text-xs font-medium text-error sm:col-span-4">{approvalErrors[tx.id]} The item remains pending until it can be confirmed.</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}
'''

if new not in text:
    if old not in text:
        raise SystemExit('Activity pending confirmation block not found')
    text = text.replace(old, new, 1)

path.write_text(text)
print('Refined V3.5 Activity pending confirmation density')
