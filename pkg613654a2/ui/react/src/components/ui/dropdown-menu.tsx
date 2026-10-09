"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Listbox, ListboxItem, ListboxHeader, ListboxSeparator } from "./listbox"

/**
 * c3 DropdownMenu — an external trigger + a popout that looks like a Listbox
 * but carries menu semantics: role="menu" / role="menuitem", and items perform
 * an action rather than persisting a value.
 *
 * This is NOT the replacement for the removed Dropdown (Combobox is the
 * canonical select surface). DropdownMenu is the actions-menu surface: row
 * overflow menus, toolbar "More ▾" menus, context actions.
 *
 * Composes the project Popover (positioning + chrome + dismissal + focus
 * return) with <Listbox role="menu"> (item rendering + keyboard nav). The
 * trigger is any element supplied via <DropdownMenuTrigger> (rendered asChild),
 * typically a <Button>.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger>
 *       <Button variant="outline" trailingIcon={<ChevronDown />}>Actions</Button>
 *     </DropdownMenuTrigger>
 *     <DropdownMenuItem label="Edit" leftIcon={<Pencil />} onSelect={...} />
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem label="Delete" destructive onSelect={...} />
 *   </DropdownMenu>
 */

type DropdownMenuRegistryEntry = {
  onSelect?: () => void
  closeOnSelect: boolean
}

type DropdownMenuContextValue = {
  closeMenu: () => void
  register: (value: string, entry: DropdownMenuRegistryEntry) => void
  unregister: (value: string) => void
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext(component: string): DropdownMenuContextValue {
  const ctx = React.useContext(DropdownMenuContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <DropdownMenu>`)
  return ctx
}

type DropdownMenuProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  className?: string
  children: React.ReactNode
}

function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  children,
}: DropdownMenuProps) {
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = isControlled ? openProp : internalOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  // Each DropdownMenuItem registers its handler keyed by value; the Listbox's
  // onValueChange dispatches the matching action and closes the menu.
  const registryRef = React.useRef<Map<string, DropdownMenuRegistryEntry>>(new Map())

  const register = React.useCallback((value: string, entry: DropdownMenuRegistryEntry) => {
    registryRef.current.set(value, entry)
  }, [])
  const unregister = React.useCallback((value: string) => {
    registryRef.current.delete(value)
  }, [])
  const closeMenu = React.useCallback(() => setOpen(false), [setOpen])

  const ctxValue = React.useMemo<DropdownMenuContextValue>(
    () => ({ closeMenu, register, unregister }),
    [closeMenu, register, unregister],
  )

  // Separate the trigger from the menu items.
  const childArray = React.Children.toArray(children)
  const trigger = childArray.find(
    (c): c is React.ReactElement => React.isValidElement(c) && c.type === DropdownMenuTrigger,
  )
  const items = childArray.filter((c) => c !== trigger)

  const dispatchSelect = (value: string | null) => {
    if (value == null) return
    const entry = registryRef.current.get(value)
    entry?.onSelect?.()
    if (entry?.closeOnSelect !== false) closeMenu()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent
        data-slot="dropdown-menu-content"
        className={cn("max-h-[var(--radix-popover-content-available-height)] w-max overflow-hidden", className)}
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <DropdownMenuContext.Provider value={ctxValue}>
          <Listbox role="menu" mode="single" autoFocusable onValueChange={dispatchSelect}>
            {items}
          </Listbox>
        </DropdownMenuContext.Provider>
      </PopoverContent>
    </Popover>
  )
}

type DropdownMenuTriggerProps = React.ComponentProps<typeof PopoverTrigger>

/** Renders the consumer's element (typically a <Button>) as the popover trigger. */
function DropdownMenuTrigger({ ...props }: DropdownMenuTriggerProps) {
  return <PopoverTrigger data-slot="dropdown-menu-trigger" asChild {...props} />
}

type DropdownMenuItemProps = {
  value?: string
  label: React.ReactNode
  subLabel?: React.ReactNode
  leftIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  disabled?: boolean
  destructive?: boolean
  onSelect?: () => void
  closeOnSelect?: boolean
  className?: string
}

function DropdownMenuItem({
  value,
  label,
  subLabel,
  leftIcon,
  trailingIcon,
  disabled,
  destructive,
  onSelect,
  closeOnSelect = true,
  className,
}: DropdownMenuItemProps) {
  const ctx = useDropdownMenuContext("DropdownMenuItem")
  const reactId = React.useId()
  const itemValue = value ?? reactId

  React.useEffect(() => {
    ctx.register(itemValue, { onSelect, closeOnSelect })
    return () => ctx.unregister(itemValue)
  }, [ctx, itemValue, onSelect, closeOnSelect])

  return (
    <ListboxItem
      value={itemValue}
      label={label}
      subLabel={subLabel}
      leftIcon={leftIcon}
      trailingIcon={trailingIcon}
      disabled={disabled}
      data-destructive={destructive || undefined}
      className={className}
    />
  )
}

type DropdownMenuLabelProps = {
  children: React.ReactNode
  className?: string
}

/** Non-interactive section header inside the menu. */
function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <ListboxHeader data-slot="dropdown-menu-label" className={className}>
      {children}
    </ListboxHeader>
  )
}

type DropdownMenuSeparatorProps = {
  className?: string
}

function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
  return <ListboxSeparator data-slot="dropdown-menu-separator" className={className} />
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
export type {
  DropdownMenuProps,
  DropdownMenuTriggerProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuSeparatorProps,
}
