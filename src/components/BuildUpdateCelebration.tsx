import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, IndianRupee, Sparkles, WalletCards, X } from 'lucide-react';

const SEEN_BUILD_KEY = 'coinbuddy_seen_build_identity';
const DISPLAY_MS = 8500;

function currentBuildIdentity(): string {
  const buildNumber = typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : 'development';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'development';
  return `${buildNumber}|${buildTime}`;
}

function formatBuildTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function BuildUpdateCelebration() {
  const reduceMotion = useReducedMotion();
  const buildNumber = typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : 'development';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();
  const identity = useMemo(() => currentBuildIdentity(), []);
  const [shouldCelebrate] = useState(() => {
    try {
      return localStorage.getItem(SEEN_BUILD_KEY) !== identity;
    } catch {
      return true;
    }
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldCelebrate) return;
    try { localStorage.setItem(SEEN_BUILD_KEY, identity); } catch { /* storage can be unavailable */ }
    setVisible(true);
  }, [identity, shouldCelebrate]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          data-testid="build-update-celebration"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-3 z-[650] w-[calc(100%-1.5rem)] max-w-[470px] -translate-x-1/2 sm:top-4"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -90, scale: 0.92 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -70, scale: 0.96 }}
          transition={reduceMotion ? { duration: 0.18 } : { type: 'spring', stiffness: 330, damping: 25, mass: 0.78 }}
        >
          <div className="pointer-events-auto relative overflow-hidden rounded-[24px] border border-primary/25 bg-surface-container/95 shadow-2xl backdrop-blur-xl">
            <div aria-hidden="true" className="absolute -left-12 -top-16 h-32 w-32 rounded-full bg-primary/12 blur-2xl" />
            <div aria-hidden="true" className="absolute -bottom-20 right-2 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />

            <button
              type="button"
              onClick={() => setVisible(false)}
              className="v35-focus-ring absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Dismiss update message"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3.5 px-4 pb-3.5 pt-4 pr-12 sm:gap-4 sm:px-5 sm:pb-4 sm:pt-5 sm:pr-12">
              <div className="relative flex h-[66px] w-[66px] shrink-0 items-center justify-center sm:h-[72px] sm:w-[72px]">
                {!reduceMotion ? (
                  <>
                    <motion.span
                      aria-hidden="true"
                      className="absolute -left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                      initial={{ opacity: 0, scale: 0.4, x: 10, y: 10 }}
                      animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1, 1, 0.7], x: [10, -7, -11, -15], y: [10, -5, -10, -16] }}
                      transition={{ duration: 2.2, delay: 0.45 }}
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                    </motion.span>
                    <motion.span
                      aria-hidden="true"
                      className="absolute -right-2 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                      initial={{ opacity: 0, scale: 0.4, x: -8, y: 8 }}
                      animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1, 1, 0.65], x: [-8, 8, 13, 17], y: [8, -4, -10, -15] }}
                      transition={{ duration: 2.1, delay: 0.7 }}
                    >
                      <WalletCards className="h-3.5 w-3.5" />
                    </motion.span>
                    <motion.span
                      aria-hidden="true"
                      className="absolute bottom-0 right-0 text-primary"
                      initial={{ opacity: 0, scale: 0.2, rotate: -30 }}
                      animate={{ opacity: [0, 1, 0.9, 0], scale: [0.2, 1.1, 0.9, 0.45], rotate: [-30, 8, 20, 35] }}
                      transition={{ duration: 1.9, delay: 0.25 }}
                    >
                      <Sparkles className="h-5 w-5" />
                    </motion.span>
                  </>
                ) : null}

                <motion.div
                  className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border border-primary/30 bg-primary/10 p-1.5 shadow-lg shadow-primary/10 sm:h-[60px] sm:w-[60px]"
                  initial={reduceMotion ? false : { rotate: -10, y: 9, scale: 0.78 }}
                  animate={reduceMotion ? undefined : { rotate: [0, -5, 5, -2, 0], y: [0, -4, 0], scale: [1, 1.04, 1] }}
                  transition={reduceMotion ? undefined : { duration: 1.45, delay: 0.12, ease: 'easeOut' }}
                >
                  <img src="/logo.png" alt="CoinBuddy" className="h-full w-full rounded-[14px] object-cover" />
                  <motion.span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-container bg-primary text-on-primary shadow-sm"
                    initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
                    animate={reduceMotion ? undefined : { scale: 1, rotate: 0 }}
                    transition={reduceMotion ? undefined : { type: 'spring', stiffness: 420, damping: 18, delay: 0.85 }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.7} />
                  </motion.span>
                </motion.div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Fresh build</span>
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </div>
                <p className="text-[15px] font-bold tracking-tight text-on-surface sm:text-base">Your Buddy just got better ✨</p>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant sm:text-xs sm:leading-5">A fresh CoinBuddy update is ready. Your money is right where you left it — carry on.</p>
                <p className="mt-2 truncate font-numeric text-[9.5px] font-medium text-on-surface-variant/80 sm:text-[10px]">Build #{buildNumber} · {formatBuildTime(buildTime)}</p>
              </div>
            </div>

            {!reduceMotion ? (
              <div className="h-1 w-full bg-surface-container-highest/70">
                <motion.div
                  className="h-full origin-left bg-primary"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: DISPLAY_MS / 1000, ease: 'linear' }}
                />
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
