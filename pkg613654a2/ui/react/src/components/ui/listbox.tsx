"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "./checkbox"
import { Divider } from "./divider"
import "./listbox.scss"

/**
 * c3 Listbox — verified against Figma node 44019-19886 (items 45033-13283,
 * menu header 45033-14580).
 *
 * Bare list surface (no Popover wrapping). Composable subcomponents:
 *   <Listbox mode="single | multiple">
 *     <ListboxHeader>Group</ListboxHeader>
 *     <ListboxItem value="a" label="Apple" />
 *     <ListboxSeparator />
 *     <ListboxItem value="b" label="Banana" subLabel="yellow" />
 *   </Listbox>
 *
 * BEM nesting mirrors Figma: outer `.listbox-item` (Item Frame, 4px L/R
 * padding) wraps inner `.listbox-item__state` (State Container, 8px padding,
 * owns hover/pressed/selected backgrounds). The outer frame stays color-free
 * so hover never bleeds to the popover edge.
 *
 * When `autoFocusable` (default true), Listbox handles its own keyboard.
 * When false, the parent (e.g. Combobox input) drives `activeValue` via the
 * controlled prop.
 */

type ListboxMode = "single" | "multiple"

type ListboxContextValue = {
  mode: ListboxMode
  // false when role="menu": items are transient actions, not persisted selections,
  // so they render role="menuitem" with no aria-selected / checkmark chrome.
  selectable: boolean
  itemRole: "option" | "menuitem"
  selectedValues: Set<string>
  activeValue: string | null
  listboxId: string
  itemIdFor: (value: string) => string
  onItemClick: (value: string, disabled?: boolean) => void
  onItemMouseEnter: (value: string) => void
}

const ListboxContext = React.createContext<ListboxContextValue | null>(null)

function useListboxContext(component: string): ListboxContextValue {
  const ctx = React.useContext(ListboxContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Listbox>`)
  return ctx
}

type ListboxProps = Omit<React.HTMLAttributes<HTMLUListElement>, "onSelect" | "role"> & {
  // "listbox" (default) persists a selection and shows checkmarks; "menu" turns
  // the surface into an actions menu (role="menu"/"menuitem", no selection chrome).
  role?: "listbox" | "menu"
  mode?: ListboxMode
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  values?: string[]
  defaultValues?: string[]
  onValuesChange?: (values: string[]) => void
  activeValue?: string | null
  defaultActiveValue?: string | null
  onActiveValueChange?: (value: string | null) => void
  autoFocusable?: boolean
  children: React.ReactNode
}

function Listbox({
  role = "listbox",
  mode = "single",
  value,
  defaultValue = null,
  onValueChange,
  values,
  defaultValues,
  onValuesChange,
  activeValue,
  defaultActiveValue = null,
  onActiveValueChange,
  autoFocusable = true,
  className,
  children,
  id,
  ...props
}: ListboxProps) {
  const reactId = React.useId()
  const listboxId = id ?? `listbox-${reactId}`
  const itemIdFor = React.useCallback(
    (v: string) => `${listboxId}-option-${v}`,
    [listboxId],
  )
  const selectable = role !== "menu"
  const itemRole: "option" | "menuitem" = role === "menu" ? "menuitem" : "option"

  // --- Selection state ---
  const isSingleControlled = value !== undefined
  const isMultiControlled = values !== undefined
  const [singleInternal, setSingleInternal] = React.useState<string | null>(defaultValue)
  const [multiInternal, setMultiInternal] = React.useState<string[]>(defaultValues ?? [])

  const selectedValues = React.useMemo(() => {
    if (mode === "single") {
      const v = isSingleControlled ? value : singleInternal
      return new Set(v != null ? [v] : [])
    }
    const arr = isMultiControlled ? values : multiInternal
    return new Set(arr ?? [])
  }, [mode, value, singleInternal, values, multiInternal, isSingleControlled, isMultiControlled])

  // --- Active (highlighted) state ---
  const isActiveControlled = activeValue !== undefined
  const [activeInternal, setActiveInternal] = React.useState<string | null>(defaultActiveValue)
  const currentActive = isActiveControlled ? (activeValue ?? null) : activeInternal

  const setActive = React.useCallback(
    (next: string | null) => {
      if (!isActiveControlled) setActiveInternal(next)
      onActiveValueChange?.(next)
    },
    [isActiveControlled, onActiveValueChange],
  )

  const commitSingle = React.useCallback(
    (next: string | null) => {
      if (!isSingleControlled) setSingleInternal(next)
      onValueChange?.(next)
    },
    [isSingleControlled, onValueChange],
  )

  const commitMulti = React.useCallback(
    (next: string[]) => {
      if (!isMultiControlled) setMultiInternal(next)
      onValuesChange?.(next)
    },
    [isMultiControlled, onValuesChange],
  )

  const handleItemClick = React.useCallback(
    (v: string, disabled?: boolean) => {
      if (disabled) return
      // Menu mode (role="menu"): fire the change as a transient action without
      // persisting any selection, so no row ever renders as selected.
      if (!selectable) {
        onValueChange?.(v)
        setActive(v)
        return
      }
      if (mode === "single") {
        commitSingle(v)
      } else {
        const next = new Set(selectedValues)
        if (next.has(v)) next.delete(v)
        else next.add(v)
        commitMulti(Array.from(next))
      }
      setActive(v)
    },
    [selectable, onValueChange, mode, selectedValues, commitSingle, commitMulti, setActive],
  )

  // --- DOM-based keyboard nav (autoFocusable only) ---
  const ulRef = React.useRef<HTMLUListElement>(null)

  const getFocusableValues = React.useCallback((): string[] => {
    const ul = ulRef.current
    if (!ul) return []
    return Array.from(
      ul.querySelectorAll<HTMLLIElement>(
        '[role="option"]:not([data-disabled]), [role="menuitem"]:not([data-disabled])',
      ),
    )
      .map((el) => el.getAttribute("data-value"))
      .filter((v): v is string => v != null)
  }, [])

  // Typeahead buffer.
  const typeaheadRef = React.useRef<{ buffer: string; timer: number | null }>({
    buffer: "",
    timer: null,
  })

  const findByTypeahead = React.useCallback((char: string): string | null => {
    const t = typeaheadRef.current
    if (t.timer != null) window.clearTimeout(t.timer)
    t.buffer = (t.buffer + char).toLowerCase()
    t.timer = window.setTimeout(() => {
      t.buffer = ""
      t.timer = null
    }, 500)
    const ul = ulRef.current
    if (!ul) return null
    const items = Array.from(
      ul.querySelectorAll<HTMLLIElement>(
        '[role="option"]:not([data-disabled]), [role="menuitem"]:not([data-disabled])',
      ),
    )
    const match = items.find((el) => {
      const text = (el.textContent ?? "").trim().toLowerCase()
      return text.startsWith(t.buffer)
    })
    return match?.getAttribute("data-value") ?? null
  }, [])

  const moveActive = React.useCallback(
    (delta: number) => {
      const list = getFocusableValues()
      if (list.length === 0) return
      const idx = currentActive ? list.indexOf(currentActive) : -1
      const nextIdx = idx < 0 ? (delta > 0 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length
      setActive(list[nextIdx])
    },
    [getFocusableValues, currentActive, setActive],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!autoFocusable) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === "Home") {
      e.preventDefault()
      const list = getFocusableValues()
      if (list.length > 0) setActive(list[0])
    } else if (e.key === "End") {
      e.preventDefault()
      const list = getFocusableValues()
      if (list.length > 0) setActive(list[list.length - 1])
    } else if (e.key === "Enter" || e.key === " ") {
      if (currentActive != null) {
        e.preventDefault()
        handleItemClick(currentActive)
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const match = findByTypeahead(e.key)
      if (match != null) {
        e.preventDefault()
        setActive(match)
      }
    }
  }

  const onFocus = (e: React.FocusEvent<HTMLUListElement>) => {
    if (autoFocusable && currentActive == null) {
      const list = getFocusableValues()
      if (list.length > 0) setActive(list[0])
    }
    props.onFocus?.(e)
  }

  const ctxValue = React.useMemo<ListboxContextValue>(
    () => ({
      mode,
      selectable,
      itemRole,
      selectedValues,
      activeValue: currentActive,
      listboxId,
      itemIdFor,
      onItemClick: handleItemClick,
      onItemMouseEnter: setActive,
    }),
    [mode, selectable, itemRole, selectedValues, currentActive, listboxId, itemIdFor, handleItemClick, setActive],
  )

  return (
    <ListboxContext.Provider value={ctxValue}>
      <ul
        {...props}
        ref={ulRef}
        id={listboxId}
        role={role}
        aria-multiselectable={(selectable && mode === "multiple") || undefined}
        aria-activedescendant={currentActive ? itemIdFor(currentActive) : undefined}
        tabIndex={autoFocusable ? 0 : -1}
        data-slot="listbox"
        data-mode={mode}
        className={cn("listbox", className)}
        onKeyDown={(e) => {
          onKeyDown(e)
          props.onKeyDown?.(e)
        }}
        onFocus={onFocus}
      >
        {children}
      </ul>
    </ListboxContext.Provider>
  )
}

type ListboxItemProps = Omit<React.HTMLAttributes<HTMLLIElement>, "onClick"> & {
  value: string
  label: React.ReactNode
  subLabel?: React.ReactNode
  leftIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  disabled?: boolean
}

function ListboxItem({
  value,
  label,
  subLabel,
  leftIcon,
  trailingIcon,
  disabled,
  className,
  ...props
}: ListboxItemProps) {
  const ctx = useListboxContext("ListboxItem")
  // In menu mode rows are transient actions — never "selected".
  const isSelected = ctx.selectable && ctx.selectedValues.has(value)
  const isActive = ctx.activeValue === value
  const isMulti = ctx.mode === "multiple"
  const itemId = ctx.itemIdFor(value)

  if (isMulti && leftIcon != null && process.env.NODE_ENV !== "production") {
    console.warn(
      `[ListboxItem] leftIcon is ignored for value="${value}" because the parent Listbox is in mode="multiple" (checkbox replaces the leading slot).`,
    )
  }

  const showTrailing = !isMulti && (trailingIcon != null || isSelected)
  const resolvedTrailing = trailingIcon ?? (isSelected ? <Check className="size-4" /> : null)

  return (
    <li
      {...props}
      id={itemId}
      role={ctx.itemRole}
      aria-selected={ctx.selectable ? isSelected : undefined}
      data-value={value}
      data-selected={isSelected || undefined}
      data-active={isActive || undefined}
      data-disabled={disabled || undefined}
      className={cn("listbox-item", className)}
      onClick={() => ctx.onItemClick(value, disabled)}
      onMouseEnter={() => {
        if (!disabled) ctx.onItemMouseEnter(value)
      }}
      onMouseDown={(e) => {
        // Prevent the listbox from losing focus when consumer wraps in Popover/Combobox.
        e.preventDefault()
      }}
    >
      <div className="listbox-item__state">
        {isMulti ? (
          <span className="listbox-item__checkbox inline-flex shrink-0 pointer-events-none">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {}}
              disabled={disabled}
              size="sm"
              tabIndex={-1}
            />
          </span>
        ) : leftIcon != null ? (
          <span className="listbox-item__leading inline-flex shrink-0 [&_svg]:size-4">
            {leftIcon}
          </span>
        ) : null}
        <span className="listbox-item__text font-sans">
          <span className="listbox-item__label text-c3-regular-label-l2 truncate">
            {label}
          </span>
          {subLabel != null && (
            <span className="listbox-item__sub text-c3-regular-body-p3 truncate">
              {subLabel}
            </span>
          )}
        </span>
        {showTrailing && (
          <span className="listbox-item__trailing inline-flex shrink-0 [&_svg]:size-4">
            {resolvedTrailing}
          </span>
        )}
      </div>
    </li>
  )
}

type ListboxHeaderProps = React.HTMLAttributes<HTMLLIElement>

function ListboxHeader({ className, children, ...props }: ListboxHeaderProps) {
  return (
    <li
      {...props}
      role="presentation"
      data-slot="listbox-header"
      className={cn(
        "listbox-header",
        "font-sans text-c3-regular-label-l3",
        className,
      )}
    >
      {children}
    </li>
  )
}

type ListboxSeparatorProps = React.HTMLAttributes<HTMLLIElement>

function ListboxSeparator({ className, ...props }: ListboxSeparatorProps) {
  return (
    <li
      {...props}
      role="separator"
      aria-orientation="horizontal"
      data-slot="listbox-separator"
      className={cn("listbox-separator", className)}
    >
      <Divider decorative orientation="horizontal" />
    </li>
  )
}

export { Listbox, ListboxItem, ListboxHeader, ListboxSeparator }
export type {
  ListboxProps,
  ListboxItemProps,
  ListboxHeaderProps,
  ListboxSeparatorProps,
  ListboxMode,
}
