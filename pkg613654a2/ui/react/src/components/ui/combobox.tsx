"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "./input"
import { Listbox, ListboxItem } from "./listbox"
import "./combobox.scss"

/**
 * c3 Combobox — Figma node 3884-6936.
 *
 * Single-select typeahead. Looks like an Input; user types to filter the
 * option list. Two trailing icons: X (clear, only when a value is selected)
 * and chevron-down (toggles the menu). Composes <Input> for the trigger,
 * Radix Popover for the floating surface, and <Listbox> for the option list.
 *
 * Canonical select-style primitive in the system. (Dropdown was removed
 * 2026-06-02; Combobox replaces it.) MultiSelect is a future component that
 * wraps Combobox + Listbox in mode="multiple".
 *
 * Renamed from InputSelect on 2026-06-01.
 */

type ComboboxOption = {
  value: string
  label: string
  subLabel?: string
  disabled?: boolean
}

type ComboboxSize = "sm" | "md" | "lg"
type ComboboxAppearance = "default" | "success" | "danger"

type ComboboxProps = {
  size?: ComboboxSize
  appearance?: ComboboxAppearance
  leftIcon?: React.ReactNode
  options: ComboboxOption[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
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

function Combobox({
  size = "md",
  appearance = "default",
  leftIcon,
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  placeholder = "Select item",
  disabled,
  filter = defaultFilter,
  emptyMessage = "No results",
  className,
  id,
  name,
}: ComboboxProps) {
  const isControlled = valueProp !== undefined
  const [internalValue, setInternalValue] = React.useState<string | null>(defaultValue)
  const selectedValue = isControlled ? valueProp : internalValue

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const reactId = React.useId()
  const listboxId = id ? `${id}-listbox` : `combobox-listbox-${reactId}`

  const selectedOption = React.useMemo(
    () => options.find((o) => o.value === selectedValue) ?? null,
    [options, selectedValue],
  )

  const visibleOptions = React.useMemo(
    () => (open ? options.filter((o) => filter(o, query)) : options),
    [options, filter, query, open],
  )

  const [activeValue, setActiveValue] = React.useState<string | null>(null)

  // Reset highlight to first visible (or selected if visible) when query changes or menu opens.
  React.useEffect(() => {
    if (!open) return
    const stillVisible =
      activeValue != null && visibleOptions.some((o) => o.value === activeValue && !o.disabled)
    if (stillVisible) return
    const selectedVisible =
      selectedOption != null &&
      visibleOptions.some((o) => o.value === selectedOption.value && !o.disabled)
    if (selectedVisible) {
      setActiveValue(selectedOption!.value)
      return
    }
    const first = visibleOptions.find((o) => !o.disabled)
    setActiveValue(first?.value ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  const commit = (next: string | null) => {
    if (!isControlled) setInternalValue(next)
    onValueChange?.(next)
  }

  const selectOption = (option: ComboboxOption) => {
    if (option.disabled) return
    commit(option.value)
    setOpen(false)
    setQuery("")
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    commit(null)
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
      if (option) selectOption(option)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
      setQuery("")
    } else if (e.key === "Tab") {
      setOpen(false)
      setQuery("")
    }
  }

  const displayValue = open ? query : selectedOption?.label ?? ""
  const activeItemId = activeValue ? `${listboxId}-option-${activeValue}` : undefined

  const trailingIcons = (
    <span className="combobox__icons">
      {selectedOption != null && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          className="combobox__clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          aria-label="Clear selection"
        >
          <X />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        className="combobox__chevron"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleMenu}
        aria-label={open ? "Close options" : "Open options"}
        data-open={open || undefined}
      >
        <ChevronDown />
      </button>
    </span>
  )

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div data-slot="combobox" className="combobox">
          <Input
            ref={inputRef}
            id={id}
            name={name}
            size={size}
            appearance={appearance}
            disabled={disabled}
            leftIcon={leftIcon}
            rightIcon={trailingIcons}
            placeholder={placeholder}
            // className flows to the .input element (where focus/hover styles
            // and storybook-addon-pseudo-states hooks live), not the outer
            // positioning anchor.
            className={className}
            value={displayValue}
            onChange={(e) => {
              if (!open) setOpen(true)
              setQuery(e.target.value)
            }}
            onFocus={() => {
              if (!disabled && !open) setOpen(true)
            }}
            onMouseDown={() => {
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
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="combobox-content"
          className={cn(
            "combobox-content",
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
            // The trigger <input> lives in PopoverAnchor, not PopoverContent,
            // so Radix's outside-click detection would treat a click on it as
            // dismissable. Ignore pointer-downs that originate inside our own
            // combobox wrapper.
            const target = e.target as HTMLElement | null
            if (target?.closest('[data-slot="combobox"]')) {
              e.preventDefault()
            }
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement | null
            if (target?.closest('[data-slot="combobox"]')) {
              e.preventDefault()
            }
          }}
        >
          {visibleOptions.length === 0 ? (
            <div className="combobox__empty" role="status">
              {emptyMessage}
            </div>
          ) : (
            <Listbox
              id={listboxId}
              mode="single"
              value={selectedValue ?? null}
              onValueChange={(v) => {
                if (v == null) return
                const option = visibleOptions.find((o) => o.value === v)
                if (option) selectOption(option)
              }}
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

export { Combobox }
export type {
  ComboboxProps,
  ComboboxOption,
  ComboboxSize,
  ComboboxAppearance,
}
