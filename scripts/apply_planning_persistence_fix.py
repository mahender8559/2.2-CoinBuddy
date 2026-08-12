from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label}: expected text not found in {path}')
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one match in {path}, found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

# AppContext: planning settings and Goals must be durably written before UI says
# they were saved. The generic effect is intentionally not the owner of these
# explicit user-save actions anymore.
p = Path('src/context/AppContext.tsx')
text = p.read_text()
text = text.replace('  setAffordabilitySettings: (settings: AffordabilitySettings) => void;', '  setAffordabilitySettings: (settings: AffordabilitySettings) => Promise<boolean>;')
text = text.replace("  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;\n  updateSavingsGoal: (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;\n  deleteSavingsGoal: (id: string) => void;", "  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => Promise<boolean>;\n  updateSavingsGoal: (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => Promise<boolean>;\n  deleteSavingsGoal: (id: string) => Promise<boolean>;")
old_state = '''  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);\n  const [affordabilitySettings, setAffordabilitySettingsState] = useState<AffordabilitySettings>(() => ({ ...DEFAULT_AFFORDABILITY_SETTINGS }));\n  const setAffordabilitySettings = useCallback((settings: AffordabilitySettings) => {\n    setAffordabilitySettingsState(normalizeAffordabilitySettings(settings));\n  }, []);'''
new_state = '''  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);\n  const savingsGoalsRef = useRef<SavingsGoal[]>([]);\n  useEffect(() => { savingsGoalsRef.current = savingsGoals; }, [savingsGoals]);\n  const [affordabilitySettings, setAffordabilitySettingsState] = useState<AffordabilitySettings>(() => ({ ...DEFAULT_AFFORDABILITY_SETTINGS }));\n  const setAffordabilitySettings = useCallback(async (settings: AffordabilitySettings): Promise<boolean> => {\n    if (!dbDriver) return false;\n    const normalized = normalizeAffordabilitySettings(settings);\n    try {\n      await setStoredSetting(AFFORDABILITY_SETTINGS_KEY, normalized);\n      setAffordabilitySettingsState(normalized);\n      return true;\n    } catch (error) {\n      console.error('Failed to save affordability settings:', error);\n      return false;\n    }\n  }, [dbDriver, setStoredSetting]);'''
if old_state not in text:
    raise SystemExit('planning state block not found')
text = text.replace(old_state, new_state, 1)
old_effect = '''        persistAppSetting('passcode', passcode),\n        persistAppSetting('profile', profile),\n        persistAppSetting(AFFORDABILITY_SETTINGS_KEY, affordabilitySettings),\n        persistAppSetting(SAVINGS_GOALS_KEY, savingsGoals),\n      ]);\n      void persistDbAction(() => upsertUserConfig(dbDriver!, { currency, monthCycleDay }));\n    }\n  }, [theme, colorPalette, currency, biometric, passcode, monthCycleDay, profile, affordabilitySettings, savingsGoals, dbReady, dbDriver]);'''
new_effect = '''        persistAppSetting('passcode', passcode),\n        persistAppSetting('profile', profile),\n      ]);\n      void persistDbAction(() => upsertUserConfig(dbDriver!, { currency, monthCycleDay }));\n    }\n  }, [theme, colorPalette, currency, biometric, passcode, monthCycleDay, profile, dbReady, dbDriver]);'''
if old_effect not in text:
    raise SystemExit('generic settings persistence block not found')
text = text.replace(old_effect, new_effect, 1)
old_goals = '''  const addSavingsGoal = (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {\n    setSavingsGoals(previous => [normalizeSavingsGoal({ ...goal, id: crypto.randomUUID(), createdAt: new Date().toISOString() }), ...previous]);\n  };\n\n  const updateSavingsGoal = (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {\n    setSavingsGoals(previous => previous.map(item => item.id === id ? normalizeSavingsGoal({ ...item, ...goal, id }) : item));\n  };\n\n  const deleteSavingsGoal = (id: string) => {\n    const removed = savingsGoals.find(goal => goal.id === id);\n    setSavingsGoals(previous => previous.filter(goal => goal.id !== id));\n    if (removed) showToast('Goal deleted', 'Undo', () => setSavingsGoals(previous => previous.some(goal => goal.id === removed.id) ? previous : [removed, ...previous]));\n  };'''
new_goals = '''  const persistSavingsGoals = useCallback(async (nextGoals: SavingsGoal[]): Promise<boolean> => {\n    if (!dbDriver) return false;\n    const normalized = normalizeSavingsGoals(nextGoals);\n    try {\n      await setStoredSetting(SAVINGS_GOALS_KEY, normalized);\n      savingsGoalsRef.current = normalized;\n      setSavingsGoals(normalized);\n      return true;\n    } catch (error) {\n      console.error('Failed to save Goals:', error);\n      return false;\n    }\n  }, [dbDriver, setStoredSetting]);\n\n  const addSavingsGoal = async (goal: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<boolean> => {\n    const created = normalizeSavingsGoal({ ...goal, id: crypto.randomUUID(), createdAt: new Date().toISOString() });\n    return persistSavingsGoals([created, ...savingsGoalsRef.current]);\n  };\n\n  const updateSavingsGoal = async (id: string, goal: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<boolean> => {\n    const next = savingsGoalsRef.current.map(item => item.id === id ? normalizeSavingsGoal({ ...item, ...goal, id }) : item);\n    return persistSavingsGoals(next);\n  };\n\n  const deleteSavingsGoal = async (id: string): Promise<boolean> => {\n    const removed = savingsGoalsRef.current.find(goal => goal.id === id);\n    const ok = await persistSavingsGoals(savingsGoalsRef.current.filter(goal => goal.id !== id));\n    if (ok && removed) showToast('Goal deleted', 'Undo', () => {\n      const restored = savingsGoalsRef.current.some(goal => goal.id === removed.id) ? savingsGoalsRef.current : [removed, ...savingsGoalsRef.current];\n      void persistSavingsGoals(restored);\n    });\n    return ok;\n  };'''
if old_goals not in text:
    raise SystemExit('Goals persistence block not found')
text = text.replace(old_goals, new_goals, 1)
p.write_text(text)

# Affordability settings: wait for durable SQLite snapshot before success toast/close.
p = Path('src/components/AffordabilitySettings.tsx')
text = p.read_text()
text = text.replace("  const [draft, setDraft] = useState<AffordabilitySettingsType>(() => ({ ...affordabilitySettings }));", "  const [draft, setDraft] = useState<AffordabilitySettingsType>(() => ({ ...affordabilitySettings }));\n  const [isSaving, setIsSaving] = useState(false);\n  const [saveError, setSaveError] = useState('');")
old_save = '''  const save = () => {\n    const normalized = normalizeAffordabilitySettings({ ...draft, setupCompleted: true });\n    setAffordabilitySettings(normalized);\n    showToast('Affordability safety preferences saved');\n    onClose();\n  };'''
new_save = '''  const save = async () => {\n    if (isSaving) return;\n    setIsSaving(true);\n    setSaveError('');\n    const normalized = normalizeAffordabilitySettings({ ...draft, setupCompleted: true });\n    const saved = await setAffordabilitySettings(normalized);\n    setIsSaving(false);\n    if (!saved) {\n      setSaveError('Could not save safety preferences. Your previous settings are still in use.');\n      return;\n    }\n    showToast('Affordability safety preferences saved');\n    onClose();\n  };'''
if old_save not in text:
    raise SystemExit('AffordabilitySettings save block not found')
text = text.replace(old_save, new_save, 1)
old_button = '''          <button type="button" onClick={save} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform">Save safety preferences</button>'''
new_button = '''          {saveError && <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{saveError}</p>}\n          <button type="button" disabled={isSaving} onClick={() => { void save(); }} className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-60">{isSaving ? 'Saving…' : 'Save safety preferences'}</button>'''
if old_button not in text:
    raise SystemExit('AffordabilitySettings save button not found')
text = text.replace(old_button, new_button, 1)
p.write_text(text)

# Goals: persist before closing and surface failure instead of pretending success.
p = Path('src/components/GoalsPanel.tsx')
text = p.read_text()
text = text.replace("  const [modalOpen, setModalOpen] = useState(false);", "  const [modalOpen, setModalOpen] = useState(false);\n  const [isSaving, setIsSaving] = useState(false);\n  const [saveError, setSaveError] = useState('');")
text = text.replace("    setModalOpen(true);\n  };\n\n  const openEdit", "    setSaveError('');\n    setModalOpen(true);\n  };\n\n  const openEdit", 1)
text = text.replace("    setDraft(rest);\n    setModalOpen(true);", "    setDraft(rest);\n    setSaveError('');\n    setModalOpen(true);", 1)
old_goal_save = '''  const save = () => {\n    if (!draft.name.trim() || draft.targetAmount <= 0) return;\n    const payload = { ...draft, name: draft.name.trim() };\n    if (editing) updateSavingsGoal(editing.id, payload);\n    else addSavingsGoal(payload);\n    setModalOpen(false);\n  };'''
new_goal_save = '''  const save = async () => {\n    if (isSaving || !draft.name.trim() || draft.targetAmount <= 0) return;\n    setIsSaving(true);\n    setSaveError('');\n    const payload = { ...draft, name: draft.name.trim() };\n    const saved = editing ? await updateSavingsGoal(editing.id, payload) : await addSavingsGoal(payload);\n    setIsSaving(false);\n    if (!saved) {\n      setSaveError('Could not save this goal. No changes were persisted.');\n      return;\n    }\n    setModalOpen(false);\n  };'''
if old_goal_save not in text:
    raise SystemExit('GoalsPanel save block not found')
text = text.replace(old_goal_save, new_goal_save, 1)
text = text.replace("onClick={() => deleteSavingsGoal(goal.id)}", "onClick={() => { void deleteSavingsGoal(goal.id); }}")
old_goal_button = '''              <button type="button" onClick={save} className="w-full rounded-xl bg-primary py-3.5 font-bold text-on-primary active:scale-[0.98] transition-transform">Save goal</button>'''
new_goal_button = '''              {saveError && <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{saveError}</p>}\n              <button type="button" disabled={isSaving} onClick={() => { void save(); }} className="w-full rounded-xl bg-primary py-3.5 font-bold text-on-primary active:scale-[0.98] transition-transform disabled:opacity-60">{isSaving ? 'Saving…' : 'Save goal'}</button>'''
if old_goal_button not in text:
    raise SystemExit('GoalsPanel save button not found')
text = text.replace(old_goal_button, new_goal_button, 1)
p.write_text(text)

print('Applied durable planning-settings and Goals persistence fix.')
