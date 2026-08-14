from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

start = "  if ((biometric || passcode) && !isUnlocked) {\n"
end = "\n  return (\n    <div className=\"min-h-screen bg-background text-on-background selection:bg-primary/30 relative overflow-x-hidden\">"
start_index = text.find(start)
end_index = text.find(end, start_index)
if start_index == -1 or end_index == -1:
    raise SystemExit('Lock-screen markers not found')

replacement = r'''  if ((biometric || passcode) && !isUnlocked) {
    return (
      <div data-testid="locked-app-screen" className="min-h-screen bg-background px-4 py-8 text-on-background sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm items-center justify-center">
          <section className="w-full rounded-[28px] border border-outline-variant/30 bg-surface-container p-5 shadow-xl sm:p-6" aria-labelledby="locked-app-title">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Local vault</p>
                <h1 id="locked-app-title" className="mt-1 text-2xl font-semibold tracking-tight text-on-surface">CoinBuddy is locked</h1>
                <p className="mt-1.5 text-sm leading-6 text-on-surface-variant">Authenticate to open the financial ledger stored on this device.</p>
              </div>
            </div>

            {passcode && (
              <div className="mt-7">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-on-surface">Enter your 4-digit PIN</p>
                  <div aria-label={`${pinEntry.length} of 4 PIN digits entered`} className="flex gap-2">
                    {[...Array(4)].map((_, index) => (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                          pinError
                            ? 'border-error bg-error'
                            : pinEntry.length > index
                              ? 'border-primary bg-primary'
                              : 'border-outline-variant/50 bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2.5" aria-label="PIN keypad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                      key={num}
                      type="button"
                      aria-label={`PIN digit ${num}`}
                      onClick={() => {
                        if (pinEntry.length < 4) setPinEntry(previous => previous + num);
                      }}
                      className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-low text-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                    >
                      {num}
                    </button>
                  ))}
                  <div aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="PIN digit 0"
                    onClick={() => {
                      if (pinEntry.length < 4) setPinEntry(previous => previous + '0');
                    }}
                    className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-low text-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    aria-label="Delete PIN digit"
                    onClick={() => setPinEntry(previous => previous.slice(0, -1))}
                    className="v35-focus-ring flex min-h-12 items-center justify-center rounded-xl border border-outline-variant/25 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                  >
                    Delete
                  </button>
                </div>
                {pinError && <p role="alert" className="mt-3 text-center text-sm font-medium text-error">Incorrect PIN. Try again.</p>}
              </div>
            )}

            {biometric && (
              <div className={`${passcode ? 'mt-5 border-t border-outline-variant/20 pt-5' : 'mt-7'}`}>
                <button
                  type="button"
                  onClick={() => void handleBiometricUnlock()}
                  className="v35-focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <Fingerprint className="h-5 w-5" />
                  {passcode ? 'Use Biometrics' : 'Unlock with Biometrics'}
                </button>
              </div>
            )}

            {biometricError && <p role="alert" className="mt-3 rounded-xl border border-error/25 bg-error/10 px-3 py-2.5 text-sm leading-5 text-error">{biometricError}</p>}

            <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-surface-container-low px-3.5 py-3 text-xs leading-5 text-on-surface-variant">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cb-green)]" />
              <span>Your live ledger remains local to this device while CoinBuddy is locked.</span>
            </div>
          </section>
        </div>
      </div>
    );
  }
'''

text = text[:start_index] + replacement + text[end_index:]
path.write_text(text)
print('Applied V3.5 compact lock screen without changing passcode or biometric logic')
