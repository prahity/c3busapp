import * as React from "react"

import type { ListItemEmphasis, ListItemLayout } from "@/components/ui/list-item"

/**
 * Shared between ListItemGroup (provider) and ListItem (consumer). Lives in its
 * own module so the two components don't import each other circularly. A group
 * presets layout/emphasis/hasBorder for its rows; an explicit prop on a ListItem
 * still overrides these.
 */
export type ListItemGroupContextValue = {
  layout?: ListItemLayout
  emphasis?: ListItemEmphasis
  hasBorder?: boolean
}

export const ListItemGroupContext =
  React.createContext<ListItemGroupContextValue | null>(null)
