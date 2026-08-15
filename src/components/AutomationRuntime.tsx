import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { getManagedRuleSyncPlan, isManagedAutomationRule } from '../domain/automation';

export function AutomationRuntime() {
  const { accounts, creditCards, savingsGoals, recurringRules, updateRecurringRule, deleteRecurringRule } = useAppContext();
  const running = useRef(false);

  useEffect(() => {
    if (running.current) return;
    const managed = recurringRules.filter(isManagedAutomationRule);
    const plans = managed.map(rule => ({
      rule,
      plan: getManagedRuleSyncPlan(rule, { accounts, creditCards, savingsGoals }),
    })).filter(item => item.plan.action !== 'NONE');
    if (!plans.length) return;

    running.current = true;
    void (async () => {
      try {
        for (const item of plans) {
          if (item.plan.action === 'DELETE') {
            const deleted = await deleteRecurringRule(item.rule.id);
            if (!deleted) console.error(`Managed automation ${item.rule.id} could not be removed.`);
          } else if (item.plan.action === 'UPDATE') {
            const updated = await updateRecurringRule(item.plan.rule);
            if (!updated) console.error(`Managed automation ${item.rule.id} could not be synchronized.`);
          }
        }
      } finally {
        running.current = false;
      }
    })();
  }, [accounts, creditCards, savingsGoals, recurringRules, updateRecurringRule, deleteRecurringRule]);

  return null;
}
