import * as React from "react"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Header } from "./header"
import { Button } from "./button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"
import "./side-nav-panel-v2.scss"

/**
 * c3 SideNavPanelV2 — verified against Figma node 46461-59762
 * ("Left Side Navigation Panel"): container set 46148-10768 (Side Navigation
 * Base), item set 46148-10606 (Side Navigation Item), section 48645-94998
 * (Nav Accordion).
 *
 * The next-generation left navigation that MERGES the two legacy components
 * (SideNavBar icon rail + SideNavPanel tree) into a single collapsible surface:
 *
 *   expanded  → 256px labeled tree   (header + optional search + sections /
 *               collapsible folder groups / leaf items + optional footer)
 *   collapsed → 48px icon-only rail  (expand toggle + a centered column of
 *               icons — the INVERSE of the legacy SideNavBar, which stays wide
 *               to fit text). Leaf icons show a Tooltip with their label;
 *               folder icons open a Popover flyout listing their children.
 *
 * Authored by composition (mirroring SideNavPanel): nest SideNavPanelV2Section,
 * SideNavPanelV2Group, and SideNavPanelV2Item as children. Single-choice
 * selection is panel-owned via context (controlled `value` + `onValueChange`,
 * or uncontrolled `defaultValue`). Each child reads `collapsed` from context and
 * renders its expanded or icon-only form itself.
 *
 * Color / row state live in side-nav-panel-v2.scss; Tailwind owns layout. Rows
 * recolor via inherited `color`, so icon + label + chevron follow the row color.
 *
 * TOKEN NOTES (documented per repo rule 1):
 *  - Expanded width 256px and collapsed width 48px are RAW values — no
 *    `--c3-style-width-*` token reaches either (scale tops out at w-80 / 80px;
 *    there is no w-48). Applied as `w-[256px]` / `w-[48px]`. The 32px collapsed
 *    row uses the real `--c3-style-width-w-32` token.
 *  - Figma header padding is 10px (spacing/2,5); there is no 10px token, so the
 *    header uses `--c3-style-spacing-8`. All other spacing maps 1:1 by pixel.
 */

type SideNavPanelV2ContextValue = {
  collapsed: boolean
  selectedValue: string | undefined
  selectValue: (value: string) => void
}
const SideNavPanelV2Context = React.createContext<SideNavPanelV2ContextValue>({
  collapsed: false,
  selectedValue: undefined,
  selectValue: () => {},
})

// When rows render inside a collapsed group's flyout popover they behave like
// expanded rows and, on select, close the flyout. `close` is undefined outside
// a flyout.
type FlyoutContextValue = { close?: () => void }
const FlyoutContext = React.createContext<FlyoutContextValue>({})

// Collect every `value` reachable through a group's children (leaf items and
// nested groups). Used so a collapsed folder icon can show the selected state
// when one of its descendants — e.g. a flyout item — is the active selection.
function collectValues(
  children: React.ReactNode,
  acc: Set<string> = new Set<string>(),
): Set<string> {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as { value?: unknown; children?: React.ReactNode }
    if (typeof props.value === "string") acc.add(props.value)
    if (props.children) collectValues(props.children, acc)
  })
  return acc
}

type SideNavPanelV2Props = React.ComponentProps<"nav"> & {
  /** Full labeled tree (256px) vs icon-only rail (48px). Controlled. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Header title. Omit to hide the title block (Figma "Has Title=No"). */
  title?: React.ReactNode
  /** Header subtitle. Only shown when expanded and a title is present. */
  subtitle?: React.ReactNode
  /** Render a back arrow at the header's start (Figma "Has Back Arrow=Yes"). */
  showBackArrow?: boolean
  onBack?: () => void
  /** Inputs slot — typically an <InputSearch/>. Hidden when collapsed. */
  search?: React.ReactNode
  /** Selected item value (controlled). */
  value?: string
  /** Initial selected item value (uncontrolled). */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Footer slot — e.g. Settings / profile rows. Rendered in both states. */
  footer?: React.ReactNode
}

function SideNavPanelV2({
  className,
  expanded = true,
  onExpandedChange,
  title,
  subtitle,
  showBackArrow = false,
  onBack,
  search,
  value,
  defaultValue,
  onValueChange,
  footer,
  children,
  ...props
}: SideNavPanelV2Props) {
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

  const collapsed = !expanded

  const ctx = React.useMemo<SideNavPanelV2ContextValue>(
    () => ({ collapsed, selectedValue, selectValue }),
    [collapsed, selectedValue, selectValue],
  )

  const toggle = (
    <Button
      variant="ghost"
      appearance="secondary"
      size="icon-sm"
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      aria-expanded={expanded}
      onClick={() => onExpandedChange?.(collapsed)}
    >
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  )

  return (
    <SideNavPanelV2Context.Provider value={ctx}>
      <nav
        data-slot="side-nav-panel-v2"
        data-expanded={expanded}
        aria-label={typeof title === "string" ? title : "Side navigation"}
        className={cn(
          "side-nav-panel-v2 flex h-full flex-col",
          collapsed ? "side-nav-panel-v2--collapsed items-center" : "",
          className,
        )}
        {...props}
      >
        {collapsed ? (
          <div className="side-nav-panel-v2__rail-top flex shrink-0 justify-center pt-[var(--c3-style-spacing-8)]">
            {toggle}
          </div>
        ) : (
          <div className="side-nav-panel-v2__header flex shrink-0 items-start gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] pt-[var(--c3-style-spacing-8)]">
            {showBackArrow ? (
              <Button
                variant="ghost"
                appearance="secondary"
                size="icon-sm"
                aria-label="Back"
                onClick={onBack}
              >
                <ArrowLeft />
              </Button>
            ) : null}
            {title ? (
              <Header
                size="sm"
                title={title}
                subtitle={subtitle}
                actions={toggle}
                className="min-w-px flex-1"
              />
            ) : (
              <div className="ml-auto">{toggle}</div>
            )}
          </div>
        )}

        {!collapsed && search ? (
          <div className="side-nav-panel-v2__search shrink-0 px-[var(--c3-style-spacing-16)] pb-[var(--c3-style-spacing-8)] pt-[var(--c3-style-spacing-8)]">
            {search}
          </div>
        ) : null}

        <div
          className={cn(
            // py-8 is shared by both states so the first row (item or icon) sits
            // the same 8px below the toggle whether expanded or collapsed — the
            // expanded header and the collapsed rail-top both start the toggle at
            // pt-8, so the first row must not shift vertically when toggling.
            "side-nav-panel-v2__content flex min-h-px flex-1 flex-col gap-[var(--c3-style-spacing-4)] overflow-y-auto px-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-8)]",
            collapsed && "items-center",
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              "side-nav-panel-v2__footer flex shrink-0 flex-col gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] pb-[var(--c3-style-spacing-16)] pt-[var(--c3-style-spacing-16)]",
              collapsed && "items-center",
            )}
          >
            {footer}
          </div>
        ) : null}
      </nav>
    </SideNavPanelV2Context.Provider>
  )
}

// ─── Shared row ──────────────────────────────────────────────────────────────
// One presentational row used by leaf items, group headers, and flyout rows.
// Color is inherited so the icon (currentColor SVG), label and trailing recolor
// together via the row's `color` (set per-state in the SCSS).
type NavRowProps = Omit<React.ComponentProps<"button">, "value"> & {
  selected?: boolean
  collapsed?: boolean
  icon?: React.ReactNode
  label: React.ReactNode
  /** Optional trailing content — a chevron for groups, an overflow button, etc. */
  trailing?: React.ReactNode
}

function NavRow({
  className,
  selected,
  collapsed,
  icon,
  label,
  trailing,
  disabled,
  ...props
}: NavRowProps) {
  return (
    <button
      type="button"
      data-slot="side-nav-panel-v2-item"
      data-selected={selected || undefined}
      data-collapsed={collapsed || undefined}
      disabled={disabled}
      className={cn(
        "side-nav-panel-v2-item flex shrink-0 items-center rounded-[var(--c3-style-border-radius-6)]",
        collapsed
          ? "justify-center"
          : "w-full gap-[var(--c3-style-spacing-8)] py-[var(--c3-style-spacing-2)] pl-[var(--c3-style-spacing-8)] pr-[var(--c3-style-spacing-6)] text-left",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="side-nav-panel-v2-item__icon inline-flex shrink-0 items-center [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      {!collapsed ? (
        <>
          <span
            className={cn(
              "side-nav-panel-v2-item__label min-w-px flex-1 truncate",
              selected ? "text-c3-bold-body-p2" : "text-c3-regular-body-p2",
            )}
          >
            {label}
          </span>
          {trailing ? (
            <span className="side-nav-panel-v2-item__trailing inline-flex shrink-0 items-center [&_svg]:size-4">
              {trailing}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  )
}

// ─── Leaf item ───────────────────────────────────────────────────────────────
type SideNavPanelV2ItemProps = Omit<React.ComponentProps<"button">, "value"> & {
  value: string
  icon?: React.ReactNode
  label: React.ReactNode
  /** Trailing icon shown after the label when expanded (Figma "Show Right Icon"). */
  trailing?: React.ReactNode
  disabled?: boolean
}

function SideNavPanelV2Item({
  value,
  icon,
  label,
  trailing,
  disabled = false,
  onClick,
  ...props
}: SideNavPanelV2ItemProps) {
  const { collapsed, selectedValue, selectValue } = React.useContext(
    SideNavPanelV2Context,
  )
  const flyout = React.useContext(FlyoutContext)
  const selected = selectedValue === value
  // Inside a flyout the row is always drawn expanded regardless of rail state.
  const drawCollapsed = collapsed && !flyout.close

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Let the caller's handler run first so an action row (e.g. a theme toggle
    // in the footer) can call event.preventDefault() to opt out of selection —
    // it is an action, not a route, and must not drive `onValueChange`.
    onClick?.(event)
    if (event.defaultPrevented) return
    selectValue(value)
    flyout.close?.()
  }

  const row = (
    <NavRow
      selected={selected}
      collapsed={drawCollapsed}
      // Collapsed rows are icon-only; the tooltip is not an accessible name, so
      // label the button directly for screen readers.
      aria-label={
        drawCollapsed && typeof label === "string" ? label : undefined
      }
      aria-current={selected ? "page" : undefined}
      icon={icon}
      label={label}
      trailing={trailing}
      disabled={disabled}
      onClick={handleClick}
      {...props}
    />
  )

  if (drawCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }
  return row
}

// ─── Collapsible folder group ────────────────────────────────────────────────
type SideNavPanelV2GroupProps = Omit<React.ComponentProps<"div">, "value"> & {
  /** Optional — makes the group row itself selectable (Figma "Selected Folder"). */
  value?: string
  icon?: React.ReactNode
  label: React.ReactNode
  defaultOpen?: boolean
  disabled?: boolean
}

function SideNavPanelV2Group({
  className,
  value,
  icon,
  label,
  defaultOpen = false,
  disabled = false,
  children,
  ...props
}: SideNavPanelV2GroupProps) {
  const { collapsed, selectedValue, selectValue } = React.useContext(
    SideNavPanelV2Context,
  )
  const parentFlyout = React.useContext(FlyoutContext)
  const [open, setOpen] = React.useState(defaultOpen)
  const [flyoutOpen, setFlyoutOpen] = React.useState(false)
  const selected = value !== undefined && selectedValue === value
  const drawCollapsed = collapsed && !parentFlyout.close

  // A collapsed folder icon shows the selected state when the active selection is
  // one of its descendants (e.g. an item chosen from its flyout), since those
  // children aren't visible on the rail themselves.
  const containsSelected = React.useMemo(
    () => selectedValue !== undefined && collectValues(children).has(selectedValue),
    [children, selectedValue],
  )

  // Collapsed rail: the folder icon opens a Popover flyout listing its children,
  // which render as full expanded rows (FlyoutContext forces expanded drawing).
  if (drawCollapsed) {
    return (
      <Popover open={flyoutOpen} onOpenChange={setFlyoutOpen}>
        <PopoverTrigger asChild>
          <NavRow
            selected={selected || containsSelected}
            collapsed
            aria-label={typeof label === "string" ? label : undefined}
            aria-current={containsSelected && !selected ? "page" : undefined}
            aria-haspopup="menu"
            aria-expanded={flyoutOpen}
            icon={icon ?? <Folder />}
            label={label}
            disabled={disabled}
          />
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          className="side-nav-panel-v2__flyout flex flex-col gap-[var(--c3-style-spacing-4)] p-[var(--c3-style-spacing-8)]"
        >
          <div className="side-nav-panel-v2__flyout-label truncate px-[var(--c3-style-spacing-8)] pb-[var(--c3-style-spacing-2)] text-c3-bold-label-l3">
            {label}
          </div>
          <FlyoutContext.Provider value={{ close: () => setFlyoutOpen(false) }}>
            {children}
          </FlyoutContext.Provider>
        </PopoverContent>
      </Popover>
    )
  }

  const handleClick = () => {
    setOpen((prev) => !prev)
    if (value !== undefined) selectValue(value)
  }

  return (
    <div className={cn("side-nav-panel-v2__group shrink-0", className)} {...props}>
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
        <div className="side-nav-panel-v2__group-children flex flex-col gap-[var(--c3-style-spacing-4)] pl-[var(--c3-style-spacing-16)] pt-[var(--c3-style-spacing-4)]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

// ─── Section (Nav Accordion) ─────────────────────────────────────────────────
type SideNavPanelV2SectionProps = React.ComponentProps<"div"> & {
  label: React.ReactNode
  infoIcon?: React.ReactNode
  /** Make the section header a collapse toggle (Figma "Nav Accordion"). */
  collapsible?: boolean
  defaultOpen?: boolean
  /** Draw the bottom hairline that closes the Figma Nav Accordion. Default true. */
  divider?: boolean
}

function SideNavPanelV2Section({
  className,
  label,
  infoIcon,
  collapsible = false,
  defaultOpen = true,
  divider = true,
  children,
  ...props
}: SideNavPanelV2SectionProps) {
  const { collapsed } = React.useContext(SideNavPanelV2Context)
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div
      data-slot="side-nav-panel-v2-section"
      className={cn(
        "side-nav-panel-v2__section flex shrink-0 flex-col gap-[var(--c3-style-spacing-4)]",
        divider &&
          "side-nav-panel-v2__section--divider pb-[var(--c3-style-spacing-8)]",
        collapsed && "items-center",
        className,
      )}
      {...props}
    >
      {!collapsed ? (
        collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((p) => !p)}
            className="side-nav-panel-v2__section-header flex items-center gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] pt-[var(--c3-style-spacing-8)] text-left"
          >
            <span className="side-nav-panel-v2__section-label min-w-px flex-1 truncate text-c3-regular-label-l3">
              {label}
            </span>
            <span className="side-nav-panel-v2__section-chevron inline-flex shrink-0 items-center [&_svg]:size-4">
              {open ? <ChevronDown /> : <ChevronRight />}
            </span>
          </button>
        ) : (
          <div className="side-nav-panel-v2__section-header flex items-center gap-[var(--c3-style-spacing-4)] px-[var(--c3-style-spacing-8)] pb-[var(--c3-style-spacing-2)] pt-[var(--c3-style-spacing-8)]">
            <span className="side-nav-panel-v2__section-label truncate text-c3-regular-label-l3">
              {label}
            </span>
            {infoIcon ? (
              <span className="side-nav-panel-v2__section-info inline-flex shrink-0 items-center [&_svg]:size-3">
                {infoIcon}
              </span>
            ) : null}
          </div>
        )
      ) : null}
      {open ? (
        <div
          className={cn(
            "side-nav-panel-v2__section-items flex flex-col gap-[var(--c3-style-spacing-4)]",
            collapsed && "items-center",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export {
  SideNavPanelV2,
  SideNavPanelV2Item,
  SideNavPanelV2Group,
  SideNavPanelV2Section,
}
export type {
  SideNavPanelV2Props,
  SideNavPanelV2ItemProps,
  SideNavPanelV2GroupProps,
  SideNavPanelV2SectionProps,
}
