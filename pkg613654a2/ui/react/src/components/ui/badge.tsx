import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import "./badge.scss"

/**
 * c3 Badge — a single component matching the Figma component grid:
 *   variant:    solid | soft | outline | indicator   (the *visual style*)
 *   size:       sm | md                               (layout — padding only)
 *   shape:      pill | rounded                         (border radius)
 *   appearance: primary | secondary | accent | success | warning | danger | info
 *
 * `variant="indicator"` is a special mode: a bare 8px dot (no text, icons, or
 * avatar) used standalone or overlaid on a target's top-right corner. All other
 * props except `appearance` are ignored in that mode.
 *
 * Orthogonal options (compose with everything above):
 *   leadingIcon / trailingIcon — 12px inline icon slots (hidden unless provided).
 *     Pass a spinning icon (e.g. <Loader2 className="animate-spin" />) for a busy badge.
 *   avatarSrc — small circular leading avatar (hidden unless provided).
 *   onClick   — makes the badge interactive: role=button, focusable, keyboard
 *               activation, hover + focus ring.
 *   onDelete  — renders a trailing close (X) button.
 *
 * Theming (variant × appearance colors, focus ring, hover overlay, indicator dot)
 * lives in badge.scss — see references/scss-bem-convention.md. Tailwind here owns
 * layout, sizing, and typography only.
 */
const badgeVariants = cva(
  // base layout — non-thematic; theme lives in badge.scss
  [
    "inline-flex shrink-0 items-center justify-center",
    "border border-solid border-transparent bg-clip-padding",
    "font-sans text-c3-regular-label-l3 whitespace-nowrap select-none outline-none",
    "gap-[var(--c3-style-spacing-2)]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  ].join(" "),
  {
    variants: {
      size: {
        // sm: 6px inline / 2px block · md: 8px inline / 6px block (Figma 326-2134)
        sm: "px-[var(--c3-style-spacing-6)] py-[var(--c3-style-spacing-2)]",
        md: "px-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-6)]",
      },
      shape: {
        pill: "rounded-[var(--c3-style-border-radius-rounded)]",
        rounded: "rounded-[var(--c3-style-border-radius-4)]",
      },
    },
    defaultVariants: {
      size: "md",
      shape: "pill",
    },
  }
)

type BadgeVariant = "solid" | "soft" | "outline" | "indicator"
type BadgeSize = "sm" | "md"
type BadgeShape = "pill" | "rounded"
type BadgeAppearance =
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"

type BadgeProps = Omit<React.ComponentProps<"span">, "onClick"> &
  VariantProps<typeof badgeVariants> & {
    variant?: BadgeVariant
    appearance?: BadgeAppearance
    asChild?: boolean
    /** 12px inline icon at the start. Pass a spinning icon for a busy badge. */
    leadingIcon?: React.ReactNode
    /** 12px inline icon at the end. */
    trailingIcon?: React.ReactNode
    /** Image src for a small circular leading avatar. */
    avatarSrc?: string
    /** When set, the badge becomes interactive (button semantics + focus ring). */
    onClick?: () => void
    /** When set, renders a trailing close (X) button that calls this on click. */
    onDelete?: () => void
  }

// React 19: ref flows through React.ComponentProps<"span"> + spread — no forwardRef needed.
function Badge({
  className,
  variant,
  appearance,
  size,
  shape,
  asChild = false,
  leadingIcon,
  trailingIcon,
  avatarSrc,
  onClick,
  onDelete,
  children,
  ...props
}: BadgeProps) {
  const resolvedVariant: BadgeVariant = variant ?? "solid"
  const resolvedAppearance: BadgeAppearance = appearance ?? "primary"

  // --- Indicator: bare 8px dot, ignores children/icons/avatar/size/shape. -----
  if (resolvedVariant === "indicator") {
    return (
      <span
        data-slot="badge"
        data-variant="indicator"
        data-appearance={resolvedAppearance}
        className={cn(
          "badge-indicator",
          `badge-indicator--appearance-${resolvedAppearance}`,
          "inline-block size-2 shrink-0 rounded-[var(--c3-style-border-radius-rounded)]",
          className,
        )}
        {...props}
      />
    )
  }

  const Comp = asChild ? Slot.Root : "span"
  const interactive = typeof onClick === "function"

  const handleKeyDown = interactive
    ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }
    : undefined

  // asChild renders the consumer's element via Slot, which requires a single child —
  // skip the slots in that mode and let the consumer compose their own content.
  const content = asChild ? (
    children
  ) : (
    <>
      {avatarSrc ? (
        <img
          alt=""
          src={avatarSrc}
          className="badge__avatar size-3 shrink-0 rounded-[var(--c3-style-border-radius-rounded)] object-cover"
        />
      ) : null}
      {leadingIcon ? (
        <span
          data-icon="inline-start"
          aria-hidden="true"
          className="badge__icon badge__icon--start inline-flex"
        >
          {leadingIcon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span
          data-icon="inline-end"
          aria-hidden="true"
          className="badge__icon badge__icon--end inline-flex"
        >
          {trailingIcon}
        </span>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label="Remove"
          // stop the click from also triggering an interactive badge's onClick
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="badge__close inline-flex size-3 shrink-0 items-center justify-center"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </>
  )

  return (
    <Comp
      data-slot="badge"
      data-variant={resolvedVariant}
      data-appearance={resolvedAppearance}
      data-size={size ?? "md"}
      data-shape={shape ?? "pill"}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onClick?.() : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "badge",
        `badge--${resolvedVariant}`,
        `badge--appearance-${resolvedAppearance}`,
        interactive && "badge--interactive cursor-pointer",
        badgeVariants({ size, shape }),
        className,
      )}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Badge, badgeVariants }
export type { BadgeVariant, BadgeSize, BadgeShape, BadgeAppearance }
