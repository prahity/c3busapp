import * as React from 'react';
import { Info, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * C3 MetricCard — single-KPI dashboard tile with optional sparkline slot.
 * Ported from the C3 docs site (project-kc4t9). Composable subcomponents:
 *
 *   <MetricCard>
 *     <MetricCardHeader>
 *       <MetricCardLabel>Active alerts</MetricCardLabel>
 *       <MetricCardInfo aria-label="What is this?" />
 *     </MetricCardHeader>
 *     <MetricCardValue>12,345</MetricCardValue>
 *     <MetricCardDelta tone="positive">+10% (+50)</MetricCardDelta>
 *     <MetricCardChart><MySparkline /></MetricCardChart>
 *     <MetricCardCaption>Last 12 months</MetricCardCaption>
 *   </MetricCard>
 *
 * Delta tone is decoupled from direction. Tone colors bind to `--c3-style-*`
 * via inline style since this project's shadcn theme only maps `destructive`
 * (not success), and `--c3-style-*` is the canonical color source here.
 * MetricCardChart is a height-reserving slot — pass any svg / eCharts sparkline.
 */

/* ----------------------------- Root ----------------------------------- */

const cardVariants = cva(
  cn('flex flex-col gap-2 rounded-md bg-card p-3 text-card-foreground transition-colors'),
  {
    variants: {
      variant: {
        elevated: 'border border-border shadow-sm',
        outlined: 'border border-border',
        flush: '',
      },
      interactive: {
        true: 'cursor-pointer hover:border-ring hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
        false: '',
      },
    },
    defaultVariants: { variant: 'outlined', interactive: false },
  },
);

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  function MetricCard({ className, variant, interactive, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="metric-card"
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? 'button' : undefined}
        className={cn(cardVariants({ variant, interactive }), className)}
        {...props}
      />
    );
  },
);

/* ---------------------------- Header row ------------------------------ */

export const MetricCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function MetricCardHeader({ className, ...props }, ref) {
  return (
    <div ref={ref} data-slot="metric-card-header" className={cn('flex items-center gap-1.5', className)} {...props} />
  );
});

export const MetricCardLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(function MetricCardLabel({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="metric-card-label"
      className={cn('flex-1 truncate text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
});

/** Small ⓘ trigger next to the label — renders as a button for popover/tooltip wiring. */
export const MetricCardInfo = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function MetricCardInfo({ className, type = 'button', children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="metric-card-info"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors',
        'hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
        className,
      )}
      {...props}
    >
      {children ?? <Info className="size-3.5" aria-hidden />}
    </button>
  );
});

/* ----------------------------- Value ---------------------------------- */

export const MetricCardValue = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function MetricCardValue({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="metric-card-value"
      className={cn('text-xl font-semibold tabular-nums leading-tight text-foreground', className)}
      {...props}
    />
  );
});

/* ----------------------------- Delta ---------------------------------- */

type DeltaTone = 'positive' | 'negative' | 'neutral';

const DELTA_COLOR: Record<DeltaTone, string> = {
  positive: 'var(--c3-style-basic-fg-success)',
  negative: 'var(--c3-style-basic-fg-danger)',
  neutral: 'var(--c3-style-basic-fg-secondary)',
};

export interface MetricCardDeltaProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: DeltaTone;
  /** Arrow glyph, independent of tone. Default: derive from tone. */
  direction?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
}

export const MetricCardDelta = React.forwardRef<HTMLSpanElement, MetricCardDeltaProps>(
  function MetricCardDelta({ className, tone = 'neutral', direction, icon, children, style, ...props }, ref) {
    const resolvedDir =
      direction ?? (tone === 'positive' ? 'up' : tone === 'negative' ? 'down' : 'neutral');
    const Icon = resolvedDir === 'up' ? TrendingUp : resolvedDir === 'down' ? TrendingDown : Minus;
    return (
      <span
        ref={ref}
        data-slot="metric-card-delta"
        data-tone={tone}
        data-direction={resolvedDir}
        style={{ color: DELTA_COLOR[tone], ...style }}
        className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', className)}
        {...props}
      >
        <span aria-hidden className="inline-flex">
          {icon ?? <Icon className="size-3.5" />}
        </span>
        {children}
      </span>
    );
  },
);

/* ----------------------------- Chart slot ----------------------------- */

/** Height-reserving slot for a sparkline / mini-chart — pass any rendered chart. */
export interface MetricCardChartProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Reserved height in px. Default 48. */
  height?: number;
}

export const MetricCardChart = React.forwardRef<HTMLDivElement, MetricCardChartProps>(
  function MetricCardChart({ className, height = 48, style, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="metric-card-chart"
        style={{ height, ...style }}
        className={cn('-mx-1 mt-1 w-[calc(100%+0.5rem)] overflow-hidden', className)}
        {...props}
      />
    );
  },
);

/* ----------------------------- Caption -------------------------------- */

export const MetricCardCaption = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(function MetricCardCaption({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="metric-card-caption"
      className={cn('text-[11px] text-muted-foreground', className)}
      {...props}
    />
  );
});
