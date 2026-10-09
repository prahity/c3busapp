import * as React from "react"

import { cn } from "@/lib/utils"
import {
  ListItemGroupContext,
  type ListItemGroupContextValue,
} from "@/components/ui/list-item-group-context"

/**
 * c3 List Item Group — stacks <ListItem>s with a preset configuration
 * (Figma node 44562-27605).
 *
 * `type` presets the contained rows via context (same pattern as Tabs/TabsContext):
 *   compact      — inline rows
 *   normal       — stacked rows, value-emphasis
 *   with-avatar  — stacked rows, label-emphasis (pass an <Avatar/> per row)
 * All presets give the rows a bottom border. Any prop set directly on a child
 * ListItem overrides the group default.
 */

type ListItemGroupType = "compact" | "normal" | "with-avatar"

type ListItemGroupProps = React.ComponentProps<"div"> & {
  type?: ListItemGroupType
  children: React.ReactNode
}

const TYPE_DEFAULTS: Record<ListItemGroupType, ListItemGroupContextValue> = {
  compact: { layout: "inline", hasBorder: true },
  normal: { layout: "stacked", emphasis: "value", hasBorder: true },
  "with-avatar": { layout: "stacked", emphasis: "label", hasBorder: true },
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function ListItemGroup({
  className,
  type = "compact",
  children,
  ...props
}: ListItemGroupProps) {
  return (
    <ListItemGroupContext.Provider value={TYPE_DEFAULTS[type]}>
      <div
        data-slot="list-item-group"
        data-type={type}
        className={cn("flex w-full flex-col overflow-hidden", className)}
        {...props}
      >
        {children}
      </div>
    </ListItemGroupContext.Provider>
  )
}

export { ListItemGroup }
export type { ListItemGroupProps, ListItemGroupType }
