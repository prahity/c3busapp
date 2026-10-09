import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import "./link.scss"

/**
 * c3 Link — an inline, accent-colored text link (Figma node 44950-5445).
 *
 * Renders a semantic <a> (or any element via `asChild`, e.g. a router Link).
 * Interactive states are CSS-driven (hover/active underline, focus bg + ring) —
 * there is no `state` prop. Icons are slots, matching Button:
 *   leadingIcon / trailingIcon — pass a lucide glyph (12px on sm, 16px on md/lg)
 *
 * Only the "primary" style exists today, so there is no `style`/variant axis.
 * Color/spacing/state tokens live in link.scss; Tailwind here owns flex layout,
 * typography, and icon sizing.
 */

type LinkSize = "sm" | "md" | "lg"

type LinkProps = React.ComponentProps<"a"> & {
  size?: LinkSize
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  disabled?: boolean
  asChild?: boolean
}

// Typography + icon sizing per size (sm = L3/12px glyphs; md & lg = L2/16px).
const SIZE_TEXT: Record<LinkSize, string> = {
  sm: "text-c3-regular-label-l3 [&_svg]:size-3",
  md: "text-c3-regular-label-l2 [&_svg]:size-4",
  lg: "text-c3-regular-label-l2 [&_svg]:size-4",
}

// React 19: ref flows through React.ComponentProps<"a"> + spread — no forwardRef.
function Link({
  className,
  size = "md",
  leadingIcon,
  trailingIcon,
  disabled = false,
  asChild = false,
  href,
  children,
  ...props
}: LinkProps) {
  const Comp = asChild ? Slot.Root : "a"

  const content = asChild ? (
    children
  ) : (
    <>
      {leadingIcon ? (
        <span
          aria-hidden="true"
          className="link__icon link__icon--start inline-flex shrink-0 items-center"
        >
          {leadingIcon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span
          aria-hidden="true"
          className="link__icon link__icon--end inline-flex shrink-0 items-center"
        >
          {trailingIcon}
        </span>
      ) : null}
    </>
  )

  return (
    <Comp
      data-slot="link"
      data-size={size}
      // A disabled link drops its href and is removed from the tab order.
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : props.tabIndex}
      className={cn(
        "link",
        `link--size-${size}`,
        "inline-flex items-center justify-center whitespace-nowrap outline-none",
        SIZE_TEXT[size],
        className,
      )}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Link }
export type { LinkProps, LinkSize }
