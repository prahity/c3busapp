"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import "./checkbox-group.scss"

/**
 * c3 CheckboxGroup — verified against Figma node 43428-11255.
 *
 * Pure layout/composition wrapper. Stacks `<Checkbox>` children vertically.
 * `level="nested"` adds a left indent + vertical guide line so callers can
 * model hierarchical multi-select trees. There is no shared selection state —
 * each child Checkbox manages its own (unlike RadioGroup). Wire parent /
 * indeterminate / child state in the consumer.
 *
 * Theming + layout in checkbox-group.scss.
 */

type CheckboxGroupSize = "sm" | "md" | "lg"
type CheckboxGroupLevel = "default" | "nested"

type CheckboxGroupProps = React.ComponentProps<"div"> & {
  size?: CheckboxGroupSize
  level?: CheckboxGroupLevel
}

function CheckboxGroup({ className, size, level, children, ...props }: CheckboxGroupProps) {
  const resolvedSize: CheckboxGroupSize = size ?? "md"
  const resolvedLevel: CheckboxGroupLevel = level ?? "default"
  return (
    <div
      data-slot="checkbox-group"
      data-size={resolvedSize}
      data-level={resolvedLevel}
      role="group"
      className={cn(
        "checkbox-group",
        `checkbox-group--size-${resolvedSize}`,
        `checkbox-group--${resolvedLevel}`,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { CheckboxGroup }
export type { CheckboxGroupProps, CheckboxGroupSize, CheckboxGroupLevel }
