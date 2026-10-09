import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * c3 Label — shadcn-shaped, styled with Tailwind + C3 tokens (no SCSS).
 * Radix Label primitive: clicking/focusing the label forwards to its control.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 select-none font-sans text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
