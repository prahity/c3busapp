import * as React from "react"
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Header } from "./header"
import { Button } from "./button"
import "./side-nav-panel.scss"

/**
 * c3 SideNavPanel — verified against Figma node 45053-612 (items: 45053-668).
 *
 * A vertical navigation *tree* panel — distinct from the icon-only SideNavBar
 * rail. Expanded (256px) it stacks: a Header (title + subtitle + collapse
 * toggle) → section labels, collapsible folder groups, and nested leaf items →
 * an optional footer button stack. Collapsed (36px) it shows just the expand
 * toggle and the title set vertically.
 *
 * Authored by composition (mirroring SideNavBar): nest SideNavPanelSection,
 * SideNavPanelGroup, and SideNavPanelItem as children. Single-choice selection
 * is panel-owned and propagated via context — controlled with `value` +
 * `onValueChange`, or uncontrolled via `defaultValue`. Groups manage their own
 * open/closed state locally (`defaultOpen`) and may also carry a `value` to be
 * selectable in their own right.
 *
 * The expanded/collapsed split is a controlled `expanded` boolean (not a
 * variant); wire `onExpandedChange` to the toggle. Color/state live in
 * side-nav-panel.scss; Tailwind owns layout. Rows rely on inherited `color`, so
 * icon + label + chevron recolor together on hover/selected.
 */

type SideNavPanelContextValue = {
  selectedValue: string | undefined
  selectValue: (value: string) => void
}
const SideNavPanelContext = React.createContext<SideNavPanelContextValue>({
  selectedValue: undefined,
  selectValue: () => {},
})

type SideNavPanelProps = React.ComponentProps<"nav"> & {
  /** Expanded (full tree) vs collapsed (36px rail). Controlled. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Selected item value (controlled). */
  value?: string
  /** Initial selected item value (uncontrolled). */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Footer slot — typically a stack of <Button>s. Hidden when not provided. */
  footer?: React.ReactNode
}

function SideNavPanel({
  className,
  expanded = true,
  onExpandedChange,
  title,
  subtitle,
  value,
  defaultValue,
  onValueChange,
  footer,
  children,
  ...props
}: SideNavPanelProps) {
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

  const ctx = React.useMemo<SideNavPanelContextValue>(
    () => ({ selectedValue, selectValue }),
    [selectedValue, selectValue],
  )

  if (!expanded) {
    return (
      <nav
        data-slot="side-nav-panel"
        data-expanded={false}
        className={cn(
          "side-nav-panel side-nav-panel--collapsed",
          "flex w-[var(--c3-style-width-w-36)] flex-col items-center gap-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-8)]",
          className,
        )}
        {...props}
      >
        <Button
          variant="ghost"
          appearance="secondary"
          size="icon-sm"
          aria-label="Expand navigation"
          onClick={() => onExpandedChange?.(true)}
        >
          <PanelLeftOpen />
        </Button>
        {title ? (
          <span className="side-nav-panel__collapsed-title text-c3-bold-heading-h6 [writing-mode:vertical-rl]">
            {title}
          </span>
        ) : null}
      </nav>
    )
  }

  return (
    <SideNavPanelContext.Provider value={ctx}>
      <nav
        data-slot="side-nav-panel"
        data-expanded={true}
        className={cn("side-nav-panel", "flex w-[256px] flex-col", className)}
        {...props}
      >
        <Header
          size="md"
          title={title}
          subtitle={subtitle}
          actions={
            <Button
              variant="ghost"
              appearance="secondary"
              size="icon-sm"
              aria-label="Collapse navigation"
              onClick={() => onExpandedChange?.(false)}
            >
              <PanelLeftClose />
            </Button>
          }
          className="side-nav-panel__header shrink-0 px-[var(--c3-style-spacing-16)] pt-[var(--c3-style-spacing-16)]"
        />

        <div className="side-nav-panel__body flex min-h-px flex-1 flex-col gap-[var(--c3-style-spacing-2)] overflow-y-auto p-[var(--c3-style-spacing-8)]">
          {children}
        </div>

        {footer ? (
          <div className="side-nav-panel__footer flex shrink-0 flex-col items-center gap-[var(--c3-style-spacing-8)] px-[var(--c3-style-spacing-16)] pb-[var(--c3-style-spacing-16)] pt-[var(--c3-style-spacing-8)]">
            {footer}
          </div>
        ) : null}
      </nav>
    </SideNavPanelContext.Provider>
  )
}

// Shared row used by both leaf items and group headers. Color is inherited, so
// icon + label + trailing recolor together via the row's `color`.
type NavRowProps = Omit<React.ComponentProps<"button">, "value"> & {
  selected?: boolean
  icon?: React.ReactNode
  label: React.ReactNode
  trailing?: React.ReactNode
}

function NavRow({
  className,
  selected,
  icon,
  label,
  trailing,
  disabled,
  ...props
}: NavRowProps) {
  return (
    <button
      type="button"
      data-slot="side-nav-panel-item"
      data-selected={selected || undefined}
      disabled={disabled}
      className={cn(
        "side-nav-panel-item",
        "flex w-full items-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] p-[var(--c3-style-spacing-8)] text-left",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="side-nav-panel-item__icon inline-flex shrink-0 items-center [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <span
        className={cn(
          "side-nav-panel-item__label min-w-px flex-1 truncate",
          selected ? "text-c3-bold-body-p2" : "text-c3-regular-body-p2",
        )}
      >
        {label}
      </span>
      {trailing ? (
        <span className="side-nav-panel-item__trailing inline-flex shrink-0 items-center [&_svg]:size-4">
          {trailing}
        </span>
      ) : null}
    </button>
  )
}

type SideNavPanelItemProps = Omit<React.ComponentProps<"button">, "value"> & {
  value: string
  icon?: React.ReactNode
  label: React.ReactNode
  disabled?: boolean
}

function SideNavPanelItem({
  value,
  icon,
  label,
  disabled = false,
  onClick,
  ...props
}: SideNavPanelItemProps) {
  const { selectedValue, selectValue } = React.useContext(SideNavPanelContext)
  const selected = selectedValue === value

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    selectValue(value)
    onClick?.(event)
  }

  return (
    <NavRow
      selected={selected}
      aria-current={selected ? "page" : undefined}
      icon={icon}
      label={label}
      disabled={disabled}
      onClick={handleClick}
      {...props}
    />
  )
}

type SideNavPanelGroupProps = Omit<React.ComponentProps<"div">, "value"> & {
  /** Optional — makes the group row itself selectable. */
  value?: string
  icon?: React.ReactNode
  label: React.ReactNode
  defaultOpen?: boolean
  disabled?: boolean
}

function SideNavPanelGroup({
  className,
  value,
  icon,
  label,
  defaultOpen = false,
  disabled = false,
  children,
  ...props
}: SideNavPanelGroupProps) {
  const { selectedValue, selectValue } = React.useContext(SideNavPanelContext)
  const [open, setOpen] = React.useState(defaultOpen)
  const selected = value !== undefined && selectedValue === value

  const handleClick = () => {
    setOpen((prev) => !prev)
    if (value !== undefined) selectValue(value)
  }

  return (
    <div className={cn("side-nav-panel__group", className)} {...props}>
      <NavRow
        selected={selected}
        aria-expanded={open}
        aria-current={selected ? "page" : undefined}
        icon={icon}
        label={label}
        trailing={open ? <ChevronDown /> : <ChevronRight />}
        disabled={disabled}
        onClick={handleClick}
      />
      {open && children ? (
        <div className="side-nav-panel__group-children flex flex-col gap-[var(--c3-style-spacing-2)] pl-[var(--c3-style-spacing-16)]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

type SideNavPanelSectionProps = React.ComponentProps<"div"> & {
  label: React.ReactNode
  infoIcon?: React.ReactNode
}

function SideNavPanelSection({
  className,
  label,
  infoIcon,
  ...props
}: SideNavPanelSectionProps) {
  return (
    <div
      className={cn(
        "side-nav-panel__section flex items-center gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] pb-[var(--c3-style-spacing-2)] pt-[var(--c3-style-spacing-8)]",
        className,
      )}
      {...props}
    >
      <span className="side-nav-panel__section-label text-c3-regular-label-l3 truncate">
        {label}
      </span>
      {infoIcon ? (
        <span className="side-nav-panel__section-info inline-flex shrink-0 items-center [&_svg]:size-3">
          {infoIcon}
        </span>
      ) : null}
    </div>
  )
}

export {
  SideNavPanel,
  SideNavPanelItem,
  SideNavPanelGroup,
  SideNavPanelSection,
}
export type {
  SideNavPanelProps,
  SideNavPanelItemProps,
  SideNavPanelGroupProps,
  SideNavPanelSectionProps,
}
