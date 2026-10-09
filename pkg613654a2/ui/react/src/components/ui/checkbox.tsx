"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import "./checkbox.scss"

/**
 * c3 Checkbox — verified against Figma node 3830-2149.
 *
 * API:
 *   size: "sm" | "md" | "lg"  (default "md")
 *   checked / defaultChecked: boolean | "indeterminate"
 *   label, subText: optional ReactNodes rendered to the right
 *   disabled: standard
 *
 * Theming (border, fill on checked/indeterminate, focus ring, disabled) lives
 * in checkbox.scss — see references/scss-bem-convention.md.
 */

const boxLayout = cva(
  [
    "peer relative inline-flex shrink-0 items-center justify-center",
    "outline-none",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "size-4 [&_svg]:size-3",
        md: "size-5 [&_svg]:size-4",
        lg: "size-6 [&_svg]:size-5",
      },
    },
    defaultVariants: { size: "md" },
  }
)

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> &
  VariantProps<typeof boxLayout> & {
    label?: React.ReactNode
    subText?: React.ReactNode
  }

function Checkbox({ className, size, label, subText, id, ...props }: CheckboxProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId

  const box = (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-size={size ?? "md"}
      id={inputId}
      className={cn("checkbox", boxLayout({ size }), className)}
      {...props}
    >
      {/* Both icons always render; checkbox.scss shows/hides each based on the
          checkbox's own live data-state. Choosing the icon here in JS instead
          — off props.checked/defaultChecked — goes stale for an uncontrolled
          tri-state box: clicking it flips Radix's internal state without
          re-rendering this component, so a defaultChecked="indeterminate"
          checkbox would keep showing the dash after becoming checked. */}
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        <Check className="checkbox__icon checkbox__icon--check" />
        <Minus className="checkbox__icon checkbox__icon--indeterminate" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (label == null && subText == null) return box

  return (
    <div
      className={cn(
        "checkbox-field",
        props.disabled && "checkbox-field--disabled",
        "inline-flex items-start",
      )}
    >
      {box}
      <label
        htmlFor={inputId}
        className={cn(
          "checkbox-field__label",
          "flex flex-col font-sans",
          size === "md" && "checkbox-field__label--size-md",
          size === "lg" && "checkbox-field__label--size-lg",
        )}
      >
        {label != null && (
          <span className="text-c3-regular-label-l2">
            {label}
          </span>
        )}
        {subText != null && (
          <span className="checkbox-field__sub text-c3-regular-body-p3">
            {subText}
          </span>
        )}
      </label>
    </div>
  )
}

export { Checkbox }
