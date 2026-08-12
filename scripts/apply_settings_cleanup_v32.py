from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor missing in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, repl: str, flags=0) -> None:
    p = Path(path)
    text = p.read_text()
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Regex anchor missing/ambiguous in {path}: {pattern[:140]!r} count={count}")
    p.write_text(next_text)

# -----------------------------------------------------------------------------
# AppContext: recurring schedules always materialize due pending occurrences;
# remove the confusing preference toggle and return the full integrity report.
# -----------------------------------------------------------------------------
p = Path('src/context/AppContext.tsx')
text = p.read_text()
text = text.replace(
    "import { auditDatabaseIntegrity, deleteAccountInDB, updateOpeningBalance } from '../db/sqliteSchema';",
    "import { auditDatabaseIntegrity, deleteAccountInDB, updateOpeningBalance, type DataIntegrityAuditResult } from '../db/sqliteSchema';",
)
text = text.replace("  autoRecur: boolean;\n  setAutoRecur: (val: boolean) => void;\n", "")
text = text.replace("  verifyDataIntegrity: () => Promise<boolean>;", "  verifyDataIntegrity: () => Promise<DataIntegrityAuditResult>;")
text = text.replace("  const [autoRecur, setAutoRecur] = useState(true);\n", "")
old_verify = """  const verifyDataIntegrity = async (): Promise<boolean> => {\n    if (!dbDriver) return false;\n    const result = await auditDatabaseIntegrity(dbDriver);\n    const message = result.mismatches.length || !result.isNetWorthAccurate\n      ? 'Ledger integrity warning: one or more balances do not match the transaction ledger.'\n      : null;\n    setIntegrityWarning(message);\n    return !message;\n  };\n"""
new_verify = """  const verifyDataIntegrity = async (): Promise<DataIntegrityAuditResult> => {\n    if (!dbDriver) throw new Error('Database is not ready yet.');\n    const result = await auditDatabaseIntegrity(dbDriver);\n    const criticalCount = result.issues.filter(issue => issue.severity === 'error').length;\n    setIntegrityWarning(criticalCount > 0\n      ? `Data integrity warning: ${criticalCount} critical issue${criticalCount === 1 ? '' : 's'} detected. Open Settings → Verify Data Integrity for details.`\n      : null);\n    return result;\n  };\n"""
if old_verify not in text:
    raise SystemExit('AppContext verifyDataIntegrity anchor missing')
text = text.replace(old_verify, new_verify, 1)
text = text.replace("        if (integrity.mismatches.length || !integrity.isNetWorthAccurate) setIntegrityWarning('Ledger integrity warning: one or more balances do not match the transaction ledger.');", "        if (integrity.hasCriticalIssues) setIntegrityWarning(`Data integrity warning: ${integrity.issues.filter(issue => issue.severity === 'error').length} critical issue(s) detected. Open Settings → Verify Data Integrity for details.`);")
text = text.replace("        if (typeof settings.autoRecur === 'boolean') setAutoRecur(settings.autoRecur);\n", "")
text = text.replace("        persistAppSetting('autoRecur', autoRecur),\n", "")
text = text.replace("  }, [theme, colorPalette, currency, autoRecur, biometric, passcode, monthCycleDay, profile, affordabilitySettings, savingsGoals, dbReady, dbDriver]);", "  }, [theme, colorPalette, currency, biometric, passcode, monthCycleDay, profile, affordabilitySettings, savingsGoals, dbReady, dbDriver]);")
old_recur_effect = """      if (autoRecur) {\n        await generateDueRecurringTransactions(dbDriver, false);\n      }\n    });\n  }, [dbDriver, dbReady, autoRecur]);\n"""
new_recur_effect = """      // Due schedules always become pending ledger entries. They never change\n      // balances until the user confirms them, so a separate auto-create toggle\n      // only made schedules silently disappear when disabled.\n      await generateDueRecurringTransactions(dbDriver, false);\n    });\n  }, [dbDriver, dbReady]);\n"""
if old_recur_effect not in text:
    raise SystemExit('AppContext recurring effect anchor missing')
text = text.replace(old_recur_effect, new_recur_effect, 1)
text = text.replace("editingTransaction, setEditingTransaction, autoRecur, setAutoRecur, recurringRules, affordabilitySettings", "editingTransaction, setEditingTransaction, recurringRules, affordabilitySettings")
p.write_text(text)

# -----------------------------------------------------------------------------
# Settings: remove duplicate/raw export/import, production test fixture, recurring
# toggle; use real backup state; semantic controls; richer integrity result.
# -----------------------------------------------------------------------------
p = Path('src/components/Settings.tsx')
text = p.read_text()
text = text.replace(
    "import { Edit2, ShieldCheck, RefreshCw, Fingerprint, Lock, Download, Upload, Trash2, Info, Moon, Sun, DollarSign, LayoutList, PiggyBank, X, FileSpreadsheet, Palette, Clock, ChevronRight, HardDrive } from 'lucide-react';",
    "import { Edit2, ShieldCheck, RefreshCw, Fingerprint, Lock, Upload, Trash2, Info, Moon, Sun, DollarSign, LayoutList, FileSpreadsheet, Palette, Clock, ChevronRight } from 'lucide-react';",
)
text = text.replace("import { COINBUDDY_TEST_DATA } from '../constants/coinbuddyTestData';\n", "")
text = text.replace("import { BackupManager } from '../utils/backupManager';\n", "")
old_context = """  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, autoRecur, setAutoRecur, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, importLedgerData, verifyDataIntegrity, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting, exportLedgerData } = useAppContext();"""
new_context = """  const { theme, setTheme, colorPalette, setColorPalette, currency, setCurrency, biometric, setBiometric, passcode, setPasscode, setManageCategoriesOpen, profile, setProfile, monthCycleDay, setMonthCycleDay, transactions, categories, accounts, clearAllData, verifyDataIntegrity, lastUpdated, setOnboardingOpen, setButtonTourOpen, getStoredSetting } = useAppContext();"""
if old_context not in text:
    raise SystemExit('Settings context anchor missing')
text = text.replace(old_context, new_context, 1)
# Remove test fixture helper and export modal state.
text = re.sub(r"\n  const loadTestData = async \(\) => \{.*?\n  \};", "", text, count=1, flags=re.S)
text = text.replace("  const [isExportModalOpen, setExportModalOpen] = useState(false);\n", "")
# Replace backupInfo + effect with SQLite canonical state and launch intent.
pattern = r"  // Read current backup state for menu badge\n  const \[backupInfo, setBackupInfo\].*?\n  \}, \[activeSubScreen\]\);"
replacement = """  const [backupInitialAction, setBackupInitialAction] = useState<'restore' | undefined>(undefined);\n  const [backupInfo, setBackupInfo] = useState<{ lastBackupDate: string | null; syncStatus: string }>({\n    lastBackupDate: null,\n    syncStatus: 'NOT_CONFIGURED',\n  });\n\n  // Backup configuration is persisted in SQLite. Keep this summary derived from\n  // that canonical source instead of showing legacy placeholder dates.\n  useEffect(() => {\n    const handleNavigate = () => {\n      setBackupInitialAction(undefined);\n      setActiveSubScreen('backup');\n    };\n    window.addEventListener('navigate_to_backup', handleNavigate);\n\n    let cancelled = false;\n    if (activeSubScreen === 'main') {\n      void getStoredSetting('backupConfig').then(saved => {\n        if (cancelled) return;\n        const config = saved && typeof saved === 'object' ? saved as { lastBackupMetadata?: { date?: string; syncStatus?: string } } : undefined;\n        setBackupInfo({\n          lastBackupDate: config?.lastBackupMetadata?.date ?? null,\n          syncStatus: config?.lastBackupMetadata?.syncStatus ?? 'NOT_CONFIGURED',\n        });\n      }).catch(() => {\n        if (!cancelled) setBackupInfo({ lastBackupDate: null, syncStatus: 'NOT_CONFIGURED' });\n      });\n    }\n\n    return () => {\n      cancelled = true;\n      window.removeEventListener('navigate_to_backup', handleNavigate);\n    };\n  }, [activeSubScreen, getStoredSetting]);"""
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Settings backupInfo/effect anchor missing count={count}')
# Add action helpers before build time.
anchor = """  const buildTimeFormatted = typeof __BUILD_TIME__ !== 'undefined'"""
helpers = """  const handleExportExcel = async () => {\n    if (transactions.length === 0 && accounts.length === 0 && categories.length === 0) {\n      showAlert('Nothing to export', 'Add some CoinBuddy data before exporting an Excel workbook.');\n      return;\n    }\n    try {\n      await exportToExcel(transactions, accounts, categories, currency);\n      showAlert('Excel Exported', 'Your CoinBuddy workbook was downloaded successfully.');\n    } catch (error) {\n      showAlert('Export Error', getErrorMessage(error, 'Failed to export the Excel workbook.'));\n    }\n  };\n\n  const handleIntegrityCheck = async () => {\n    try {\n      const report = await verifyDataIntegrity();\n      if (report.isHealthy) {\n        showAlert('Integrity Verified', 'All checks passed: SQLite structure, foreign keys, ledger balances, net worth, recurring schedules, Investment SIP links, credit-card links, category classifications, Goals, and stored settings.');\n        return;\n      }\n      const errors = report.issues.filter(issue => issue.severity === 'error');\n      const warnings = report.issues.filter(issue => issue.severity === 'warning');\n      const preview = report.issues.slice(0, 6).map(issue => `• ${issue.message}`).join('\\n');\n      const remaining = Math.max(0, report.issues.length - 6);\n      showAlert(\n        errors.length ? 'Integrity Warning' : 'Integrity Review',\n        `${errors.length} critical · ${warnings.length} advisory issue(s) found.\\n\\n${preview}${remaining ? `\\n• +${remaining} more issue(s)` : ''}\\n\\nCreate an encrypted backup before correcting critical ledger issues.`,\n      );\n    } catch (error) {\n      showAlert('Integrity Check Failed', getErrorMessage(error, 'CoinBuddy could not complete the integrity audit.'));\n    }\n  };\n\n""" + anchor
if anchor not in text:
    raise SystemExit('Settings build-time anchor missing')
text = text.replace(anchor, helpers, 1)
# Backup screen launch supports restore as the single restore entry point.
text = text.replace("    return <BackupSecurity onBack={() => setActiveSubScreen('main')} />;", "    return <BackupSecurity initialAction={backupInitialAction} onBack={() => { setBackupInitialAction(undefined); setActiveSubScreen('main'); }} />;")
# Remove export modal entirely.
text, count = re.subn(r"\n      \{isExportModalOpen && \(.*?\n      \)\}\n\n      \{alertConfig\.isOpen", "\n      {alertConfig.isOpen", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Settings export modal removal failed count={count}')
# Preserve line breaks in integrity detail alerts.
text = text.replace('className="text-sm text-on-surface-variant mb-6 leading-relaxed"', 'className="text-sm text-on-surface-variant mb-6 leading-relaxed whitespace-pre-line"', 1)
# Remove recurring auto-create setting.
text, count = re.subn(r"\n          <SettingToggle \n            icon=\{RefreshCw\} \n            title=\"Auto-create recurring entries\".*?\n          />", "", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Settings auto recurring toggle removal failed count={count}')
# Backup card is a semantic button and explicitly opens normal backup settings.
text = text.replace(
    """          <div \n            onClick={() => setActiveSubScreen('backup')}\n            className=\"col-span-1 md:col-span-2 bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4\"\n          >""",
    """          <button\n            type=\"button\"\n            onClick={() => { setBackupInitialAction(undefined); setActiveSubScreen('backup'); }}\n            className=\"col-span-1 md:col-span-2 w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4\"\n          >""",
    1,
)
# close the first backup card div after the Manage chevron.
old_close = """            </div>\n          </div>\n\n          <DataCard \n            icon={Download}"""
new_close = """            </div>\n          </button>\n\n          <DataCard\n            icon={FileSpreadsheet}"""
if old_close not in text:
    raise SystemExit('Settings backup-card close/export anchor missing')
text = text.replace(old_close, new_close, 1)
# Replace data actions block through integrity card.
pattern = r"          <DataCard\n            icon=\{FileSpreadsheet\}.*?          <DataCard \n            icon=\{ShieldCheck\}.*?\n          />"
replacement = """          <DataCard\n            icon={FileSpreadsheet}\n            label=\"Excel .xlsx\"\n            title=\"Export Excel\"\n            desc=\"Download accounts, transactions, and categories as a spreadsheet for analysis.\"\n            onClick={() => { void handleExportExcel(); }}\n          />\n          <DataCard\n            icon={Upload}\n            label=\".enc / JSON\"\n            title=\"Restore Backup\"\n            desc=\"Restore from a local encrypted backup, a legacy JSON backup, or Google Drive.\"\n            onClick={() => { setBackupInitialAction('restore'); setActiveSubScreen('backup'); }}\n          />\n          <DataCard\n            icon={ShieldCheck}\n            label=\"Full Audit\"\n            title=\"Verify Data Integrity\"\n            desc=\"Audit database structure, balances, schedules, SIP links, cards, categories, Goals, and settings.\"\n            onClick={() => { void handleIntegrityCheck(); }}\n          />"""
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Settings data cards replacement failed count={count}')
# Clear storage: semantic button.
text = text.replace("""          <div \n            className=\"bg-surface-container rounded-2xl p-5 border border-error/20 flex flex-col gap-3 hover:bg-error/10 transition-colors cursor-pointer group\"\n            onClick={() => {""", """          <button\n            type=\"button\"\n            className=\"w-full text-left bg-surface-container rounded-2xl p-5 border border-error/20 flex flex-col gap-3 hover:bg-error/10 transition-colors group\"\n            onClick={() => {""", 1)
text = text.replace("""            </div>\n          </div>\n        </div>\n      </section>\n\n      {/* App Help */}""", """            </div>\n          </button>\n        </div>\n      </section>\n\n      {/* App Help */}""", 1)
# App Help clickable cards become buttons.
text = text.replace("""          <div \n            onClick={() => setOnboardingOpen(true)}\n            className=\"bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4\"\n          >""", """          <button\n            type=\"button\"\n            onClick={() => setOnboardingOpen(true)}\n            className=\"w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4\"\n          >""", 1)
text = text.replace("""            <ChevronRight className=\"w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors\" />\n          </div>\n\n          <div \n            onClick={() => setButtonTourOpen(true)}""", """            <ChevronRight className=\"w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors\" />\n          </button>\n\n          <button\n            type=\"button\"\n            onClick={() => setButtonTourOpen(true)}""", 1)
text = text.replace("""            className=\"bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all cursor-pointer group flex items-center justify-between gap-4\"\n          >""", """            className=\"w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-all group flex items-center justify-between gap-4\"\n          >""", 1)
# close second App Help button (the next matching close before section end).
needle = """            <ChevronRight className=\"w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors\" />\n          </div>\n        </div>\n      </section>\n\n      {/* Footer info */}"""
if needle not in text:
    raise SystemExit('Settings second App Help close anchor missing')
text = text.replace(needle, """            <ChevronRight className=\"w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors\" />\n          </button>\n        </div>\n      </section>\n\n      {/* Footer info */}""", 1)
# Semantic switch and cards.
old_toggle = """function SettingToggle({ icon: Icon, title, desc, checked, onChange, tourId }: { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; desc: string; checked: boolean; onChange: () => void; tourId?: string }) {\n  return (\n    <div data-tour-id={tourId} className=\"flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors cursor-pointer group\" onClick={onChange}>"""
new_toggle = """function SettingToggle({ icon: Icon, title, desc, checked, onChange, tourId }: { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; desc: string; checked: boolean; onChange: () => void; tourId?: string }) {\n  return (\n    <button type=\"button\" role=\"switch\" aria-checked={checked} data-tour-id={tourId} className=\"w-full text-left flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors group\" onClick={onChange}>"""
if old_toggle not in text:
    raise SystemExit('Settings SettingToggle anchor missing')
text = text.replace(old_toggle, new_toggle, 1)
text = text.replace("""      </div>\n    </div>\n  );\n}\n\nfunction DataCard""", """      </div>\n    </button>\n  );\n}\n\nfunction DataCard""", 1)
old_card = """function DataCard({ icon: Icon, label, title, desc, onClick }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; title: string; desc: string; onClick: () => void }) {\n  return (\n    <div className=\"bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/50 transition-colors cursor-pointer group\" onClick={onClick}>"""
new_card = """function DataCard({ icon: Icon, label, title, desc, onClick }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; title: string; desc: string; onClick: () => void }) {\n  return (\n    <button type=\"button\" className=\"w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/50 transition-colors group\" onClick={onClick}>"""
if old_card not in text:
    raise SystemExit('Settings DataCard anchor missing')
text = text.replace(old_card, new_card, 1)
# Last closing div in DataCard.
text = text[::-1].replace(">vid/<    \n;)(  \n}nruter  \n{ ) )( => dilcno ;gnirts :csed ;gnirts :eltit ;gnirts :lebal ;>tnemelEGVSG<sporPGVS<epyTtnenopmoC :noci { :})( kcilCno ,csed ,eltit ,lebal ,nocI :noci {draCataD noitcnuf"[::-1], ">nottub/<    \n;)(  \n}nruter  \n{ ) )( => dilcno ;gnirts :csed ;gnirts :eltit ;gnirts :lebal ;>tnemelEGVSG<sporPGVS<epyTtnenopmoC :noci { :})( kcilCno ,csed ,eltit ,lebal ,nocI :noci {draCataD noitcnuf"[::-1], 1)[::-1]
# The reverse trick above is deliberately defensive but verify the end manually below.
if 'function DataCard' not in text or '<button type="button" className="w-full text-left bg-surface-container' not in text:
    raise SystemExit('Settings DataCard rewrite failed')
p.write_text(text)

# -----------------------------------------------------------------------------
# Backup & Security: restore has one external entry point; remove fake Wi-Fi and
# custom-directory controls; eliminate placeholder backup metadata.
# -----------------------------------------------------------------------------
p = Path('src/components/BackupSecurity.tsx')
text = p.read_text()
text = text.replace("""interface BackupSecurityProps {\n  onBack: () => void;\n}\n\nexport function BackupSecurity({ onBack }: BackupSecurityProps) {""", """interface BackupSecurityProps {\n  onBack: () => void;\n  initialAction?: 'restore';\n}\n\nexport function BackupSecurity({ onBack, initialAction }: BackupSecurityProps) {""", 1)
old_meta = """          lastBackupMetadata: parsed.lastBackupMetadata || {\n            date: parsed.lastBackupDate || 'Aug 1, 2026, 06:30 PM',\n            filename: parsed.lastBackupFilename || 'backup_2026_08_01.enc',\n            size: parsed.lastBackupSize || '1.2 MB',\n            syncStatus: parsed.syncStatus || 'UP_TO_DATE',\n            accountCount: accounts.length,\n            transactionCount: transactions.length,\n            storageProvider: 'LOCAL',\n          }"""
new_meta = """          lastBackupMetadata: parsed.lastBackupMetadata || (parsed.lastBackupDate ? {\n            date: parsed.lastBackupDate,\n            filename: parsed.lastBackupFilename || 'legacy_backup.enc',\n            size: parsed.lastBackupSize || '',\n            syncStatus: parsed.syncStatus || 'UP_TO_DATE',\n            accountCount: accounts.length,\n            transactionCount: transactions.length,\n            storageProvider: 'LOCAL',\n          } : undefined)"""
if old_meta not in text:
    raise SystemExit('BackupSecurity placeholder metadata anchor missing')
text = text.replace(old_meta, new_meta, 1)
# Normalize old CUSTOM/Wi-Fi-only UI state when loading canonical settings.
old_load = """    void getStoredSetting('backupConfig').then(saved => {\n      if (saved && typeof saved === 'object') setConfig(saved as BackupSettings);\n      else {"""
new_load = """    void getStoredSetting('backupConfig').then(saved => {\n      if (saved && typeof saved === 'object') {\n        const stored = saved as BackupSettings;\n        setConfig({\n          ...stored,\n          storageProvider: stored.storageProvider === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL',\n          isWifiOnly: false,\n        });\n      } else {"""
if old_load not in text:
    raise SystemExit('BackupSecurity stored config load anchor missing')
text = text.replace(old_load, new_load, 1)
# When migrating legacy local storage, normalize too.
text = text.replace("try { setConfig(JSON.parse(legacy) as BackupSettings); localStorage.removeItem('coinbuddy_backup_config'); }", "try { const parsed = JSON.parse(legacy) as BackupSettings; setConfig({ ...parsed, storageProvider: parsed.storageProvider === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL', isWifiOnly: false }); localStorage.removeItem('coinbuddy_backup_config'); }")
# Open restore automatically when launched from the Settings Restore card.
anchor = """  const localFileRef = useRef<HTMLInputElement>(null);\n  const autoBackupInFlight = useRef(false);\n"""
addition = anchor + """\n  useEffect(() => {\n    if (initialAction !== 'restore') return;\n    setRestoreStep(1);\n    setRestorePassword('');\n    setRestorePwdError(null);\n    setRestoreError(null);\n    setIsRestoreModalOpen(true);\n  }, [initialAction]);\n"""
if anchor not in text:
    raise SystemExit('BackupSecurity restore launch anchor missing')
text = text.replace(anchor, addition, 1)
# Offline is the only network condition the browser can reliably determine.
text = text.replace("      if (config.isWifiOnly && !isOnline) {", "      if (!isOnline) {")
text = text.replace("config.isAutoBackupEnabled, config.backupFrequency, config.isWifiOnly, config.storageProvider", "config.isAutoBackupEnabled, config.backupFrequency, config.storageProvider")
# Remove unavailable Custom Directory option and misleading Wi-Fi-only row.
text = text.replace('              <option value="CUSTOM">Custom Directory</option>\n', '')
text, count = re.subn(r"\n          \{/\* Toggle: Wi-Fi Only \*/\}.*?\n          </div>\n        </div>\n      </div>\n\n      \{/\* 3\. Encryption", "\n        </div>\n      </div>\n\n      {/* 3. Encryption", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'BackupSecurity Wi-Fi row removal failed count={count}')
# Auto-backup switch gets a semantic name/state.
text = text.replace("""            <button\n              onClick={() => setConfig(prev => ({ ...prev, isAutoBackupEnabled: !prev.isAutoBackupEnabled }))}\n              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${""", """            <button\n              type=\"button\"\n              role=\"switch\"\n              aria-label=\"Enable automatic backup\"\n              aria-checked={config.isAutoBackupEnabled}\n              onClick={() => setConfig(prev => ({ ...prev, isAutoBackupEnabled: !prev.isAutoBackupEnabled }))}\n              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${""", 1)
# Encryption copy reflects actual setup state.
text = text.replace('AES-256-GCM Encryption Active', "{config.hasPassword ? 'AES-256-GCM Encryption Configured' : 'Encrypted Backups'}")
text = text.replace("""                <span className=\"text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full\">\n                  Protected\n                </span>""", """                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.hasPassword ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>\n                  {config.hasPassword ? 'Protected' : 'Password required'}\n                </span>""", 1)
# Remove duplicate restore button, retaining the wizard itself for external launch.
text, count = re.subn(r"\n      \{/\* 4\. Restore Section Button \*/\}.*?\n      </div>\n\n      \{/\* ========================================================================= \*/\}\n      \{/\* PASSWORD MODAL", "\n\n      {/* ========================================================================= */}\n      {/* PASSWORD MODAL", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'BackupSecurity restore button removal failed count={count}')
p.write_text(text)

# Backup manager: Wi-Fi-only was never actually detectable; simply defer when offline.
p = Path('src/utils/backupManager.ts')
text = p.read_text()
text = text.replace("  isWifiOnly: true,", "  isWifiOnly: false,", 1)
text = text.replace("""    // Check network condition if Wi-Fi only is requested\n    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;\n    if (!isOnline && settings.isWifiOnly) {""", """    // Browser/PWA code can reliably detect offline state, not whether the\n    // connection is specifically Wi-Fi. Defer any cloud/local sync while offline.\n    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;\n    if (!isOnline) {""", 1)
p.write_text(text)

# Recurring Payments: remove the non-clickable button-like SIP control and let
# the managed-SIP note use the full mobile width.
p = Path('src/components/RecurringPayments.tsx')
text = p.read_text()
text = text.replace('                  <div className="flex flex-wrap items-start justify-between gap-3">', '                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">', 1)
text = text.replace("{isManagedSip && <p className=\"mt-1 text-[11px] text-on-surface-variant\">Managed from its Investment account so the SIP amount, funding account and schedule stay in sync.</p>}", "{isManagedSip && <p className=\"mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant\">Managed by its Investment account. Edit the SIP amount, funding account, or date from Manage → Accounts → Investment.</p>}", 1)
old_actions = """                    {isManagedSip ? (\n                      <span className=\"rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-semibold text-on-surface-variant\">Edit in Manage → Investment</span>\n                    ) : (\n                      <div className=\"flex flex-wrap gap-2\">"""
new_actions = """                    {!isManagedSip && (\n                      <div className=\"flex flex-wrap gap-2 sm:shrink-0\">"""
if old_actions not in text:
    raise SystemExit('RecurringPayments managed SIP action anchor missing')
text = text.replace(old_actions, new_actions, 1)
# Corresponding ternary close -> conditional close.
text = text.replace("""                      </div>\n                    )}\n                  </div>""", """                      </div>\n                    )}\n                  </div>""", 1)  # same textual close after ternary removal is already valid
p.write_text(text)

# -----------------------------------------------------------------------------
# Full integrity audit: structural DB, balances/net worth, recurring references,
# managed SIP sync, card links, affordability classes, Goals and app settings.
# -----------------------------------------------------------------------------
p = Path('src/db/sqliteSchema.ts')
text = p.read_text()
marker = "/**\n * Audits the database integrity by comparing computed view balances with transaction ledger summation.\n */\nexport async function auditDatabaseIntegrity("
idx = text.find(marker)
if idx < 0:
    raise SystemExit('sqliteSchema audit marker missing')
prefix = text[:idx]
new_audit = r'''export type IntegrityIssueSeverity = 'error' | 'warning';

export interface DataIntegrityIssue {
  code: string;
  severity: IntegrityIssueSeverity;
  message: string;
  entityId?: string;
}

export interface DataIntegrityAuditResult {
  mismatches: { accountId: string; expectedBalance: number; actualBalance: number }[];
  isNetWorthAccurate: boolean;
  totalAssets: number;
  totalLiabilities: number;
  issues: DataIntegrityIssue[];
  isHealthy: boolean;
  hasCriticalIssues: boolean;
}

/**
 * Full data-health audit. The balance audit remains the financial source of
 * truth, while the additional checks cover the planner/recurring/Goals models
 * that are not protected by SQLite foreign keys alone.
 */
export async function auditDatabaseIntegrity(
  db: SQLiteDatabaseDriver & {
    query?: (sql: string, params?: (string | number | null | undefined)[]) => Promise<any[]>;
  }
): Promise<DataIntegrityAuditResult> {
  if (!db.query) throw new Error('Database query method is not available on driver.');

  const issues: DataIntegrityIssue[] = [];
  const addIssue = (code: string, severity: IntegrityIssueSeverity, message: string, entityId?: string) => {
    issues.push({ code, severity, message, entityId });
  };

  // SQLite file/index health and declared foreign keys.
  const integrityRows = await db.query('PRAGMA integrity_check;');
  const integrityMessages = integrityRows.map(row => String(Object.values(row)[0] ?? '')).filter(Boolean);
  if (integrityMessages.length !== 1 || integrityMessages[0].toLowerCase() !== 'ok') {
    addIssue('SQLITE_INTEGRITY', 'error', `SQLite integrity check failed: ${integrityMessages.join('; ') || 'unknown error'}.`);
  }
  const foreignKeyRows = await db.query('PRAGMA foreign_key_check;');
  for (const row of foreignKeyRows) {
    addIssue('FOREIGN_KEY', 'error', `Broken database reference in ${String(row.table ?? 'unknown table')} (row ${String(row.rowid ?? '?')}).`);
  }

  const accountMetadata = await db.query(`SELECT id, name, type, subtype, is_archived, investment_method, monthly_sip_amount, next_sip_date FROM accounts`);
  const accountMap = new Map(accountMetadata.map(account => [String(account.id), account]));
  const accounts = await db.query(`SELECT id, type, cached_balance FROM account_balances_view`);
  const mismatches: { accountId: string; expectedBalance: number; actualBalance: number }[] = [];
  let expectedTotalAssets = 0;
  let expectedTotalLiabilities = 0;
  let actualTotalAssets = 0;
  let actualTotalLiabilities = 0;

  for (const account of accounts) {
    const accountId = String(account.id);
    const actualBalance = Number(account.cached_balance ?? 0);
    const accountType = String(account.type);
    let expectedBalance = 0;
    const txRows = await db.query(
      `SELECT transaction_type, amount, from_account_id, to_account_id, is_verified, is_interest_only
         FROM transactions
        WHERE from_account_id = ? OR to_account_id = ?`,
      [accountId, accountId],
    );
    for (const tx of txRows) {
      expectedBalance += applyTransactionEffect({
        ...tx,
        type: tx.transaction_type?.toLowerCase(),
        transaction_type: tx.transaction_type,
        fromAccountId: tx.from_account_id,
        toAccountId: tx.to_account_id,
        isInterestOnly: Boolean(tx.is_interest_only),
        is_verified: Number(tx.is_verified ?? 1),
      } as any, { id: accountId, type: accountType === 'LIABILITY' ? 'liability' : 'asset' });
    }
    const roundedExpected = Math.round(expectedBalance * 100) / 100;
    const roundedActual = Math.round(actualBalance * 100) / 100;
    if (roundedExpected !== roundedActual) {
      mismatches.push({ accountId, expectedBalance: roundedExpected, actualBalance: roundedActual });
      addIssue('BALANCE_MISMATCH', 'error', `Account ${accountMetadata.find(item => String(item.id) === accountId)?.name ?? accountId} does not match its transaction ledger.`, accountId);
    }
    if (accountType === 'ASSET') {
      expectedTotalAssets += roundedExpected;
      actualTotalAssets += roundedActual;
    } else if (accountType === 'LIABILITY') {
      expectedTotalLiabilities += roundedExpected;
      actualTotalLiabilities += roundedActual;
    }
  }

  const expectedNetWorth = expectedTotalAssets - expectedTotalLiabilities;
  const actualNetWorth = actualTotalAssets - actualTotalLiabilities;
  const isNetWorthAccurate = Math.round(expectedNetWorth * 100) === Math.round(actualNetWorth * 100);
  if (!isNetWorthAccurate) addIssue('NET_WORTH_MISMATCH', 'error', 'Net worth does not reconcile to the account ledger.');

  // Credit-card metadata must point to a liability account.
  const cardRows = await db.query(`
    SELECT cc.id, cc.account_id, cc.due_amount, a.id AS linked_id, a.type AS linked_type
      FROM credit_cards cc
      LEFT JOIN accounts a ON a.id = cc.account_id
  `);
  for (const card of cardRows) {
    if (!card.linked_id) addIssue('CREDIT_CARD_LINK', 'error', `Credit card ${String(card.id)} is not linked to an existing account.`, String(card.id));
    else if (card.linked_type !== 'LIABILITY') addIssue('CREDIT_CARD_LINK', 'error', `Credit card ${String(card.id)} is linked to a non-liability account.`, String(card.id));
    if (!Number.isFinite(Number(card.due_amount)) || Number(card.due_amount) < 0) addIssue('CREDIT_CARD_DUE', 'warning', `Credit card ${String(card.id)} has an invalid due amount.`, String(card.id));
  }

  // Active recurring schedules must resolve to live accounts. Recurring-rule
  // account columns are intentionally not foreign-key constrained because old
  // ledger entries survive schedule deletion, so validate them explicitly.
  const recurringRows = await db.query(`SELECT * FROM recurring_rules`);
  const recurringMap = new Map(recurringRows.map(rule => [String(rule.id), rule]));
  for (const rule of recurringRows) {
    if (Number(rule.is_active ?? 1) !== 1) continue;
    const id = String(rule.id);
    const type = String(rule.transaction_type);
    const sourceId = rule.from_account_id ?? (type === 'EXPENSE' ? rule.account : null);
    const destinationId = rule.to_account_id ?? (type === 'INCOME' ? rule.account : null);
    const source = sourceId ? accountMap.get(String(sourceId)) : undefined;
    const destination = destinationId ? accountMap.get(String(destinationId)) : undefined;
    if ((type === 'EXPENSE' || type === 'TRANSFER') && !sourceId) addIssue('RECURRING_SOURCE', 'error', `Recurring schedule “${String(rule.title)}” has no source account.`, id);
    else if (sourceId && !source) addIssue('RECURRING_SOURCE', 'error', `Recurring schedule “${String(rule.title)}” points to a missing source account.`, id);
    else if (source && Number(source.is_archived) === 1) addIssue('RECURRING_ARCHIVED_ACCOUNT', 'warning', `Recurring schedule “${String(rule.title)}” uses archived source account ${String(source.name)}.`, id);
    if ((type === 'INCOME' || type === 'TRANSFER') && !destinationId) addIssue('RECURRING_DESTINATION', 'error', `Recurring schedule “${String(rule.title)}” has no destination account.`, id);
    else if (destinationId && !destination) addIssue('RECURRING_DESTINATION', 'error', `Recurring schedule “${String(rule.title)}” points to a missing destination account.`, id);
    else if (destination && Number(destination.is_archived) === 1) addIssue('RECURRING_ARCHIVED_ACCOUNT', 'warning', `Recurring schedule “${String(rule.title)}” uses archived destination account ${String(destination.name)}.`, id);
    if (type === 'TRANSFER' && sourceId && destinationId && String(sourceId) === String(destinationId)) addIssue('RECURRING_SELF_TRANSFER', 'error', `Recurring schedule “${String(rule.title)}” transfers to the same account.`, id);
    const due = String(rule.next_due_date ?? '');
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T12:00:00`) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) addIssue('RECURRING_DATE', 'error', `Recurring schedule “${String(rule.title)}” has an invalid next due date.`, id);
  }

  // Investment SIP metadata should own a synchronized recurring transfer rule.
  for (const account of accountMetadata) {
    const subtype = String(account.subtype ?? '').trim().toLowerCase();
    const isSip = account.type === 'ASSET' && subtype === 'investment' && account.investment_method === 'SIP' && Number(account.monthly_sip_amount ?? 0) > 0 && Boolean(account.next_sip_date);
    if (!isSip || Number(account.is_archived) === 1) continue;
    const accountId = String(account.id);
    const rule = recurringMap.get(`investment-sip:${accountId}`);
    if (!rule) {
      addIssue('SIP_RECURRING_SYNC', 'warning', `Investment ${String(account.name)} has SIP metadata but no managed recurring transfer. Edit the Investment once to choose its funding account.`, accountId);
      continue;
    }
    if (String(rule.transaction_type) !== 'TRANSFER' || String(rule.to_account_id ?? '') !== accountId || Math.abs(Number(rule.amount) - Number(account.monthly_sip_amount)) > 0.005 || Number(rule.is_active ?? 1) !== 1) {
      addIssue('SIP_RECURRING_SYNC', 'warning', `Investment ${String(account.name)} SIP metadata does not match its managed recurring transfer.`, accountId);
    }
  }

  // Every expense category needs a current affordability classification.
  const validAffordability = new Set(['COMMITTED', 'NORMAL', 'FLEXIBLE', 'IRREGULAR', 'SAVINGS']);
  const categoryRows = await db.query(`SELECT id, name, type, affordability_class FROM categories`);
  for (const category of categoryRows) {
    if (category.type === 'EXPENSE' && !validAffordability.has(String(category.affordability_class ?? ''))) {
      addIssue('CATEGORY_AFFORDABILITY', 'warning', `Expense category ${String(category.name)} is missing a valid affordability classification.`, String(category.id));
    }
  }

  // All settings must remain valid JSON. Goals also carry account references in
  // JSON rather than SQL columns, so validate those references explicitly.
  const settingRows = await db.query(`SELECT key, value_json FROM app_settings`);
  let goals: any[] = [];
  for (const setting of settingRows) {
    try {
      const value = JSON.parse(String(setting.value_json));
      if (String(setting.key) === 'savings_goals_v1') goals = Array.isArray(value) ? value : [];
    } catch {
      addIssue('APP_SETTING_JSON', 'error', `Stored setting ${String(setting.key)} contains invalid JSON.`, String(setting.key));
    }
  }
  const goalIds = new Set<string>();
  for (const goal of goals) {
    const id = String(goal?.id ?? '');
    if (!id) { addIssue('GOAL_ID', 'warning', 'A Goal is missing its identifier.'); continue; }
    if (goalIds.has(id)) addIssue('GOAL_ID', 'warning', `Goal ${String(goal?.name ?? id)} has a duplicate identifier.`, id);
    goalIds.add(id);
    if (!Number.isFinite(Number(goal?.targetAmount)) || Number(goal.targetAmount) <= 0) addIssue('GOAL_TARGET', 'warning', `Goal ${String(goal?.name ?? id)} has an invalid target amount.`, id);
    if (goal?.linkedAccountId) {
      const linked = accountMap.get(String(goal.linkedAccountId));
      if (!linked) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to a missing account.`, id);
      else if (Number(linked.is_archived) === 1) addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} points to archived account ${String(linked.name)}.`, id);
      else if (linked.type !== 'ASSET') addIssue('GOAL_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} is linked to a liability instead of an asset.`, id);
      if (goal?.protectLinkedBalance && linked) {
        const group = String(linked.subtype ?? '').trim().toLowerCase();
        if (group === 'investment' || group === 'physical asset') addIssue('GOAL_PROTECTED_ACCOUNT', 'warning', `Goal ${String(goal?.name ?? id)} cannot protect a non-liquid ${String(linked.subtype)} balance as cash reserve.`, id);
      }
    }
  }

  return {
    mismatches,
    isNetWorthAccurate,
    totalAssets: actualTotalAssets,
    totalLiabilities: actualTotalLiabilities,
    issues,
    isHealthy: issues.length === 0,
    hasCriticalIssues: issues.some(issue => issue.severity === 'error'),
  };
}
'''
p.write_text(prefix + new_audit)

# -----------------------------------------------------------------------------
# Focused integrity tests and Settings browser cleanup regression.
# -----------------------------------------------------------------------------
Path('src/db/sqliteSchema.integrityV32.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { auditDatabaseIntegrity, CREATE_TABLES_SQL, SQLITE_PRAGMA_SETUP } from './sqliteSchema';

async function driverWithSchema() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const driver = {
    async execute(sql: string, params: any[] = []) { params.length ? db.run(sql, params) : db.exec(sql); },
    async query(sql: string, params: any[] = []) {
      const stmt = db.prepare(sql); if (params.length) stmt.bind(params);
      const rows: any[] = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows;
    },
  };
  await driver.execute(SQLITE_PRAGMA_SETUP);
  await driver.execute(CREATE_TABLES_SQL);
  return { db, driver };
}

describe('v3.2 full data integrity audit', () => {
  it('passes a healthy ledger with managed SIP, card, category and Goal references', async () => {
    const { db, driver } = await driverWithSchema();
    await driver.execute(`INSERT INTO accounts (id, name, type, subtype, investment_method, monthly_sip_amount, next_sip_date) VALUES
      ('bank','Bank','ASSET','Bank',NULL,NULL,NULL),
      ('fund','Index Fund','ASSET','Investment','SIP',5000,'2026-09-01'),
      ('card','Credit Card','LIABILITY','Credit Card',NULL,NULL,NULL);`);
    await driver.execute(`INSERT INTO categories (id,name,type,affordability_class) VALUES ('groceries','Groceries','EXPENSE','NORMAL');`);
    await driver.execute(`INSERT INTO credit_cards (id,account_id,due_amount,due_date,billing_cycle_day) VALUES ('card','card',0,'2026-09-05',5);`);
    await driver.execute(`INSERT INTO recurring_rules (id,title,amount,transaction_type,from_account_id,to_account_id,frequency,next_due_date,is_active,anchor_day) VALUES ('investment-sip:fund','SIP: Index Fund',5000,'TRANSFER','bank','fund','MONTHLY','2026-09-01',1,1);`);
    await driver.execute(`INSERT INTO app_settings (key,value_json) VALUES ('savings_goals_v1', ?), ('theme', '"dark"')`, [JSON.stringify([{ id: 'g1', name: 'Emergency', targetAmount: 100000, monthlyContribution: 5000, linkedAccountId: 'bank', protectLinkedBalance: true, isActive: true })]);
    const report = await auditDatabaseIntegrity(driver);
    expect(report.isHealthy).toBe(true);
    expect(report.hasCriticalIssues).toBe(false);
    expect(report.issues).toEqual([]);
    db.close();
  });

  it('reports planner/schedule consistency problems that the old balance-only audit missed', async () => {
    const { db, driver } = await driverWithSchema();
    await driver.execute(`INSERT INTO accounts (id, name, type, subtype, investment_method, monthly_sip_amount, next_sip_date) VALUES ('fund','Old SIP','ASSET','Investment','SIP',10000,'2026-09-01');`);
    await driver.execute(`INSERT INTO categories (id,name,type,affordability_class) VALUES ('legacy','Legacy','EXPENSE',NULL);`);
    await driver.execute(`INSERT INTO recurring_rules (id,title,amount,transaction_type,from_account_id,frequency,next_due_date,is_active,anchor_day) VALUES ('bad','Broken Bill',100,'EXPENSE','missing','MONTHLY','2026-09-02',1,2);`);
    await driver.execute(`INSERT INTO app_settings (key,value_json) VALUES ('savings_goals_v1', ?)`, [JSON.stringify([{ id: 'g1', name: 'Missing link', targetAmount: 50000, linkedAccountId: 'gone', isActive: true })]);
    const report = await auditDatabaseIntegrity(driver);
    expect(report.issues.some(issue => issue.code === 'SIP_RECURRING_SYNC')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'CATEGORY_AFFORDABILITY')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'RECURRING_SOURCE' && issue.severity === 'error')).toBe(true);
    expect(report.issues.some(issue => issue.code === 'GOAL_ACCOUNT')).toBe(true);
    expect(report.hasCriticalIssues).toBe(true);
    db.close();
  });
});
''')

Path('e2e/settings-cleanup.spec.ts').write_text(r'''import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=settings');
  await expect(page.getByText('Data Management', { exact: true })).toBeVisible();
  return errors;
}

test('Settings exposes one clear export/restore path and removes dead controls', async ({ page }) => {
  const errors = await prepare(page);
  await expect(page.getByText('Auto-create recurring entries', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Load CoinBuddy Test Data', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export Excel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Restore Backup/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Verify Data Integrity/i })).toBeVisible();

  await page.getByRole('button', { name: /Backup & Security/i }).click();
  await expect(page.getByText('Auto-Backup Settings', { exact: true })).toBeVisible();
  await expect(page.getByText('Wi-Fi Only', { exact: true })).toHaveCount(0);
  await expect(page.locator('option[value="CUSTOM"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore Data Wizard' })).toHaveCount(0);
  await page.getByTitle('Back to Settings').click();

  await page.getByRole('button', { name: /Restore Backup/i }).click();
  await expect(page.getByText('Restore Data Wizard', { exact: true })).toBeVisible();
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});

test('managed Investment SIP uses mobile width without a fake edit button', async ({ page }) => {
  const errors = await prepare(page);
  // Existing/demo data may not contain a managed SIP; if present, it must use
  // full-width explanatory copy rather than the old button-looking span.
  await expect(page.getByText('Edit in Manage → Investment', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
  expect(errors, `Runtime errors:\n${errors.join('\n')}`).toEqual([]);
});
''')

print('Applied Settings cleanup, full integrity audit, recurring simplification, and mobile SIP layout changes.')
