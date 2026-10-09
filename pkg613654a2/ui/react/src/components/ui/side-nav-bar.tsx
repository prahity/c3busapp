import * as React from "react"

import { cn } from "@/lib/utils"
import "./side-nav-bar.scss"

/**
 * c3 SideNavBar — verified against Figma node 43613-46366.
 *
 * The vertical application rail: a 64px-wide column with a 1px right rule that
 * stacks icon+label nav items. It is the complement of TopNavBar (which lists
 * "sidebar / vertical nav" as out of scope) and is a slot/compound layout
 * component, not a styled primitive.
 *
 * Two configurations are a single `showLabels` boolean — NOT a variant — that
 * propagates to every item via SideNavBarContext (mirroring how Tabs passes
 * size/variant). Items have three states: default (grey), hover, and selected.
 * Hover and selected both wrap the icon in a 40px rounded box; the label is
 * never boxed.
 *
 * Selection is single-choice and rail-owned (like Tabs): exactly one item is
 * selected, identified by `value`. Clicking an item makes it the selected one;
 * it cannot be toggled off, so the count is always exactly 1 (as long as
 * `value`/`defaultValue` names a real item). Controlled via `value` +
 * `onValueChange`, or uncontrolled via `defaultValue`.
 *
 *   children — the top "Primary Navigation" section
 *   footer   — the bottom "Navigation Footer" section (e.g. Settings)
 *
 * Color / box / state live in side-nav-bar.scss; Tailwind here owns layout only.
 */
type SideNavBarContextValue = {
  showLabels: boolean
  selectedValue: string | undefined
  selectValue: (value: string) => void
}
const SideNavBarContext = React.createContext<SideNavBarContextValue>({
  showLabels: true,
  selectedValue: undefined,
  selectValue: () => {},
})

type SideNavBarProps = React.ComponentProps<"nav"> & {
  showLabels?: boolean
  footer?: React.ReactNode
  /** Selected item value (controlled). */
  value?: string
  /** Initial selected item value (uncontrolled). Set this to keep exactly one item selected from first render. */
  defaultValue?: string
  /** Fired with the new value whenever the selected item changes. */
  onValueChange?: (value: string) => void
}

function SideNavBar({
  className,
  showLabels = true,
  footer,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: SideNavBarProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const selectedValue = isControlled ? value : internalValue

  const selectValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange],
  )

  const ctx = React.useMemo<SideNavBarContextValue>(
    () => ({ showLabels, selectedValue, selectValue }),
    [showLabels, selectedValue, selectValue],
  )

  return (
    <SideNavBarContext.Provider value={ctx}>
      <nav
        data-slot="side-nav-bar"
        data-show-labels={showLabels}
        className={cn("side-nav-bar", "flex flex-col items-center", className)}
        {...props}
      >
        <div className="side-nav-bar__primary flex flex-1 flex-col items-center">
          {children}
        </div>
        {footer ? (
          <div className="side-nav-bar__footer flex flex-col items-center">
            {footer}
          </div>
        ) : null}
      </nav>
    </SideNavBarContext.Provider>
  )
}

type SideNavBarItemProps = Omit<React.ComponentProps<"button">, "value"> & {
  /** Unique key for this item; the rail selects by matching this against its `value`. */
  value: string
  icon: React.ReactNode
  label: React.ReactNode
  disabled?: boolean
}

function SideNavBarItem({
  className,
  value,
  icon,
  label,
  disabled = false,
  onClick,
  ...props
}: SideNavBarItemProps) {
  const { showLabels, selectedValue, selectValue } =
    React.useContext(SideNavBarContext)
  const selected = selectedValue === value

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    selectValue(value)
    onClick?.(event)
  }

  return (
    <button
      type="button"
      data-slot="side-nav-bar-item"
      data-selected={selected}
      aria-current={selected ? "page" : undefined}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "side-nav-bar-item",
        "flex flex-col items-center",
        className,
      )}
      {...props}
    >
      <span className="side-nav-bar-item__icon inline-flex items-center justify-center [&_svg]:size-5">
        {icon}
      </span>
      {showLabels && label ? (
        <span className="side-nav-bar-item__label text-c3-regular-label-l4 text-center">
          {label}
        </span>
      ) : null}
    </button>
  )
}

export { SideNavBar, SideNavBarItem }
export type { SideNavBarProps, SideNavBarItemProps }
