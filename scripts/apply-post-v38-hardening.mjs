import fs from 'node:fs';
const file = 'src/components/V35GoalsPanelV2.tsx';
let source = fs.readFileSync(file, 'utf8');
function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found: ${before.slice(0, 140)}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
  "  getGoalCurrentAmount,\n  getGoalLinkedAccountIds,\n  getGoalLinkedAccounts,\n  getGoalProgressPercent,\n  getRequiredMonthlyContribution,",
  "  getGoalAccountOverlaps,\n  getGoalCurrentAmount,\n  getGoalLinkedAccountIds,\n  getGoalLinkedAccounts,\n  getGoalProgressPercent,\n  getRequiredMonthlyContribution,",
);
replaceOnce(
  "  const [isSaving, setIsSaving] = useState(false);\n  const [saveError, setSaveError] = useState('');",
  "  const [isSaving, setIsSaving] = useState(false);\n  const [saveError, setSaveError] = useState('');\n  const [overlapAcknowledged, setOverlapAcknowledged] = useState(false);",
);
replaceOnce(
  "    setSaveError('');\n    setModalOpen(true);\n  };\n\n  const openEdit",
  "    setSaveError('');\n    setOverlapAcknowledged(false);\n    setModalOpen(true);\n  };\n\n  const openEdit",
);
replaceOnce(
  "    setSaveError('');\n    setModalOpen(true);\n  };\n\n  const toggleLinkedAccount",
  "    setSaveError('');\n    setOverlapAcknowledged(false);\n    setModalOpen(true);\n  };\n\n  const toggleLinkedAccount",
);
replaceOnce(
  "  const toggleLinkedAccount = (accountId: string) => {\n    setDraft(current => {",
  "  const toggleLinkedAccount = (accountId: string) => {\n    setOverlapAcknowledged(false);\n    setSaveError('');\n    setDraft(current => {",
);
replaceOnce(
  "  const save = async () => {\n    if (isSaving || !draft.name.trim() || draft.targetAmount <= 0) return;\n    setIsSaving(true);\n    setSaveError('');\n    const linkedAccountIds = getGoalLinkedAccountIds(draft);",
  "  const save = async () => {\n    if (isSaving || !draft.name.trim() || draft.targetAmount <= 0) return;\n    const linkedAccountIds = getGoalLinkedAccountIds(draft);\n    const overlaps = getGoalAccountOverlaps(savingsGoals, editing?.id, linkedAccountIds);\n    if (overlaps.length > 0 && !overlapAcknowledged) {\n      const goalNames = [...new Set(overlaps.map(overlap => overlap.goalName))];\n      setOverlapAcknowledged(true);\n      setSaveError(`One or more linked accounts are already used by ${goalNames.join(', ')}. Saving will show the same balance in both goals. Press Save again to continue.`);\n      return;\n    }\n    setIsSaving(true);\n    setSaveError('');",
);
replaceOnce(
  "    setModalOpen(false);\n  };",
  "    setOverlapAcknowledged(false);\n    setModalOpen(false);\n  };",
);
fs.writeFileSync(file, source);
console.log('Goal overlap consent UI staged from current branch head.');
