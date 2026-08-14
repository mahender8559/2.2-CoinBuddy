from pathlib import Path

# ---------------------------------------------------------------------------
# App: switch only the presentation component. The old Insights calculations
# remain available as the Advanced view inside V35Insights.
# ---------------------------------------------------------------------------
app_path = Path('src/App.tsx')
app = app_path.read_text()
app = app.replace("import { Insights } from './components/Insights';\n", "import { V35Insights } from './components/V35Insights';\n")
app = app.replace("{activeTab === 'insights' && <Insights />}", "{activeTab === 'insights' && <V35Insights />}")
app_path.write_text(app)

# ---------------------------------------------------------------------------
# Deep Insights: allow the existing analytics surface to render inside the
# V3.5 Advanced tab without duplicating its page header/planning entry points.
# ---------------------------------------------------------------------------
insights_path = Path('src/components/Insights.tsx')
insights = insights_path.read_text()
insights = insights.replace(
    'export function Insights() {',
    "export function Insights({ embedded = false }: { embedded?: boolean } = {}) {",
    1,
)
insights = insights.replace(
    '<div data-testid="page-insights" className="w-full space-y-8 pb-24 md:pb-0 animate-fade-in">',
    '<div data-testid={embedded ? "advanced-insights-content" : "page-insights"} className="w-full space-y-6 animate-fade-in">',
    1,
)
old_header = '''      {/* Header */}\n      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">\n        <div>\n          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Financial Intelligence</p>\n          <h2 className="text-2xl font-bold text-on-surface">Analytics & Category Trends</h2>\n        </div>\n      </div>\n\n      <UpcomingMoney />\n\n      <AffordabilityPlanner />\n'''
new_header = '''      {!embedded ? (<>\n        <div className="flex flex-col gap-1">\n          <h2 className="text-2xl font-bold text-on-surface">Analytics & Category Trends</h2>\n          <p className="text-sm text-on-surface-variant">Detailed financial analytics and planning tools.</p>\n        </div>\n        <UpcomingMoney />\n        <AffordabilityPlanner />\n      </>) : null}\n'''
if old_header in insights:
    insights = insights.replace(old_header, new_header, 1)
elif new_header not in insights:
    raise SystemExit('Insights header marker not found')
insights_path.write_text(insights)

# ---------------------------------------------------------------------------
# Settings: preserve all existing event handlers/data operations and replace
# only the return markup with one compact V3.5 grouped list surface.
# ---------------------------------------------------------------------------
settings_path = Path('src/components/Settings.tsx')
settings = settings_path.read_text()
start_marker = '  return (\n    <div data-testid="page-settings"'
end_marker = '\n  );\n}\n\nfunction SettingToggle'
start = settings.find(start_marker)
end = settings.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit('Settings return markers not found')

new_return = r'''  return (
    <div data-testid="page-settings" className="w-full space-y-6 pb-24 md:pb-0 animate-fade-in relative">
      {alertConfig.isOpen && (
        <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-label={alertConfig.title} className="v35-surface w-full rounded-t-3xl p-5 shadow-2xl md:max-w-sm md:rounded-2xl md:p-6">
            <h3 className="text-lg font-semibold text-on-surface">{alertConfig.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-on-surface-variant">{alertConfig.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              {alertConfig.isConfirm ? <button onClick={() => setAlertConfig({ ...alertConfig, isOpen: false })} className="v35-focus-ring min-h-10 rounded-xl px-4 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button> : null}
              <button onClick={() => { if (alertConfig.isConfirm && alertConfig.onConfirm) alertConfig.onConfirm(); setAlertConfig({ ...alertConfig, isOpen: false }); }} className={`v35-focus-ring min-h-10 rounded-xl px-4 text-sm font-semibold text-white ${alertConfig.isConfirm ? 'bg-error' : 'bg-primary'}`}>{alertConfig.isConfirm ? 'Confirm' : 'OK'}</button>
            </div>
          </div>
        </div>
      )}

      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setEditProfileOpen(false)} />

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Settings & Manage ⚙️</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Personalize CoinBuddy, protect your data, and manage the ledger tools that support the app.</p>
      </header>

      <section className="v35-surface flex items-center gap-4 rounded-2xl p-4 sm:p-5">
        <button type="button" aria-label="Change profile photo" onClick={() => fileInputRef.current?.click()} className="v35-focus-ring flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/25 bg-primary/10 text-xl font-semibold text-primary">
          {profile?.avatar ? <img src={profile.avatar} alt="Profile" className="h-full w-full object-cover" /> : (profile?.name?.charAt(0) || 'C')}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-on-surface">{profile?.name || 'CoinBuddy User'}</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">Your profile and preferences stay on this device.</p>
        </div>
        <button type="button" aria-label="Edit profile" title="Edit profile" onClick={() => setEditProfileOpen(true)} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-primary"><Edit2 className="h-4 w-4" /></button>
      </section>

      <section>
        <SettingSectionTitle title="Preferences" description="Appearance and core money settings" />
        <div className="v35-surface overflow-hidden rounded-2xl divide-y divide-outline-variant/20">
          <SettingToggle icon={theme === 'dark' ? Moon : Sun} title="Dark Theme" desc="Toggle dark and light appearance" checked={theme === 'dark'} onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />

          <div className="p-4 sm:px-5">
            <div className="flex items-start gap-3">
              <SettingIcon icon={Palette} />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-on-surface">Color Theme</p><p className="mt-0.5 text-xs text-on-surface-variant">Choose the primary accent used across CoinBuddy.</p></div>
            </div>
            <div className="mt-3 flex gap-3 pl-12">
              {[{ id: 'blue', color: 'bg-blue-500' }, { id: 'green', color: 'bg-emerald-500' }, { id: 'purple', color: 'bg-purple-500' }, { id: 'orange', color: 'bg-orange-500' }, { id: 'pink', color: 'bg-pink-500' }].map(item => (
                <button key={item.id} type="button" aria-label={`Use ${item.id} color theme`} aria-pressed={colorPalette === item.id} onClick={() => setColorPalette(item.id)} className={`v35-focus-ring flex h-8 w-8 items-center justify-center rounded-full ${item.color} ${colorPalette === item.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--cb-surface-1)]' : ''}`}>{colorPalette === item.id ? <span className="h-2 w-2 rounded-full bg-white" /> : null}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 sm:px-5">
            <SettingIcon icon={DollarSign} />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-on-surface">Currency</p><p className="mt-0.5 text-xs text-on-surface-variant">Primary display currency</p></div>
            <select aria-label="Currency" value={currency} onChange={event => setCurrency(event.target.value)} className="v35-focus-ring min-h-10 rounded-xl border border-outline-variant/25 bg-surface-container px-3 text-sm text-on-surface"><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option><option value="INR">INR (₹)</option><option value="JPY">JPY (¥)</option></select>
          </div>

          <div className="flex items-center gap-3 p-4 sm:px-5">
            <SettingIcon icon={RefreshCw} />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-on-surface">Month Cycle Date</p><p className="mt-0.5 text-xs text-on-surface-variant">Day when the financial cycle resets</p></div>
            <input aria-label="Month Cycle Date" type="number" min="1" max="31" value={monthCycleDay} onChange={event => { const value = Number.parseInt(event.target.value); if (value >= 1 && value <= 31) setMonthCycleDay(value); }} className="v35-focus-ring w-20 rounded-xl border border-outline-variant/25 bg-surface-container px-3 py-2 text-right font-numeric text-sm text-on-surface" />
          </div>
        </div>
      </section>

      <section>
        <SettingSectionTitle title="Security" description="Protect local access and verify ledger health" />
        <div className="v35-surface overflow-hidden rounded-2xl divide-y divide-outline-variant/20">
          <SettingToggle icon={Lock} title="Passcode Authentication" desc="Unlock CoinBuddy with a 4-digit PIN" checked={Boolean(passcode)} tourId="tour-security-toggle" onChange={() => { if (passcode) setPasscode(null); else setPinModalOpen(true); }} />
          <SettingToggle icon={Fingerprint} title="Biometric Authentication" desc="Use Face ID or fingerprint when supported" checked={biometric} onChange={() => setBiometric(!biometric)} />
          <button type="button" onClick={() => { setBackupInitialAction(undefined); setActiveSubScreen('backup'); }} className="v35-focus-ring flex min-h-[72px] w-full items-center gap-3 p-4 text-left hover:bg-surface-container-high/45 sm:px-5">
            <SettingIcon icon={ShieldCheck} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">Backup & Security</span><span className="mt-0.5 block text-xs text-on-surface-variant">Last backup: {backupInfo.lastBackupDate || 'Never'}</span></span>
            <span className="hidden sm:block">{backupInfo.syncStatus === 'UP_TO_DATE' ? <span className="rounded-lg bg-[var(--cb-green-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--cb-green)]">Up to date</span> : backupInfo.syncStatus === 'FAILED' ? <span className="rounded-lg bg-error/10 px-2 py-1 text-[10px] font-semibold text-error">Failed</span> : <span className="rounded-lg bg-surface-container-high px-2 py-1 text-[10px] font-semibold text-on-surface-variant">{backupInfo.syncStatus === 'PENDING_NETWORK' ? 'Pending network' : 'Not configured'}</span>}</span>
            <ChevronRight className="h-4 w-4 text-on-surface-variant" />
          </button>
          <button type="button" onClick={() => { void handleIntegrityCheck(); }} className="v35-focus-ring flex min-h-[72px] w-full items-center gap-3 p-4 text-left hover:bg-surface-container-high/45 sm:px-5"><SettingIcon icon={ShieldCheck} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">Verify Data Integrity</span><span className="mt-0.5 block text-xs text-on-surface-variant">Audit balances, schedules, sharing, cards, Goals and settings.</span></span><ChevronRight className="h-4 w-4 text-on-surface-variant" /></button>
        </div>
        {integrityReport && !integrityReport.isHealthy ? <div className="mt-3 rounded-2xl border border-[var(--cb-amber)]/25 bg-[var(--cb-amber-soft)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-on-surface">Integrity actions</p><p className="mt-1 text-xs leading-5 text-on-surface-variant">Safe repair only fixes metadata that CoinBuddy can resolve without guessing ledger values.</p></div><button type="button" disabled={repairingIntegrity} onClick={() => { void handleRepairIntegrity(); }} className="v35-focus-ring min-h-10 shrink-0 rounded-xl bg-primary px-4 text-xs font-semibold text-white disabled:opacity-50">{repairingIntegrity ? 'Repairing…' : 'Repair safe issues'}</button></div><div className="mt-3 space-y-1">{integrityReport.issues.slice(0, 5).map(issue => <p key={`${issue.code}:${issue.entityId ?? issue.message}`} className="text-xs text-on-surface-variant">• {issue.message}</p>)}</div></div> : null}
      </section>

      <RecurringPayments />

      <section>
        <SettingSectionTitle title="Data Management" description="Backup, export, demo data and local storage" />
        <div className="v35-surface overflow-hidden rounded-2xl divide-y divide-outline-variant/20">
          <SettingAction icon={FileSpreadsheet} title="Export Excel" desc="Download accounts, transactions and categories as an Excel workbook." onClick={() => { void handleExportExcel(); }} />
          <SettingAction icon={Upload} title="Restore Backup" desc="Restore from encrypted local backup, legacy JSON or Google Drive." onClick={() => { setBackupInitialAction('restore'); setActiveSubScreen('backup'); }} />
          <SettingAction icon={RefreshCw} title="Load demo data" desc="Replace this device's ledger with the realistic CoinBuddy sample." onClick={() => showConfirm('Load Demo Data', 'This replaces the current local CoinBuddy ledger on this device with a realistic v3.4 sample covering accounts, cards, shared household expenses, reimbursements, shared loans, recurring schedules, pending confirmations, Events, Goals, SIPs, affordability and planning. Your passcode and backup/security preferences are preserved. Export or back up real financial data first.', () => resetToDemoData())} />
          <SettingAction icon={Trash2} tone="danger" title="Clear Local Storage" desc="Permanently delete all local ledger data from this device." onClick={() => showConfirm('Clear Storage', 'Are you sure you want to permanently delete all data from this device? All transactions, accounts, schedules, events, categories, and settings will be wiped.', () => { void clearAllData().then(() => showAlert('Storage Cleared', 'All local data has been successfully cleared.')).catch((error: unknown) => showAlert('Clear Failed', getErrorMessage(error, 'Your local data could not be cleared.'))); })} />
        </div>
      </section>

      <section>
        <SettingSectionTitle title="App Help" description="Replay guidance whenever you need it" />
        <div className="v35-surface overflow-hidden rounded-2xl divide-y divide-outline-variant/20">
          <SettingAction icon={Info} title="Feature Walkthrough & Tour" desc="Replay the onboarding walkthrough for core CoinBuddy concepts." onClick={() => setOnboardingOpen(true)} />
          <SettingAction icon={LayoutList} title="Interactive Button Tour" desc="Start the spotlight tour of important action buttons." onClick={() => setButtonTourOpen(true)} />
        </div>
      </section>

      <footer className="flex flex-col items-center gap-1 border-t border-outline-variant/20 pt-5 text-center text-[11px] text-on-surface-variant"><span>CoinBuddy · Local-first financial ledger</span><span className="font-numeric">Build {buildTimeFormatted}</span></footer>

      {isPinModalOpen ? (
        <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div role="dialog" aria-modal="true" aria-label={passcode ? 'Enter New Passcode' : 'Set Passcode'} className="v35-surface w-full rounded-t-3xl p-5 md:max-w-sm md:rounded-2xl md:p-6">
            <h2 className="text-center text-xl font-semibold text-on-surface">{passcode ? 'Enter New Passcode' : 'Set Passcode'}</h2>
            <p className="mt-1 text-center text-sm text-on-surface-variant">Enter a 4-digit PIN</p>
            <div className="my-6 flex justify-center gap-4">{[...Array(4)].map((_, index) => <div key={index} className={`h-3.5 w-3.5 rounded-full border-2 ${tempPin.length > index ? 'border-primary bg-primary' : 'border-outline-variant/50'}`} />)}</div>
            <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-3">{[1,2,3,4,5,6,7,8,9].map(num => <button key={num} onClick={() => { const next = tempPin + num; if (next.length <= 4) setTempPin(next); if (next.length === 4) window.setTimeout(() => { setPasscode(next); setTempPin(''); setPinModalOpen(false); }, 200); }} className="v35-focus-ring mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-xl font-semibold text-on-surface">{num}</button>)}<div/><button onClick={() => { const next = tempPin + '0'; if (next.length <= 4) setTempPin(next); if (next.length === 4) window.setTimeout(() => { setPasscode(next); setTempPin(''); setPinModalOpen(false); }, 200); }} className="v35-focus-ring mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-xl font-semibold text-on-surface">0</button><button onClick={() => setTempPin(value => value.slice(0, -1))} className="v35-focus-ring mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-sm font-semibold text-on-surface-variant">Del</button></div>
            <button onClick={() => { setTempPin(''); setPinModalOpen(false); }} className="v35-focus-ring mt-5 w-full rounded-xl py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}'''

settings = settings[:start] + new_return + settings[end + len('\n  );\n}') :]

# Replace the shared row helper with the V3.5 compact form and add small
# presentation-only helpers. Existing handlers still live in Settings itself.
helper_start = settings.find('function SettingToggle')
if helper_start == -1:
    raise SystemExit('SettingToggle helper marker not found')
settings = settings[:helper_start] + r'''function SettingSectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="mb-2 px-1"><h2 className="text-sm font-semibold text-on-surface">{title}</h2><p className="mt-0.5 text-xs text-on-surface-variant">{description}</p></div>;
}

function SettingIcon({ icon: Icon, danger = false }: { icon: ComponentType<SVGProps<SVGSVGElement>>; danger?: boolean }) {
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}><Icon className="h-4 w-4" /></span>;
}

function SettingToggle({ icon: Icon, title, desc, checked, onChange, tourId }: { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; desc: string; checked: boolean; onChange: () => void; tourId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} data-tour-id={tourId} onClick={onChange} className="v35-focus-ring flex min-h-[72px] w-full items-center gap-3 p-4 text-left hover:bg-surface-container-high/45 sm:px-5">
      <SettingIcon icon={Icon} />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-on-surface">{title}</span><span className="mt-0.5 block text-xs text-on-surface-variant">{desc}</span></span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} /></span>
    </button>
  );
}

function SettingAction({ icon: Icon, title, desc, onClick, tone = 'default' }: { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; desc: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  return <button type="button" onClick={onClick} className={`v35-focus-ring flex min-h-[72px] w-full items-center gap-3 p-4 text-left transition-colors sm:px-5 ${tone === 'danger' ? 'hover:bg-error/8' : 'hover:bg-surface-container-high/45'}`}><SettingIcon icon={Icon} danger={tone === 'danger'} /><span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${tone === 'danger' ? 'text-error' : 'text-on-surface'}`}>{title}</span><span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{desc}</span></span><ChevronRight className={`h-4 w-4 shrink-0 ${tone === 'danger' ? 'text-error/70' : 'text-on-surface-variant'}`} /></button>;
}
'''
settings_path.write_text(settings)

print('Applied V3.5 Insights + Settings presentation milestone')
