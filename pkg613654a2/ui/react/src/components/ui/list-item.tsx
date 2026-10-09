import * as React from "react"

import { cn } from "@/lib/utils"
import { ListItemGroupContext } from "@/components/ui/list-item-group-context"
import "./list-item.scss"

/**
 * c3 List Item — one row of a key/value list (Figma node 43672-5460).
 *
 * Two layouts:
 *   inline   — label on the left, value block right-aligned on the same row
 *   stacked  — optional avatar/icon, then label-over-value, then an optional
 *              right action
 *
 * `emphasis` chooses which line reads as primary (L2/fg-primary) vs secondary
 * (P3/fg-secondary): "value" (default), "label", or "none" (both muted).
 *
 * Adornments are slots, not booleans (matches Header): pass <Avatar/>, a lucide
 * icon, a ghost <Button/>, or a <Badge/> as the value for the "badge" value type.
 * Inside a <ListItemGroup> the layout/emphasis/hasBorder defaults come from the
 * group; explicit props always win.
 *
 * Spacing/border/colors live in list-item.scss; Tailwind owns flex layout +
 * the text-c3-* typography classes.
 */

type ListItemLayout = "stacked" | "inline"
type ListItemEmphasis = "value" | "label" | "none"

type ListItemProps = React.ComponentProps<"div"> & {
  label: React.ReactNode
  value?: React.ReactNode
  secondaryValue?: React.ReactNode
  layout?: ListItemLayout
  emphasis?: ListItemEmphasis
  labelIcon?: React.ReactNode
  avatar?: React.ReactNode
  rightAction?: React.ReactNode
  hasBorder?: boolean
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function ListItem({
  className,
  label,
  value,
  secondaryValue,
  layout: layoutProp,
  emphasis: emphasisProp,
  labelIcon,
  avatar,
  rightAction,
  hasBorder: hasBorderProp,
  ...props
}: ListItemProps) {
  // Group context supplies defaults; explicit props override.
  const group = React.useContext(ListItemGroupContext)
  const layout: ListItemLayout = layoutProp ?? group?.layout ?? "inline"
  const emphasis: ListItemEmphasis = emphasisProp ?? group?.emphasis ?? "value"
  const hasBorder = hasBorderProp ?? group?.hasBorder ?? false

  // The prominent line is L2 (medium 14px); muted lines are P3 (regular 12px).
  // "label" emphasis promotes the label; "value"/"none" promote the value.
  const labelType =
    emphasis === "label" ? "text-c3-regular-label-l2" : "text-c3-regular-body-p3"
  const valueType =
    emphasis === "value" ? "text-c3-regular-label-l2" : "text-c3-regular-body-p3"

  // NB: the block class `list-item` collides with Tailwind's `list-item`
  // display utility, so it must NOT share a cn() string with a Tailwind display
  // utility (e.g. `flex`) — tailwind-merge would treat them as conflicting and
  // drop the block. So flex/width/align live in list-item.scss, keyed off
  // data-layout; cn() here carries only BEM classes + the consumer's className.
  const root = (children: React.ReactNode) => (
    <div
      data-slot="list-item"
      data-layout={layout}
      data-emphasis={emphasis}
      className={cn("list-item", hasBorder && "list-item--bordered", className)}
      {...props}
    >
      {children}
    </div>
  )

  if (layout === "stacked") {
    return root(
      <>
        {avatar ? <span className="list-item__avatar shrink-0">{avatar}</span> : null}
        {labelIcon ? (
          <span className="list-item__label-icon inline-flex shrink-0 items-center [&_svg]:size-4">
            {labelIcon}
          </span>
        ) : null}
        <div className="list-item__main flex min-w-px flex-1 flex-col">
          <span className={cn("list-item__label truncate", labelType)}>{label}</span>
          {value != null ? (
            <span className={cn("list-item__value", valueType)}>{value}</span>
          ) : null}
          {secondaryValue != null ? (
            <span className="list-item__secondary text-c3-regular-body-p3">
              {secondaryValue}
            </span>
          ) : null}
        </div>
        {rightAction ? (
          <span className="list-item__action shrink-0">{rightAction}</span>
        ) : null}
      </>,
    )
  }

  // inline
  return root(
    <>
      <span className={cn("list-item__label min-w-px flex-1 truncate", labelType)}>
        {label}
      </span>
      <div className="list-item__values flex shrink-0 flex-col items-end text-right">
        {value != null ? (
          <span className={cn("list-item__value", valueType)}>{value}</span>
        ) : null}
        {secondaryValue != null ? (
          <span className="list-item__secondary text-c3-regular-body-p3">
            {secondaryValue}
          </span>
        ) : null}
      </div>
    </>,
  )
}

export { ListItem }
export type { ListItemProps, ListItemLayout, ListItemEmphasis }
