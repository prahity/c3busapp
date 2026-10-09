import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * c3 Progress — a horizontal progress / meter bar (Figma node 3831-2727).
 *
 * A neutral track with an accent fill sized to `value` (0–100). Three sizes set
 * the track thickness (sm 6px / md 8px / lg 12px). The bar is value-only; a "50%"
 * style label (e.g. in a table cell) is composed alongside it, not built in.
 *
 * Colors + radius are Tailwind token classes; the fill width is an inline style
 * (a runtime value, not a token), and the track height is a Tailwind h-* utility.
 */

type ProgressSize = "sm" | "md" | "lg"

type ProgressProps = React.ComponentProps<"div"> & {
  value?: number
  size?: ProgressSize
}

const SIZE_HEIGHT: Record<ProgressSize, string> = {
  sm: "h-1.5", // 6px
  md: "h-2", //   8px
  lg: "h-3", //  12px
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function Progress({ className, value = 0, size = "md", ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div
      data-slot="progress"
      data-size={size}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-bg-neutral)]",
        SIZE_HEIGHT[size],
        className,
      )}
      {...props}
    >
      <span
        className="block h-full rounded-[var(--c3-style-border-radius-rounded)] bg-[var(--c3-style-basic-fg-accent)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
export type { ProgressProps, ProgressSize }
