import { LockKeyhole, ShieldCheck } from 'lucide-react';

interface GoogleSignInGateProps {
  loading: boolean;
}

export function GoogleSignInGate({ loading }: GoogleSignInGateProps) {
  const signIn = () => {
    window.location.assign('/api/auth/google/connect');
  };

  return (
    <main className="min-h-screen bg-background text-on-background flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--primary)_20%,transparent),transparent_48%)]" />
      <section className="relative w-full max-w-md rounded-3xl border border-outline-variant/40 bg-surface-container/90 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">CoinBuddy</p>
        <h1 className="text-3xl font-bold tracking-tight">Your money, kept private.</h1>
        <p className="mt-3 text-on-surface-variant">Sign in with your Google account to open this CoinBuddy ledger on this device.</p>

        {loading ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-on-surface-variant" aria-live="polite">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Checking your secure session…
          </div>
        ) : (
          <button onClick={signIn} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container-high px-5 py-3.5 font-semibold text-on-surface shadow-sm ring-1 ring-outline-variant/50 transition hover:bg-surface-container-highest focus:outline-none focus:ring-2 focus:ring-primary">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.79h3.14c1.84-1.7 2.92-4.2 2.92-7.75Z" />
              <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.35l-3.14-2.79c-.87.58-1.99.92-3.29.92-2.53 0-4.68-1.71-5.45-4.01H3.31v2.88A9.71 9.71 0 0 0 12 21.75Z" />
              <path fill="#FBBC05" d="M6.55 13.52A5.84 5.84 0 0 1 6.25 12c0-.53.09-1.04.3-1.52V7.6H3.31A9.72 9.72 0 0 0 2.25 12c0 1.57.38 3.05 1.06 4.4l3.24-2.88Z" />
              <path fill="#EA4335" d="M12 6.47c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.82 3.55 14.62 2.25 12 2.25A9.71 9.71 0 0 0 3.31 7.6l3.24 2.88C7.32 8.18 9.47 6.47 12 6.47Z" />
            </svg>
            Sign in with Google
          </button>
        )}

        <div className="mt-6 flex gap-2 text-xs leading-5 text-on-surface-variant">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Your financial data stays on this device unless you choose to back it up.
        </div>
      </section>
    </main>
  );
}
