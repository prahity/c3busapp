import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * C3 Spinner — atomic loading indicator. Ported from the C3 docs site
 * (project-kc4t9). Tailwind-only: wraps Lucide `Loader2` with `animate-spin`
 * and a token-driven color/size matrix. Sizes match Button/Input atoms.
 */
const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      sm: 'size-3.5',
      md: 'size-4',
      lg: 'size-5',
      xl: 'size-7',
    },
    tone: {
      default: 'text-muted-foreground',
      primary: 'text-primary',
      'on-primary': 'text-primary-foreground',
      destructive: 'text-destructive',
    },
  },
  defaultVariants: { size: 'md', tone: 'default' },
});

export interface SpinnerProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'role'>,
    VariantProps<typeof spinnerVariants> {
  /** Screen-reader label. When present, adds `role="status"` + an sr-only span. */
  label?: string;
}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  function Spinner({ className, size, tone, label, ...props }, ref) {
    return (
      <span
        ref={ref}
        role={label ? 'status' : undefined}
        className={cn('inline-flex shrink-0 items-center', className)}
        {...props}
      >
        <Loader2 className={cn(spinnerVariants({ size, tone }))} />
        {label && <span className="sr-only">{label}</span>}
      </span>
    );
  },
);

export { spinnerVariants };
