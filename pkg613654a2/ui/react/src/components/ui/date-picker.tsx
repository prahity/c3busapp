"use client"

import * as React from "react"
import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Calendar } from "./calendar"
import { inputWrapperVariants } from "./input"
import "./date-picker.scss"

/**
 * c3 DatePicker — verified against Figma node 43547-4611.
 *
 * The trigger inherits all visual from <Input> (size, appearance, hover,
 * focus, disabled, border, bg) by composing the same `.input` BEM classes.
 * Leading icon = calendar; trailing area shows chevron-down always plus an
 * X (clear) button when the picker has a value. "Filled" (has-value) is
 * reflected via `data-filled="true"` on the value span — derived from the
 * current value, never exposed as a prop.
 *
 * Modes:
 *   <DatePicker />              — single date
 *   <DateRangePicker />         — date range
 *
 * Theming lives in input.scss; date-picker.scss only owns the popover-content
 * reset and the placeholder-vs-filled value color toggle.
 */

type DatePickerAppearance = "default" | "success" | "danger"

function formatDate(d?: Date): string {
  if (!d) return ""
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

type TriggerProps = React.ComponentProps<"button"> & {
  size?: VariantProps<typeof inputWrapperVariants>["size"]
  appearance: DatePickerAppearance
  hasValue: boolean
  label: string
  placeholder: string
  onClear: () => void
}

const DatePickerTrigger = React.forwardRef<HTMLButtonElement, TriggerProps>(
  function DatePickerTrigger(
    {
      size,
      appearance,
      disabled,
      hasValue,
      label,
      placeholder,
      onClear,
      className,
      ...rest
    },
    ref,
  ) {
    const handleClearPointerDown = (e: React.PointerEvent) => {
      // Stop the popover trigger from toggling on this same pointer event.
      e.preventDefault()
      e.stopPropagation()
    }
    const handleClearClick = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onClear()
    }
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        data-appearance={appearance}
        className={cn(
          "input",
          `input--appearance-${appearance}`,
          inputWrapperVariants({ size }),
          "date-picker cursor-pointer text-left",
          className,
        )}
        {...rest}
      >
        <span className="input__icon inline-flex shrink-0">
          <CalendarIcon />
        </span>
        <span
          data-filled={hasValue || undefined}
          className={cn(
            "date-picker__value",
            "min-w-0 flex-1 truncate",
          )}
        >
          {hasValue ? label : placeholder}
        </span>
        {hasValue && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onPointerDown={handleClearPointerDown}
            onClick={handleClearClick}
            className="input__icon date-picker__clear inline-flex shrink-0 cursor-pointer"
          >
            <X />
          </span>
        )}
        <span className="input__icon inline-flex shrink-0">
          <ChevronDown />
        </span>
      </button>
    )
  },
)

// --- Single date ---------------------------------------------------------

type DatePickerProps = {
  size?: VariantProps<typeof inputWrapperVariants>["size"]
  appearance?: DatePickerAppearance
  value?: Date
  defaultValue?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function DatePicker({
  value,
  defaultValue,
  onChange,
  placeholder = "MM/DD/YYYY",
  disabled,
  size,
  appearance,
  className,
  open,
  onOpenChange,
}: DatePickerProps) {
  const [internal, setInternal] = React.useState<Date | undefined>(defaultValue)
  const current = value !== undefined ? value : internal
  const hasValue = !!current
  const resolvedAppearance: DatePickerAppearance = appearance ?? "default"

  const handleSelect = (d: Date | undefined) => {
    if (value === undefined) setInternal(d)
    onChange?.(d)
    if (d) onOpenChange?.(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <DatePickerTrigger
          size={size}
          appearance={resolvedAppearance}
          disabled={disabled}
          hasValue={hasValue}
          label={formatDate(current)}
          placeholder={placeholder}
          onClear={() => handleSelect(undefined)}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className="date-picker__popover w-auto" align="start">
        <Calendar
          mode="single"
          selected={current}
          onSelect={handleSelect}
          defaultMonth={current}
        />
      </PopoverContent>
    </Popover>
  )
}

// --- Date range ----------------------------------------------------------

type DateRange = { from?: Date; to?: Date }

type DateRangePickerProps = {
  size?: VariantProps<typeof inputWrapperVariants>["size"]
  appearance?: DatePickerAppearance
  value?: DateRange
  defaultValue?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function DateRangePicker({
  value,
  defaultValue,
  onChange,
  placeholder = "MM/DD/YYYY – MM/DD/YYYY",
  disabled,
  size,
  appearance,
  className,
  open,
  onOpenChange,
}: DateRangePickerProps) {
  const [internal, setInternal] = React.useState<DateRange | undefined>(defaultValue)
  const current = value !== undefined ? value : internal
  const hasValue = !!current?.from
  const resolvedAppearance: DatePickerAppearance = appearance ?? "default"

  const handleSelect = (r: DateRange | undefined) => {
    if (value === undefined) setInternal(r)
    onChange?.(r)
    if (r?.from && r?.to) onOpenChange?.(false)
  }

  const label = hasValue
    ? current?.to
      ? `${formatDate(current.from)} – ${formatDate(current.to)}`
      : formatDate(current?.from)
    : ""

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <DatePickerTrigger
          size={size}
          appearance={resolvedAppearance}
          disabled={disabled}
          hasValue={hasValue}
          label={label}
          placeholder={placeholder}
          onClear={() => handleSelect(undefined)}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className="date-picker__popover w-auto" align="start">
        <Calendar
          mode="range"
          selected={current as never}
          onSelect={handleSelect as never}
          numberOfMonths={2}
          resetOnSelect
          defaultMonth={current?.from}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, DateRangePicker }
export type { DatePickerAppearance }
