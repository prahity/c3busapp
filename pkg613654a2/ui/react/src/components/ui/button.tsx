import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * c3 Button — shadcn-shaped, styled with Tailwind + C3 tokens (no SCSS).
 *   variant:    solid | soft | outline | ghost   (the *visual style*)
 *   appearance: accent | secondary | success | danger | warning   (the *semantic swatch*)
 *
 * 20 visual combinations (variant × appearance) via cva compoundVariants.
 * Color, the hover/pressed overlay, the focus ring, and disabled all live here
 * as Tailwind classes referencing --c3-style-* tokens — nothing in a stylesheet.
 * Dark mode happens via the token swap on [data-theme="dark"]; no dark: variants.
 *
 * Orthogonal modifier:
 *   loading: boolean — replaces leadingIcon with a spinner, blocks interaction,
 *                      sets aria-busy. Visually full-opacity (busy, not disabled).
 */
const buttonVariants = cva(
  [
    // layout
    "group/button relative isolate inline-flex shrink-0 items-center justify-center",
    "border border-solid border-transparent bg-clip-padding",
    "rounded-[var(--c3-style-border-radius-4)]",
    "font-sans text-c3-bold-label-l2 whitespace-nowrap select-none outline-none",
    "transition-[background-color,color,border-color] duration-[120ms] ease-[ease]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    // hover/pressed overlay — a translucent layer painted over the base bg, uniform across variants
    "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none",
    "after:bg-transparent after:transition-[background-color] after:duration-[120ms]",
    "hover:after:bg-[var(--c3-style-basic-bg-hover)] active:after:bg-[var(--c3-style-basic-bg-pressed)]",
    // disabled (native + aria)
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-8)] min-w-[var(--c3-style-width-w-56)] h-[var(--c3-style-height-h-28)] text-c3-bold-label-l3 [&_svg:not([class*='size-'])]:size-3",
        md: "gap-[var(--c3-style-spacing-8)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] min-w-[var(--c3-style-width-w-64)] h-[var(--c3-style-height-h-32)]",
        lg: "gap-[var(--c3-style-spacing-8)] px-[var(--c3-style-spacing-16)] py-[var(--c3-style-spacing-12)] min-w-[var(--c3-style-width-w-80)] h-[var(--c3-style-height-h-36)]",
        "icon-sm": "w-[var(--c3-style-width-w-28)] h-[var(--c3-style-height-h-28)]",
        "icon-md": "w-[var(--c3-style-width-w-32)] h-[var(--c3-style-height-h-32)]",
        "icon-lg": "w-[var(--c3-style-width-w-36)] h-[var(--c3-style-height-h-36)]",
      },
      variant: {
        solid: "",
        soft: "",
        outline: "bg-[var(--c3-style-basic-bg-primary)]",
        ghost: "bg-transparent",
      },
      appearance: {
        accent: "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-accent)]",
        secondary: "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-secondary)]",
        success: "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-success)]",
        danger: "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-danger)]",
        warning: "focus-visible:shadow-[0_0_0_2px_var(--c3-style-shadow-ring-warning)]",
      },
    },
    compoundVariants: [
      // SOLID — bold inverse fill, inverse text
      { variant: "solid", appearance: "accent", class: "bg-[var(--c3-style-basic-bg-accent-inverse)] text-[var(--c3-style-basic-fg-inverse)]" },
      { variant: "solid", appearance: "secondary", class: "bg-[var(--c3-style-basic-bg-neutral-inverse)] text-[var(--c3-style-basic-fg-inverse)]" },
      { variant: "solid", appearance: "success", class: "bg-[var(--c3-style-basic-bg-success-inverse)] text-[var(--c3-style-basic-fg-inverse)]" },
      { variant: "solid", appearance: "danger", class: "bg-[var(--c3-style-basic-bg-danger-inverse)] text-[var(--c3-style-basic-fg-inverse)]" },
      { variant: "solid", appearance: "warning", class: "bg-[var(--c3-style-basic-bg-warning-inverse)] text-[var(--c3-style-basic-fg-inverse)]" },
      // SOFT — subtle tint bg, appearance text
      { variant: "soft", appearance: "accent", class: "bg-[var(--c3-style-basic-bg-accent)] text-[var(--c3-style-basic-fg-accent)]" },
      { variant: "soft", appearance: "secondary", class: "bg-[var(--c3-style-basic-bg-secondary)] text-[var(--c3-style-basic-fg-primary)]" },
      { variant: "soft", appearance: "success", class: "bg-[var(--c3-style-basic-bg-success)] text-[var(--c3-style-basic-fg-success)]" },
      { variant: "soft", appearance: "danger", class: "bg-[var(--c3-style-basic-bg-danger)] text-[var(--c3-style-basic-fg-danger)]" },
      { variant: "soft", appearance: "warning", class: "bg-[var(--c3-style-basic-bg-warning)] text-[var(--c3-style-basic-fg-warning)]" },
      // OUTLINE — surface bg (from variant base), appearance border + text
      { variant: "outline", appearance: "accent", class: "border-[var(--c3-style-basic-border-accent)] text-[var(--c3-style-basic-fg-accent)]" },
      { variant: "outline", appearance: "secondary", class: "border-[var(--c3-style-basic-border-border)] text-[var(--c3-style-basic-fg-primary)]" },
      { variant: "outline", appearance: "success", class: "border-[var(--c3-style-basic-border-success)] text-[var(--c3-style-basic-fg-success)]" },
      { variant: "outline", appearance: "danger", class: "border-[var(--c3-style-basic-border-danger)] text-[var(--c3-style-basic-fg-danger)]" },
      { variant: "outline", appearance: "warning", class: "border-[var(--c3-style-basic-border-warning)] text-[var(--c3-style-basic-fg-warning)]" },
      // GHOST — text only
      { variant: "ghost", appearance: "accent", class: "text-[var(--c3-style-basic-fg-accent)]" },
      { variant: "ghost", appearance: "secondary", class: "text-[var(--c3-style-basic-fg-primary)]" },
      { variant: "ghost", appearance: "success", class: "text-[var(--c3-style-basic-fg-success)]" },
      { variant: "ghost", appearance: "danger", class: "text-[var(--c3-style-basic-fg-danger)]" },
      { variant: "ghost", appearance: "warning", class: "text-[var(--c3-style-basic-fg-warning)]" },
    ],
    defaultVariants: {
      size: "md",
      variant: "solid",
      appearance: "accent",
    },
  }
)

type ButtonVariant = "solid" | "soft" | "outline" | "ghost"
type ButtonAppearance = "accent" | "secondary" | "success" | "danger" | "warning"

// React 19: ref flows through React.ComponentProps<"button"> + spread — no forwardRef needed.
function Button({
  className,
  variant,
  appearance,
  size,
  asChild = false,
  disabled,
  loading = false,
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "color"> &
  Omit<VariantProps<typeof buttonVariants>, "variant" | "appearance"> & {
    variant?: ButtonVariant
    appearance?: ButtonAppearance
    asChild?: boolean
    loading?: boolean
    leadingIcon?: React.ReactNode
    trailingIcon?: React.ReactNode
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const resolvedVariant: ButtonVariant = variant ?? "solid"
  const resolvedAppearance: ButtonAppearance = appearance ?? "accent"
  const effectiveLeading = loading ? (
    <Loader2 className="animate-spin" aria-hidden="true" />
  ) : (
    leadingIcon
  )
  // asChild renders the consumer's element via Slot, which requires a single child —
  // skip the icon slots in that mode and let the consumer compose their own content.
  const content = asChild ? (
    children
  ) : (
    <>
      {effectiveLeading ? (
        <span data-icon="inline-start" aria-hidden="true" className="inline-flex">
          {effectiveLeading}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span data-icon="inline-end" aria-hidden="true" className="inline-flex">
          {trailingIcon}
        </span>
      ) : null}
    </>
  )
  return (
    <Comp
      data-slot="button"
      data-variant={resolvedVariant}
      data-appearance={resolvedAppearance}
      data-size={size ?? "md"}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(
        buttonVariants({ size, variant: resolvedVariant, appearance: resolvedAppearance }),
        className,
      )}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
export type { ButtonVariant, ButtonAppearance }
