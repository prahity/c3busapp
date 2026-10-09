"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import "./radio.scss"

/**
 * c3 Radio — verified against Figma node 3830-58457.
 *
 * Single radio option. Must be rendered inside a `<RadioGroup>` (see
 * radio-group.tsx). Single-color (accent) — radios don't carry color.
 *
 * Theming lives in radio.scss — Tailwind here owns layout, sizing, label spacing.
 */

const radioBoxLayout = cva(
  "peer relative inline-flex shrink-0 items-center justify-center",
  {
    variants: {
      size: {
        sm: "size-4",
        md: "size-5",
        lg: "size-6",
      },
    },
    defaultVariants: { size: "md" },
  }
)

type RadioSize = "sm" | "md" | "lg"

type RadioProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> &
  VariantProps<typeof radioBoxLayout> & {
    label?: React.ReactNode
    subLabel?: React.ReactNode
  }

function Radio({ className, size, label, subLabel, id, ...props }: RadioProps) {
  const resolvedSize: RadioSize = size ?? "md"
  const generatedId = React.useId()
  const inputId = id ?? generatedId

  const box = (
    <RadioGroupPrimitive.Item
      data-slot="radio"
      data-size={resolvedSize}
      id={inputId}
      className={cn(
        "radio",
        radioBoxLayout({ size: resolvedSize }),
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator data-slot="radio-indicator" className="radio__indicator" />
    </RadioGroupPrimitive.Item>
  )

  if (label == null && subLabel == null) return box

  return (
    <div
      className={cn(
        "radio-field",
        props.disabled && "radio-field--disabled",
        "inline-flex items-start",
      )}
    >
      {box}
      <label
        htmlFor={inputId}
        className={cn(
          "radio-field__label",
          "flex flex-col font-sans",
          resolvedSize === "md" && "radio-field__label--size-md",
          resolvedSize === "lg" && "radio-field__label--size-lg",
        )}
      >
        {label != null && (
          <span className="text-c3-regular-label-l2">{label}</span>
        )}
        {subLabel != null && (
          <span className="radio-field__sub text-c3-regular-body-p3">{subLabel}</span>
        )}
      </label>
    </div>
  )
}

export { Radio }
export type { RadioProps, RadioSize }
