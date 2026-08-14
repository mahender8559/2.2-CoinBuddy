from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Add Transaction: preserve every ledger/validation field, but move the form
# into the V3.5 mobile sheet / desktop dialog shell and tighten visual density.
# ---------------------------------------------------------------------------
path = Path('src/components/AddTransactionModal.tsx')
text = path.read_text()
if "./ui/V35ModalFrame" not in text:
    text = text.replace("import { CurrencyInput } from './CurrencyInput';\n", "import { CurrencyInput } from './CurrencyInput';\nimport { V35ModalFrame } from './ui/V35ModalFrame';\n", 1)
text = replace_once(
    text,
    '''  return (\n    <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-slide-up pb-safe">\n      <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">''',
    '''  return (\n    <V35ModalFrame size="lg" testId="transaction-form-sheet">\n      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/30 px-5 py-4 sm:px-6">''',
    'AddTransaction shell',
)
text = text.replace(
    '<div className="flex items-center gap-2">\n          <ShieldCheck className="w-6 h-6 text-primary" />\n          <h2 className="text-xl font-bold text-on-surface">',
    '<div className="flex min-w-0 items-center gap-3">\n          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>\n          <h2 className="truncate text-lg font-semibold text-on-surface sm:text-xl">',
    1,
)
text = text.replace(
    '''        <button \n          onClick={() => {\n            setAddModalOpen(false);\n            setEditingTransaction(null);\n          }}\n          className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"\n        >\n          <Layers className="w-5 h-5" />\n        </button>''',
    '''        <button\n          type="button"\n          aria-label="Close transaction form"\n          onClick={() => {\n            setAddModalOpen(false);\n            setEditingTransaction(null);\n          }}\n          className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"\n        >\n          <X className="h-5 w-5" />\n        </button>''',
    1,
)
text = text.replace('<div className="flex-1 overflow-y-auto">', '<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">', 1)
text = text.replace('<form onSubmit={handleSubmit} className="p-4 space-y-6 max-w-2xl mx-auto">', '<form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-5 p-5 sm:p-6">', 1)
text = text.replace('<div className="flex flex-col items-center justify-center py-6">', '<div className="flex flex-col items-center justify-center py-4">', 1)
text = text.replace('className="pt-4 flex gap-3"', 'className="sticky bottom-0 z-10 -mx-5 flex gap-3 border-t border-outline-variant/20 bg-surface-container/95 px-5 pb-1 pt-4 backdrop-blur sm:-mx-6 sm:px-6"', 1)
text = text.replace('className="flex-[2] bg-primary hover:bg-primary/90 text-on-primary font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-lg"', 'className="v35-focus-ring flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"', 1)
text = text.replace('className="flex-1 bg-surface-variant hover:bg-surface-variant/80 text-on-surface-variant font-bold py-4 rounded-2xl transition-colors flex items-center justify-center text-lg"', 'className="v35-focus-ring flex min-h-12 flex-1 items-center justify-center rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"', 1)
text = replace_once(
    text,
    '''        </form>\n      </div>\n    </div>\n  );''',
    '''        </form>\n      </div>\n    </V35ModalFrame>\n  );''',
    'AddTransaction close',
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Add Account: same business form, now a responsive sheet with stacked mobile
# field grids. This is especially important for long loan/shared-loan forms.
# ---------------------------------------------------------------------------
path = Path('src/components/AddAccountModal.tsx')
text = path.read_text()
if "./ui/V35ModalFrame" not in text:
    text = text.replace("import { CurrencyInput } from './CurrencyInput';\n", "import { CurrencyInput } from './CurrencyInput';\nimport { V35ModalFrame } from './ui/V35ModalFrame';\n", 1)
text = replace_once(
    text,
    '''  return (\n    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-background/80 backdrop-blur-sm p-3 sm:px-4 overflow-y-auto">\n      <div className="bg-surface-container rounded-3xl w-full max-w-md p-4 sm:p-6 border border-outline-variant/30 shadow-2xl animate-fade-in relative modal-scroll my-auto">''',
    '''  return (\n    <V35ModalFrame size="md" testId="account-form-sheet" panelClassName="overflow-y-auto p-5 sm:p-6">''',
    'AddAccount shell',
)
text = text.replace('className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"', 'className="v35-focus-ring absolute right-4 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:top-4"', 1)
text = text.replace('className="flex items-center justify-between mb-6"', 'className="mb-5 flex min-h-10 items-center justify-between gap-3 pr-11"', 1)
text = text.replace('className="text-xl font-bold text-on-surface"', 'className="text-lg font-semibold text-on-surface sm:text-xl"', 1)
text = text.replace('className="grid grid-cols-2 gap-4"', 'className="grid grid-cols-1 gap-4 sm:grid-cols-2"')
text = text.replace('className="grid grid-cols-3 gap-2.5 pt-1"', 'className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3"')
text = text.replace('className="w-full bg-primary hover:bg-primary/90 text-on-primary font-bold py-3.5 rounded-xl transition-colors mt-2"', 'className="v35-focus-ring mt-2 min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"', 1)
text = replace_once(
    text,
    '''        </form>\n      </div>\n    </div>\n  );''',
    '''        </form>\n    </V35ModalFrame>\n  );''',
    'AddAccount close',
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Pay Down: keep the amortization/payment engine intact; normalize the shell,
# reduce decorative glow, and stack principal/interest inputs on narrow phones.
# ---------------------------------------------------------------------------
path = Path('src/components/PayCardModal.tsx')
text = path.read_text()
if "./ui/V35ModalFrame" not in text:
    insert_after = "import { CurrencyInput } from './CurrencyInput';\n"
    if insert_after not in text:
        raise SystemExit('PayCard import marker not found')
    text = text.replace(insert_after, insert_after + "import { V35ModalFrame } from './ui/V35ModalFrame';\n", 1)
text = replace_once(
    text,
    '''  return (\n    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-3 sm:p-4">\n      <div data-testid="pay-modal" className="bg-surface-container rounded-3xl w-full max-w-md p-4 sm:p-6 border border-outline-variant/30 shadow-2xl animate-fade-in relative overflow-hidden my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">''',
    '''  return (\n    <V35ModalFrame size="md" testId="pay-modal" panelClassName="overflow-y-auto p-5 sm:p-6">''',
    'PayCard shell',
)
text = text.replace('className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"', 'className="v35-focus-ring absolute right-4 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:top-4"', 1)
text = text.replace('className="flex items-center gap-3 mb-5"', 'className="mb-5 flex items-center gap-3 pr-11"', 1)
text = text.replace('className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500"', 'className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cb-green-soft)] text-[var(--cb-green)]"', 1)
text = text.replace('<CreditCard className="w-6 h-6" />', '<CreditCard className="h-5 w-5" />', 1)
text = text.replace('<h2 className="text-xl font-bold text-on-surface">', '<h2 className="text-lg font-semibold text-on-surface sm:text-xl">', 1)
text = text.replace('className="grid grid-cols-2 gap-3"', 'className="grid grid-cols-1 gap-3 sm:grid-cols-2"')
text = text.replace('className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 mt-2"', 'className="v35-focus-ring mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cb-green)] px-4 text-sm font-semibold text-white transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"', 1)
text = replace_once(
    text,
    '''        />\n      </div>\n    </div>\n  );''',
    '''        />\n    </V35ModalFrame>\n  );''',
    'PayCard close',
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Reconcile: compact, task-first sheet. Calculations and guardrails stay exact.
# ---------------------------------------------------------------------------
path = Path('src/components/ReconcileWizard.tsx')
text = path.read_text()
if "./ui/V35ModalFrame" not in text:
    text = text.replace("import { CurrencyInput } from './CurrencyInput';\n", "import { CurrencyInput } from './CurrencyInput';\nimport { V35ModalFrame } from './ui/V35ModalFrame';\n", 1)
text = replace_once(
    text,
    '''  return <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">\n    <div className="w-full max-w-md rounded-3xl bg-surface-container p-6 shadow-2xl border border-outline-variant/30">''',
    '''  return <V35ModalFrame size="sm" testId="reconcile-sheet" panelClassName="p-5 sm:p-6">''',
    'Reconcile shell',
)
text = text.replace('<button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high"><X className="w-5 h-5" /></button>', '<button type="button" aria-label="Close reconciliation" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><X className="h-5 w-5" /></button>', 1)
text = text.replace('<h2 className="text-xl font-bold text-on-surface">{label}</h2>', '<h2 className="text-lg font-semibold text-on-surface sm:text-xl">{label}</h2>', 1)
text = text.replace('className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"', 'className="v35-focus-ring mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"', 1)
text = replace_once(text, '''    </div>\n  </div>;''', '''  </V35ModalFrame>;''', 'Reconcile close')
path.write_text(text)


# ---------------------------------------------------------------------------
# Floating-rate revision: keep schedule math unchanged but share the V3.5 shell
# and make two-column input sections responsive.
# ---------------------------------------------------------------------------
path = Path('src/components/UpdateLoanRateModal.tsx')
text = path.read_text()
if "./ui/V35ModalFrame" not in text:
    marker = "import { motion, AnimatePresence } from 'motion/react';\n"
    if marker not in text:
        raise SystemExit('UpdateLoanRate import marker not found')
    text = text.replace(marker, marker + "import { V35ModalFrame } from './ui/V35ModalFrame';\n", 1)
text = replace_once(
    text,
    '''  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">\n      <div className="bg-surface-container border border-outline-variant/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-on-surface">''',
    '''  return (\n    <V35ModalFrame size="lg" testId="loan-rate-sheet" panelClassName="space-y-5 overflow-y-auto p-5 text-on-surface sm:p-6">''',
    'UpdateLoanRate shell',
)
text = text.replace('className="flex items-center justify-between border-b border-outline-variant/20 pb-4"', 'className="flex items-start justify-between gap-3 border-b border-outline-variant/20 pb-4 pr-1"', 1)
text = text.replace('className="text-lg font-bold"', 'className="text-lg font-semibold"', 1)
text = text.replace('className="grid grid-cols-2 gap-3.5"', 'className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"')
text = text.replace('className="pt-2 flex items-center justify-end gap-3"', 'className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end"', 1)
text = text.replace('className="px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest rounded-xl text-xs font-semibold text-on-surface-variant transition-colors"', 'className="v35-focus-ring min-h-11 rounded-xl border border-outline-variant/30 px-4 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high sm:min-w-24"', 1)
text = text.replace('className="px-5 py-2.5 bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"', 'className="v35-focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"', 1)
text = replace_once(text, '''        </form>\n      </div>\n    </div>\n  );''', '''        </form>\n    </V35ModalFrame>\n  );''', 'UpdateLoanRate close')
path.write_text(text)


# ---------------------------------------------------------------------------
# Wallet Summary retains its animated metrics but follows the same sheet frame
# and removes the older decorative glow/gradient-heavy card treatment.
# ---------------------------------------------------------------------------
path = Path('src/components/WalletSummaryModal.tsx')
text = path.read_text()
if 'data-testid="wallet-summary-sheet"' not in text:
    text = text.replace(
        '<div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md px-4">',
        '<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">',
        1,
    )
    text = text.replace(
        'className="bg-surface-container rounded-3xl w-full max-w-lg p-6 border border-outline-variant/30 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col"',
        'data-testid="wallet-summary-sheet" role="dialog" aria-modal="true" className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-outline-variant/35 bg-surface-container p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-6"',
        1,
    )
    text = text.replace('          {/* Header background glow */}\n          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />\n          \n', '          <div aria-hidden="true" className="mx-auto -mt-3 mb-3 h-1 w-10 shrink-0 rounded-full bg-outline-variant/55 sm:hidden" />\n', 1)
    text = text.replace('            className="absolute right-4 top-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors z-10"', '            aria-label="Close wallet summary"\n            className="v35-focus-ring absolute right-4 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:top-4"', 1)
    text = text.replace('className="flex items-center gap-3 mb-6 shrink-0"', 'className="mb-5 flex shrink-0 items-center gap-3 pr-11"', 1)
    text = text.replace('className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary"', 'className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"', 1)
    text = text.replace('<Wallet className="w-6 h-6" />', '<Wallet className="h-5 w-5" />', 1)
    text = text.replace('<h2 className="text-xl font-bold text-on-surface">Wallet Summary</h2>', '<h2 className="text-lg font-semibold text-on-surface sm:text-xl">Wallet Summary</h2>', 1)
    text = text.replace('className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex items-center justify-between shadow-sm"', 'className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4"', 1)
    text = text.replace('className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 flex items-center justify-between shadow-sm"', 'className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4"', 1)
    text = text.replace('className="p-4 rounded-2xl bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 flex items-center justify-between shadow-sm"', 'className="flex items-center justify-between rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4"', 1)
path.write_text(text)

print('Applied V3.5 forms and modal system')
