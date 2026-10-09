import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * c3 Divider — Figma node 44561-10909.
 *
 * 1px line for separating sections / list items / panel zones. Horizontal
 * by default; pass `orientation="vertical"` for column dividers. Use
 * `decorative` when the surrounding semantics already convey separation
 * (e.g. inside a <ListboxSeparator> li whose role="separator" wins).
 */

type DividerOrientation = "horizontal" | "vertical"

type DividerProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: DividerOrientation
  /** When true, renders role="presentation" (purely visual). Default false. */
  decorative?: boolean
}

function Divider({
  orientation = "horizontal",
  decorative = false,
  className,
  ...props
}: DividerProps) {
  return (
    <div
      {...props}
      role={decorative ? "presentation" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      data-slot="divider"
      data-orientation={orientation}
      className={cn(
        "shrink-0 bg-[var(--c3-style-basic-border-border)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
        className,
      )}
    />
  )
}

export { Divider }
export type { DividerProps, DividerOrientation }
