"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import "./radio.scss"

/**
 * c3 RadioGroup — verified against Figma node 43439-6234.
 *
 * Vertical stack of `<Radio>` items. Mirrors Radix RadioGroup.Root and passes
 * a `size` context down via data attribute so individual <Radio>s can read it
 * (consumers can also pass size explicitly to each Radio).
 *
 * Vertical layout (flex column) via Tailwind.
 */

type RadioGroupSize = "sm" | "md" | "lg"

type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root> & {
  size?: RadioGroupSize
}

function RadioGroup({ className, size, ...props }: RadioGroupProps) {
  const resolvedSize: RadioGroupSize = size ?? "md"
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      data-size={resolvedSize}
      className={cn("flex flex-col gap-[var(--c3-style-spacing-12)]", className)}
      {...props}
    />
  )
}

export { RadioGroup }
export type { RadioGroupProps }
