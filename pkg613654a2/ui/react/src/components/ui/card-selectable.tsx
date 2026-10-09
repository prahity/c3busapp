"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive, Checkbox as CheckboxPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * c3 selectable cards — verified against Figma node 44805:6441 ("Card / Card Base").
 *
 * Three flavors share one surface + layout shell (media top/left + a padded
 * content row) but differ in ARIA role, since the Figma "Selected" variant
 * bundles three different selection semantics into one component set:
 *   - SelectableCard — plain toggle, no visible control (border/tint only)
 *   - RadioCard      — single-choice; render inside <RadioGroup> (radio-group.tsx)
 *   - CheckboxCard   — independent multi-select, standalone
 *
 * All three key their selected styling off a `data-state="checked"` attribute
 * on the root — Radix sets this itself for Radio/CheckboxCard; SelectableCard
 * sets it manually so one Tailwind ruleset covers every flavor without a
 * JS-computed boolean going stale against Radix's own internal state.
 */

type CardMediaLocation = "none" | "top" | "left"

const cardSelectableSurface = cva(
  [
    "group relative flex w-full cursor-pointer overflow-hidden rounded-[var(--c3-style-border-radius-6)]",
    "border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]",
    "text-left outline-none transition-colors duration-[120ms]",
    "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-transparent",
    "after:transition-colors after:duration-[120ms] after:content-['']",
    "hover:after:bg-[var(--c3-style-basic-bg-hover)]",
    "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-accent)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    "data-[state=checked]:border-2 data-[state=checked]:border-[var(--c3-style-basic-border-accent)]",
    "data-[state=checked]:bg-[var(--c3-style-basic-bg-selected)]",
  ].join(" "),
  {
    variants: {
      media: {
        none: "flex-col items-start",
        top: "flex-col items-start",
        left: "flex-row items-start",
      },
    },
    defaultVariants: { media: "none" },
  },
)

/** Decorative 16px radio dot — visual only; the whole card is the radio hit target. */
function CardRadioIndicator() {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center self-center rounded-full",
        "border border-[var(--c3-style-basic-border-neutral)]",
        "group-data-[state=checked]:border-[var(--c3-style-basic-border-accent)]",
      )}
    >
      <span className="hidden size-2 rounded-full bg-[var(--c3-style-basic-bg-accent-inverse)] group-data-[state=checked]:block" />
    </span>
  )
}

/** Decorative 16px checkbox — visual only; the whole card is the checkbox hit target. */
function CardCheckboxIndicator() {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center self-center rounded-[var(--c3-style-border-radius-2)]",
        "border border-[var(--c3-style-basic-border-neutral)]",
        "group-data-[state=checked]:border-[var(--c3-style-basic-bg-accent-inverse)] group-data-[state=checked]:bg-[var(--c3-style-basic-bg-accent-inverse)]",
      )}
    >
      <Check className="hidden size-3 text-[var(--c3-style-basic-fg-inverse)] group-data-[state=checked]:block" />
    </span>
  )
}

/** Shared inner layout: media block(s) + a padded row of [content, indicator]. */
function CardSelectableBody({
  media,
  mediaContent,
  indicator,
  children,
}: {
  media: CardMediaLocation
  mediaContent?: React.ReactNode
  indicator?: React.ReactNode
  children: React.ReactNode
}) {
  const contentRow = (
    <div
      data-slot="card-selectable-content"
      className={cn(
        "flex items-start gap-[var(--c3-style-spacing-12)] p-[var(--c3-style-spacing-16)]",
        media === "left" ? "min-w-0 flex-1" : "w-full",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {indicator}
    </div>
  )

  if (media === "top") {
    return (
      <>
        {mediaContent && (
          <div data-slot="card-selectable-media" className="w-full shrink-0 overflow-hidden">
            {mediaContent}
          </div>
        )}
        {contentRow}
      </>
    )
  }

  if (media === "left") {
    return (
      <>
        {mediaContent && (
          <div data-slot="card-selectable-media" className="h-full w-24 shrink-0 self-stretch overflow-hidden">
            {mediaContent}
          </div>
        )}
        {contentRow}
      </>
    )
  }

  return contentRow
}

type CardSelectableSlots = {
  media?: CardMediaLocation
  mediaContent?: React.ReactNode
}

type SelectableCardProps = Omit<React.ComponentProps<"button">, "type"> &
  VariantProps<typeof cardSelectableSurface> &
  CardSelectableSlots & {
    selected?: boolean
    onSelectedChange?: (selected: boolean) => void
  }

/** Plain selectable card — no radio/checkbox glyph, just border + tint. */
function SelectableCard({
  className,
  media = "none",
  mediaContent,
  selected = false,
  onSelectedChange,
  onClick,
  children,
  ...props
}: SelectableCardProps) {
  return (
    <button
      type="button"
      data-slot="selectable-card"
      data-state={selected ? "checked" : "unchecked"}
      aria-pressed={selected}
      className={cn(cardSelectableSurface({ media }), className)}
      onClick={(event) => {
        onSelectedChange?.(!selected)
        onClick?.(event)
      }}
      {...props}
    >
      <CardSelectableBody media={media} mediaContent={mediaContent}>
        {children}
      </CardSelectableBody>
    </button>
  )
}

type RadioCardProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> & CardSelectableSlots

/** Radio-controlled selectable card — must be rendered inside a `<RadioGroup>`. */
function RadioCard({ className, media = "none", mediaContent, children, ...props }: RadioCardProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(cardSelectableSurface({ media }), className)}
      {...props}
    >
      <CardSelectableBody media={media} mediaContent={mediaContent} indicator={<CardRadioIndicator />}>
        {children}
      </CardSelectableBody>
    </RadioGroupPrimitive.Item>
  )
}

type CheckboxCardProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & CardSelectableSlots

/** Checkbox-controlled selectable card — independent, multi-select. */
function CheckboxCard({ className, media = "none", mediaContent, children, ...props }: CheckboxCardProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox-card"
      className={cn(cardSelectableSurface({ media }), className)}
      {...props}
    >
      <CardSelectableBody media={media} mediaContent={mediaContent} indicator={<CardCheckboxIndicator />}>
        {children}
      </CardSelectableBody>
    </CheckboxPrimitive.Root>
  )
}

export { SelectableCard, RadioCard, CheckboxCard }
export type { CardMediaLocation, SelectableCardProps, RadioCardProps, CheckboxCardProps }
