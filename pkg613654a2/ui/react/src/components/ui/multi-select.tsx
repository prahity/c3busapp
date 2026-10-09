"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "./badge"
import { Listbox, ListboxItem } from "./listbox"
import type { ComboboxOption } from "./combobox"
import "./multi-select.scss"

/**
 * c3 MultiSelect — Figma node 43701-4344.
 *
 * The multi-select counterpart to Combobox: looks like an Input, the user
 * types to filter the option list, and each committed value renders as a
 * removable chip inside the field. Composes a hand-built trigger frame (the
 * shared `.input` chrome — Combobox's single-line <Input> can't host wrapping
 * chips), Radix Popover for the floating surface, <Badge> for the chips, and
 * <Listbox mode="multiple"> (auto-renders the leading checkboxes) for the list.
 *
 * Layout (Figma 45657-465): a fixed leading <Search> icon and trailing
 * <ChevronDown>; the chip stack between them fills the row and wraps onto new
 * lines while both icons stay put (chevron pinned right). The frame stays a
 * single row (no wrap) so only the chip slot grows.
 *
 * Mirrors combobox.tsx (filter/keyboard/active-row machinery) with three
 * differences: a string[] value API, chips in the trigger, and the menu stays
 * open while toggling. Chips are Badge { outline, primary, md, rounded } + the
 * delete (X) affordance; reuses Combobox's ComboboxOption shape.
 */

type MultiSelectSize = "sm" | "md" | "lg"
type MultiSelectAppearance = "default" | "success" | "danger"

type MultiSelectProps = {
  size?: MultiSelectSize
  appearance?: MultiSelectAppearance
  options: ComboboxOption[]
  values?: string[]
  defaultValues?: string[]
  onValuesChange?: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
  filter?: (option: ComboboxOption, query: string) => boolean
  emptyMessage?: React.ReactNode
  className?: string
  id?: string
  name?: string
}

const defaultFilter = (option: ComboboxOption, query: string): boolean => {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    option.label.toLowerCase().includes(q) ||
    option.value.toLowerCase().includes(q)
  )
}

function MultiSelect({
  size = "md",
  appearance = "default",
  options,
  values: valuesProp,
  defaultValues = [],
  onValuesChange,
  placeholder = "Select item",
  disabled,
  filter = defaultFilter,
  emptyMessage = "No results",
  className,
  id,
  name,
}: MultiSelectProps) {
  const isControlled = valuesProp !== undefined
  const [internalValues, setInternalValues] = React.useState<string[]>(defaultValues)
  const selectedValues = isControlled ? valuesProp! : internalValues

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const reactId = React.useId()
  const listboxId = id ? `${id}-listbox` : `multi-select-listbox-${reactId}`

  const selectedOptions = React.useMemo(
    () =>
      selectedValues
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is ComboboxOption => o != null),
    [options, selectedValues],
  )

  const visibleOptions = React.useMemo(
    () => (open ? options.filter((o) => filter(o, query)) : options),
    [options, filter, query, open],
  )

  const [activeValue, setActiveValue] = React.useState<string | null>(null)

  // Reset highlight to first visible non-disabled option when query changes or
  // the menu opens (keeps the existing highlight if it's still visible).
  React.useEffect(() => {
    if (!open) return
    const stillVisible =
      activeValue != null && visibleOptions.some((o) => o.value === activeValue && !o.disabled)
    if (stillVisible) return
    const first = visibleOptions.find((o) => !o.disabled)
    setActiveValue(first?.value ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  const commit = (next: string[]) => {
    if (!isControlled) setInternalValues(next)
    onValuesChange?.(next)
  }

  const toggle = (value: string) => {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    commit(next)
  }

  const toggleOption = (option: ComboboxOption) => {
    if (option.disabled) return
    toggle(option.value)
    setQuery("")
    inputRef.current?.focus()
  }

  const openMenu = () => {
    if (disabled) return
    setOpen(true)
    setQuery("")
  }

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    if (open) {
      setOpen(false)
    } else {
      openMenu()
      inputRef.current?.focus()
    }
  }

  const enabledVisible = visibleOptions.filter((o) => !o.disabled)

  const moveActive = (delta: number) => {
    if (enabledVisible.length === 0) return
    const idx = activeValue ? enabledVisible.findIndex((o) => o.value === activeValue) : -1
    const nextIdx =
      idx < 0 ? (delta > 0 ? 0 : enabledVisible.length - 1) : (idx + delta + enabledVisible.length) % enabledVisible.length
    setActiveValue(enabledVisible[nextIdx].value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === "Home") {
      e.preventDefault()
      if (enabledVisible.length > 0) setActiveValue(enabledVisible[0].value)
    } else if (e.key === "End") {
      e.preventDefault()
      if (enabledVisible.length > 0) setActiveValue(enabledVisible[enabledVisible.length - 1].value)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const option = visibleOptions.find((o) => o.value === activeValue)
      // Toggle, but keep the menu open — multi-select commits several values.
      if (option) toggleOption(option)
    } else if (e.key === "Backspace") {
      // Remove the last chip when the query is empty (standard multi-select nicety).
      if (query === "" && selectedValues.length > 0) {
        commit(selectedValues.slice(0, -1))
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
      setQuery("")
    } else if (e.key === "Tab") {
      setOpen(false)
      setQuery("")
    }
  }

  const filled = selectedOptions.length > 0
  const activeItemId = activeValue ? `${listboxId}-option-${activeValue}` : undefined

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          data-slot="multi-select"
          data-filled={filled || undefined}
          className={cn(
            "multi-select",
            `multi-select--size-${size}`,
            appearance !== "default" && `multi-select--appearance-${appearance}`,
            className,
          )}
          onMouseDown={(e) => {
            // Clicks on empty frame area focus the field and open the menu;
            // clicks on a chip's X (a button) are left alone.
            if ((e.target as HTMLElement).closest("button")) return
            if (!disabled && !open) {
              e.preventDefault()
              openMenu()
              inputRef.current?.focus()
            }
          }}
        >
          <span className="multi-select__icon" aria-hidden="true">
            <Search />
          </span>

          <div className="multi-select__values">
            {selectedOptions.map((option) => (
              <Badge
                key={option.value}
                variant="outline"
                appearance="primary"
                size="md"
                shape="rounded"
                className="multi-select__chip"
                onDelete={disabled ? undefined : () => toggle(option.value)}
              >
                {option.label}
              </Badge>
            ))}
            <input
              ref={inputRef}
              id={id}
              name={name}
              className="multi-select__field font-sans text-c3-regular-body-p2"
              disabled={disabled}
              placeholder={filled ? undefined : placeholder}
              value={query}
              onChange={(e) => {
                if (!open) setOpen(true)
                setQuery(e.target.value)
              }}
              onFocus={() => {
                if (!disabled && !open) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={open ? listboxId : undefined}
              aria-activedescendant={open ? activeItemId : undefined}
            />
          </div>

          <span className="multi-select__icons">
            <button
              type="button"
              tabIndex={-1}
              className="multi-select__chevron"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleMenu}
              aria-label={open ? "Close options" : "Open options"}
              data-open={open || undefined}
              disabled={disabled}
            >
              <ChevronDown />
            </button>
          </span>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="multi-select-content"
          className={cn(
            "multi-select-content",
            "z-50 overflow-hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
          align="start"
          sideOffset={4}
          style={{
            width: "var(--radix-popover-trigger-width)",
            maxHeight: "var(--radix-popover-content-available-height)",
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            // The trigger lives in PopoverAnchor, not PopoverContent, so Radix's
            // outside-click detection would treat a click on it as dismissable.
            // Ignore pointer-downs that originate inside our own wrapper.
            const target = e.target as HTMLElement | null
            if (target?.closest('[data-slot="multi-select"]')) {
              e.preventDefault()
            }
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement | null
            if (target?.closest('[data-slot="multi-select"]')) {
              e.preventDefault()
            }
          }}
        >
          {visibleOptions.length === 0 ? (
            <div className="multi-select__empty" role="status">
              {emptyMessage}
            </div>
          ) : (
            <Listbox
              id={listboxId}
              mode="multiple"
              values={selectedValues}
              onValuesChange={commit}
              activeValue={activeValue}
              onActiveValueChange={setActiveValue}
              autoFocusable={false}
            >
              {visibleOptions.map((option) => (
                <ListboxItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  subLabel={option.subLabel}
                  disabled={option.disabled}
                />
              ))}
            </Listbox>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { MultiSelect }
export type {
  MultiSelectProps,
  MultiSelectSize,
  MultiSelectAppearance,
}
