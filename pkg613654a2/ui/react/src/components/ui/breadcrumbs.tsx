import * as React from "react"
import { Slash, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import "./breadcrumbs.scss"

/**
 * c3 Breadcrumbs — a data-driven navigation trail (Figma 3771-68266).
 *
 * Pass an ordered `items` array; the component renders the trail, the `Slash`
 * separators, and the current-item styling for you:
 *   - Fewer than 2 levels → renders nothing (a single page needs no trail).
 *   - 5 or more levels → collapses the middle into an ellipsis:
 *       first / … / second-to-last / last
 *   - The last item is the current page: darker (fg-neutral), non-interactive,
 *     marked aria-current="page".
 *
 * Two sizes (md / lg) drive typography + icon size only. Each item supports
 * optional slots: a leading icon, a trailing outline Badge pill, and a dropdown
 * chevron (for crumbs that open a menu).
 *
 * Color/spacing tokens live in breadcrumbs.scss — see
 * references/scss-bem-convention.md. Tailwind here owns layout, typography, and
 * icon sizing only.
 */
type BreadcrumbsSize = "md" | "lg"

type BreadcrumbItemData = {
  /** The crumb's visible text (or node). */
  label: React.ReactNode
  /** Renders the crumb as a link. Omit for a plain (button/static) crumb. */
  href?: string
  /** Click handler — renders a <button> crumb when there's no href. */
  onClick?: React.MouseEventHandler
  /** Optional leading icon (lucide-react). Sized 12px (md) / 16px (lg). */
  leadingIcon?: React.ReactNode
  /** Optional trailing outline Badge pill — pass its label/content. */
  badge?: React.ReactNode
  /** Renders a trailing chevron, e.g. for a crumb that opens a menu. */
  hasDropdown?: boolean
}

type BreadcrumbsProps = Omit<React.ComponentProps<"nav">, "children"> & {
  items: BreadcrumbItemData[]
  size?: BreadcrumbsSize
}

// Typography is Tailwind's job; SCSS owns color + spacing tokens.
const SIZE_TEXT: Record<BreadcrumbsSize, string> = {
  md: "text-c3-regular-label-l3",
  lg: "text-c3-regular-label-l1",
}
const SIZE_ICON: Record<BreadcrumbsSize, string> = {
  md: "size-3", // 12px
  lg: "size-4", // 16px
}
// Literal svg-targeting classes (kept whole so Tailwind's JIT can see them).
const SIZE_ICON_SLOT: Record<BreadcrumbsSize, string> = {
  md: "[&_svg]:size-3",
  lg: "[&_svg]:size-4",
}

// Sentinel for the collapsed middle. Distinct object identity, never a real item.
const ELLIPSIS = Symbol("breadcrumbs-ellipsis")
type Renderable = BreadcrumbItemData | typeof ELLIPSIS

// React 19: ref flows through React.ComponentProps<"nav"> + spread — no forwardRef needed.
function Breadcrumbs({ className, items, size, ...props }: BreadcrumbsProps) {
  // A single page (or empty) has no trail to show.
  if (items.length < 2) return null

  const resolvedSize: BreadcrumbsSize = size ?? "md"
  const textClass = SIZE_TEXT[resolvedSize]
  const iconClass = SIZE_ICON[resolvedSize]

  // Collapse the middle once we hit 5+ levels: first / … / second-to-last / last.
  const visible: Renderable[] =
    items.length >= 5
      ? [items[0], ELLIPSIS, items[items.length - 2], items[items.length - 1]]
      : items

  return (
    <nav
      data-slot="breadcrumbs"
      data-size={resolvedSize}
      aria-label="Breadcrumb"
      className={cn("breadcrumbs", `breadcrumbs--size-${resolvedSize}`, className)}
      {...props}
    >
      <ol className="breadcrumbs__list">
        {visible.map((entry, i) => {
          const separator =
            i > 0 ? (
              <li
                key={`sep-${i}`}
                aria-hidden="true"
                className="breadcrumbs__separator inline-flex items-center"
              >
                <Slash className={iconClass} />
              </li>
            ) : null

          if (entry === ELLIPSIS) {
            return (
              <React.Fragment key="ellipsis">
                {separator}
                <li
                  aria-hidden="true"
                  className={cn("breadcrumbs__ellipsis inline-flex items-center", textClass)}
                >
                  …
                </li>
              </React.Fragment>
            )
          }

          const isLast = i === visible.length - 1
          const inner = (
            <>
              {entry.leadingIcon ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "breadcrumbs__icon inline-flex items-center",
                    SIZE_ICON_SLOT[resolvedSize],
                  )}
                >
                  {entry.leadingIcon}
                </span>
              ) : null}
              <span className="breadcrumbs__label">{entry.label}</span>
              {entry.badge != null ? (
                <Badge variant="outline" shape="pill" size="sm">
                  {entry.badge}
                </Badge>
              ) : null}
              {entry.hasDropdown ? (
                <ChevronDown
                  aria-hidden="true"
                  className={cn("breadcrumbs__chevron", iconClass)}
                />
              ) : null}
            </>
          )

          let crumb: React.ReactNode
          if (isLast) {
            crumb = (
              <span
                aria-current="page"
                className={cn("breadcrumbs__current inline-flex items-center", textClass)}
              >
                {inner}
              </span>
            )
          } else if (entry.href) {
            crumb = (
              <a
                href={entry.href}
                onClick={entry.onClick}
                className={cn("breadcrumbs__link inline-flex items-center", textClass)}
              >
                {inner}
              </a>
            )
          } else if (entry.onClick) {
            crumb = (
              <button
                type="button"
                onClick={entry.onClick}
                className={cn("breadcrumbs__link inline-flex items-center", textClass)}
              >
                {inner}
              </button>
            )
          } else {
            crumb = (
              <span className={cn("breadcrumbs__link breadcrumbs__link--static inline-flex items-center", textClass)}>
                {inner}
              </span>
            )
          }

          return (
            <React.Fragment key={i}>
              {separator}
              <li className="breadcrumbs__item inline-flex items-center">{crumb}</li>
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumbs }
export type { BreadcrumbsSize, BreadcrumbItemData }
