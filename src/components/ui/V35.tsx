import type { ComponentType, HTMLAttributes, ReactNode, SVGProps } from 'react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const join = (...parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' ');

export function SurfaceCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join('v35-surface rounded-2xl', className)} {...props} />;
}

export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-on-surface">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function IconBadge({ icon: Icon, tone = 'blue', size = 'md' }: { icon: IconComponent; tone?: 'blue' | 'green' | 'red' | 'purple' | 'amber'; size?: 'sm' | 'md' | 'lg' }) {
  const tones = {
    blue: 'bg-[var(--cb-blue-soft)] text-[var(--cb-blue)] border-[rgba(76,141,255,.24)]',
    green: 'bg-[var(--cb-green-soft)] text-[var(--cb-green)] border-[rgba(34,197,94,.24)]',
    red: 'bg-[var(--cb-red-soft)] text-[var(--cb-red)] border-[rgba(255,102,104,.24)]',
    purple: 'bg-[var(--cb-purple-soft)] text-[var(--cb-purple)] border-[rgba(168,85,247,.24)]',
    amber: 'bg-[var(--cb-amber-soft)] text-[var(--cb-amber)] border-[rgba(251,191,36,.24)]',
  } as const;
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' } as const;
  const iconSizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' } as const;
  return <span className={join('inline-flex shrink-0 items-center justify-center rounded-xl border', tones[tone], sizes[size])}><Icon className={iconSizes[size]} /></span>;
}

export function MoneyValue({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={join('font-numeric tabular-nums tracking-tight', className)}>{children}</span>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'positive' | 'negative' | 'warning' | 'neutral' | 'primary' }) {
  const tones = {
    positive: 'bg-[var(--cb-green-soft)] text-[var(--cb-green)]',
    negative: 'bg-[var(--cb-red-soft)] text-[var(--cb-red)]',
    warning: 'bg-[var(--cb-amber-soft)] text-[var(--cb-amber)]',
    primary: 'bg-[var(--cb-blue-soft)] text-[var(--cb-blue)]',
    neutral: 'bg-surface-container-high text-on-surface-variant',
  } as const;
  return <span className={join('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>;
}
