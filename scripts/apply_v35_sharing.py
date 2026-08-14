from pathlib import Path

path = Path('src/components/SharingPanel.tsx')
text = path.read_text()

# Normalize focused workspace containers to the V3.5 surface family without
# touching any shared-finance calculations or form behavior.
text = text.replace(
    'className="rounded-3xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6"',
    'className="v35-surface rounded-2xl p-4 sm:p-6"',
)

old_home_start = '  return (\n    <div className="space-y-6" data-testid="sharing-hub">'
start = text.find(old_home_start)
if start == -1:
    raise SystemExit('Sharing home return marker not found')
# This is the component's final return, so replace through the component close.
end = len(text)

new_home = r'''  return (
    <div className="space-y-5" data-testid="sharing-hub">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Sharing ✨</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Manage money shared with family and friends without mixing responsibility with your personal cash flow.</p>
        </div>
      </header>

      <section aria-label="Sharing summary" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-primary"><Users className="h-4 w-4"/><span className="text-xs font-semibold">People</span></div>
          <p className="mt-2.5 font-numeric text-xl font-semibold text-on-surface">{activePeople.length}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">You + shared participants</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-green)]"><HandCoins className="h-4 w-4"/><span className="text-xs font-semibold">You should receive</span></div>
          <p className="mt-2.5 font-numeric text-lg font-semibold text-[var(--cb-green)] sm:text-xl">{formatCurrency(sharingSummary.owedToMe)}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Money others still owe you</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-amber)]"><ArrowRightLeft className="h-4 w-4"/><span className="text-xs font-semibold">You owe</span></div>
          <p className="mt-2.5 font-numeric text-lg font-semibold text-[var(--cb-amber)] sm:text-xl">{formatCurrency(sharingSummary.iOwe)}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Your unsettled responsibility</p>
        </article>
        <article className="v35-surface rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[var(--cb-purple)]"><Repeat2 className="h-4 w-4"/><span className="text-xs font-semibold">Active bills</span></div>
          <p className="mt-2.5 font-numeric text-xl font-semibold text-on-surface">{sharingSummary.recurring}</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Recurring shared obligations</p>
        </article>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-on-surface">What do you want to do?</h2>
          <p className="mt-1 text-xs text-on-surface-variant sm:text-sm">Choose one task. Only the controls for that job will open.</p>
        </div>

        <div className="v35-surface overflow-hidden rounded-2xl">
          {actions.map((action, index) => {
            const Icon = action.icon;
            const tone = action.id === 'SETTLEMENTS'
              ? 'text-[var(--cb-green)] bg-[var(--cb-green-soft)]'
              : action.id === 'RECURRING'
                ? 'text-[var(--cb-amber)] bg-[var(--cb-amber-soft)]'
                : action.id === 'LOANS'
                  ? 'text-[var(--cb-purple)] bg-[var(--cb-purple-soft)]'
                  : 'text-primary bg-primary/10';
            return (
              <button
                key={action.id}
                type="button"
                aria-label={`Open ${action.title}`}
                onClick={() => setWorkspace(action.id)}
                className={`group flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-high/45 sm:min-h-[82px] sm:px-5 ${index < actions.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-on-surface sm:text-[15px]">{action.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant sm:text-sm">{action.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </section>

      <aside className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-3.5 sm:p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ArrowRightLeft className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold text-on-surface">Keep cost, payment and responsibility separate</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">Who recorded something does not decide who paid or who should ultimately bear the cost. CoinBuddy keeps those facts separate.</p>
        </div>
      </aside>
    </div>
  );
}
'''

text = text[:start] + new_home
path.write_text(text)

Path('e2e/v35-sharing.spec.ts').write_text(r'''import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    localStorage.setItem('hasCompletedButtonTour', 'true');
  });
  await page.goto('/?tab=manage');
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 768) await page.getByTestId('desktop-sidebar').getByRole('button', { name: 'Sharing', exact: true }).click();
  else await page.getByTestId('mobile-bottom-nav').getByRole('button', { name: 'Sharing', exact: true }).click();
}

test('v3.5 Sharing presents one calm task hub', async ({ page }, testInfo: TestInfo) => {
  await prepare(page);
  await expect(page.getByTestId('sharing-hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sharing ✨' })).toBeVisible();
  await expect(page.getByText('You should receive', { exact: true })).toBeVisible();
  await expect(page.getByText('You owe', { exact: true })).toBeVisible();
  await expect(page.getByText('Active bills', { exact: true })).toBeVisible();

  for (const task of ['Shared expenses', 'Settle / reimburse', 'Recurring shared bills', 'Shared loans', 'People']) {
    await expect(page.getByRole('button', { name: `Open ${task}` })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Open Shared expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Shared expenses' })).toBeVisible();
  await page.getByRole('button', { name: /Back to Sharing/ }).click();
  await expect(page.getByTestId('sharing-hub')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('v35-sharing.png'), fullPage: false });
});
''')

print('Applied V3.5 Sharing visual system')
