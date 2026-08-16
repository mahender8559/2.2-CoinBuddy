import type { Account, LoanRevision } from '../types';

function currentLocalDateKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function applyLoanRevisionProjection(
  accounts: Account[],
  loanRevisions: LoanRevision[],
  asOfDateKey = currentLocalDateKey(),
): Account[] {
  const revisionsByAccount = new Map<string, LoanRevision[]>();
  for (const revision of loanRevisions) {
    const list = revisionsByAccount.get(revision.accountId) ?? [];
    list.push(revision);
    revisionsByAccount.set(revision.accountId, list);
  }

  return accounts.map(account => {
    const revisions = [...(revisionsByAccount.get(account.id) ?? [])].sort((left, right) => {
      const byDate = new Date(right.effectiveDate).getTime() - new Date(left.effectiveDate).getTime();
      return byDate || right.id.localeCompare(left.id);
    });
    if (!revisions.length) return account;

    const currentRevision = revisions.find(revision => revision.effectiveDate.slice(0, 10) <= asOfDateKey);
    if (!currentRevision) return { ...account, revisions };

    return {
      ...account,
      revisions,
      interestRate: currentRevision.newInterestRate,
      monthlyEMI: currentRevision.newEmi,
      tenureMonths: currentRevision.newTenureMonths,
      paymentFrequency: currentRevision.paymentFrequency ?? account.paymentFrequency,
    };
  });
}
