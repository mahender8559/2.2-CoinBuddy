from pathlib import Path

exit_sheet = r'''import { LogOut, ShieldCheck, X } from 'lucide-react';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function ExitConfirmSheet({ open, onStay, onExit }: { open: boolean; onStay: () => void; onExit: () => void }) {
  if (!open) return null;

  return (
    <V35ModalFrame size="sm" testId="exit-confirm-sheet" labelledBy="exit-confirm-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LogOut className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="exit-confirm-title" className="text-lg font-semibold text-on-surface">Exit CoinBuddy?</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">You can return to your local ledger anytime.</p>
          </div>
        </div>
        <button type="button" aria-label="Stay in CoinBuddy" onClick={onStay} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cb-green)]" />
          <p className="text-sm leading-6 text-on-surface-variant">
            Leaving CoinBuddy does not delete the financial data already stored on this device. Use Settings → Backup whenever you want a separate recovery copy.
          </p>
        </div>
        <p className="text-xs leading-5 text-on-surface-variant">Choose <strong className="font-semibold text-on-surface">Stay</strong> to keep working, or <strong className="font-semibold text-on-surface">Exit</strong> to leave the app.</p>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-outline-variant/20 bg-surface-container/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onStay} className="v35-focus-ring min-h-11 rounded-xl border border-outline-variant/30 px-4 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high sm:min-w-24">Stay</button>
        <button type="button" onClick={onExit} className="v35-focus-ring min-h-11 rounded-xl bg-error px-5 text-sm font-semibold text-on-error transition-opacity hover:opacity-90 sm:min-w-24">Exit</button>
      </footer>
    </V35ModalFrame>
  );
}
'''

Path('src/components/ExitConfirmSheet.tsx').write_text(exit_sheet)

path = Path('src/App.tsx')
text = path.read_text()

if "./components/ExitConfirmSheet" not in text:
    text = text.replace("import { OnboardingModal } from './components/OnboardingModal';\n", "import { OnboardingModal } from './components/OnboardingModal';\nimport { ExitConfirmSheet } from './components/ExitConfirmSheet';\n", 1)

state_marker = "  const [googleAuth, setGoogleAuth] = useState<{ loading: boolean; authenticated: boolean }>({ loading: true, authenticated: false });\n"
if "const [isExitConfirmOpen" not in text:
    if state_marker not in text:
        raise SystemExit('exit confirmation state marker not found')
    text = text.replace(state_marker, state_marker + "  const [isExitConfirmOpen, setExitConfirmOpen] = useState(false);\n", 1)

old_exit = '''      if (e.state && e.state.exitPrompt) {\n        if (window.confirm('Do you want to exit the app?')) {\n          window.history.back();\n        } else {\n          window.history.pushState({ tab: 'dashboard' }, '', '?tab=dashboard');\n          setActiveTab('dashboard');\n        }\n      } else if (e.state && e.state.tab) {'''
new_exit = '''      if (e.state && e.state.exitPrompt) {\n        // Reinsert a same-document guard while the custom confirmation is open.\n        // This mirrors the blocking behavior of the old native confirm: pressing\n        // Back again cannot silently skip the confirmation and leave the app.\n        window.history.pushState({ exitConfirm: true }, '', '?tab=dashboard');\n        setActiveTab('dashboard');\n        setExitConfirmOpen(true);\n      } else if (e.state && e.state.tab) {'''
if old_exit in text:
    text = text.replace(old_exit, new_exit, 1)
elif "window.confirm('Do you want to exit the app?')" in text:
    raise SystemExit('native exit confirmation shape changed unexpectedly')

handler_marker = "  const [pinEntry, setPinEntry] = useState('');\n"
handlers = '''  const handleStayInApp = () => {\n    setExitConfirmOpen(false);\n    window.history.replaceState({ tab: 'dashboard' }, '', '?tab=dashboard');\n    setActiveTab('dashboard');\n  };\n\n  const handleExitApp = () => {\n    setExitConfirmOpen(false);\n    // Current entry is the temporary exitConfirm guard and the preceding entry\n    // is exitPrompt. Move across both to preserve the old confirmed-exit result.\n    window.history.go(-2);\n  };\n\n'''
if "const handleStayInApp" not in text:
    if handler_marker not in text:
        raise SystemExit('exit confirmation handler marker not found')
    text = text.replace(handler_marker, handlers + handler_marker, 1)

render_marker = "      <OnboardingModal />\n"
if "<ExitConfirmSheet" not in text:
    if render_marker not in text:
        raise SystemExit('exit confirmation render marker not found')
    text = text.replace(render_marker, "      <ExitConfirmSheet open={isExitConfirmOpen} onStay={handleStayInApp} onExit={handleExitApp} />\n" + render_marker, 1)

Path('src/App.tsx').write_text(text)
print('Applied V3.5 in-app exit confirmation and preserved history guard behavior')
