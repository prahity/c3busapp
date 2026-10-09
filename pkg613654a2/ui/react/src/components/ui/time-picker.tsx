import * as React from "react"
import { Clock } from "lucide-react"

import { Input } from "./input"

/**
 * c3 TimePicker — verified against Figma node 43568-20274 ("Input/Time Picker").
 *
 * A typed text field (no popover): the user types any valid time and it is
 * validated on blur and normalized to the canonical `hh:mm:ss A` string
 * (e.g. "10:30:00 AM"). Placeholder is always "00:00:00 AM".
 *
 * Composes <Input> directly, so it inherits every size / appearance / focus /
 * hover / disabled style from input.scss — there is no time-picker.scss.
 *   size:        "sm" | "md" | "lg"            — default "md".
 *   appearance:  "default" | "success" | "danger".
 * A persistent Clock icon sits in Input's leading slot.
 *
 * On blur: valid → normalized string via onChange; empty → onChange(null);
 * invalid → keeps the text, forces appearance="danger", onChange(null).
 */

type TimePickerAppearance = "default" | "success" | "danger"

type TimeParts = { h12: number; m: number; s: number; meridiem: "AM" | "PM" }

// h[h]:mm[:ss] with optional trailing AM/PM; flexible whitespace, case-insensitive.
const TIME_RE = /^\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*([AaPp][Mm])?\s*$/

/**
 * Parse a loosely-typed time. Accepts 12-hour (with AM/PM) or bare 24-hour
 * (converted to 12-hour + derived meridiem). Returns null if not a valid time.
 */
function parseTime(raw: string): TimeParts | null {
  const match = raw.match(TIME_RE)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  const s = match[3] != null ? Number(match[3]) : 0
  const mer = match[4]?.toUpperCase() as "AM" | "PM" | undefined
  if (m > 59 || s > 59) return null

  let h12: number
  let meridiem: "AM" | "PM"
  if (mer) {
    if (h < 1 || h > 12) return null
    h12 = h
    meridiem = mer
  } else {
    if (h < 0 || h > 23) return null
    meridiem = h < 12 ? "AM" : "PM"
    h12 = h % 12 || 12
  }
  return { h12, m, s, meridiem }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Canonical display string: "hh:mm:ss A". */
function formatTime(p: TimeParts): string {
  return `${pad(p.h12)}:${pad(p.m)}:${pad(p.s)} ${p.meridiem}`
}

type TimePickerProps = Omit<
  React.ComponentProps<"input">,
  "size" | "type" | "value" | "defaultValue" | "onChange"
> & {
  size?: "sm" | "md" | "lg"
  appearance?: TimePickerAppearance
  /** Controlled canonical time string, e.g. "10:30:00 AM". */
  value?: string
  /** Uncontrolled initial value. */
  defaultValue?: string
  /** Fires on blur: canonical string when valid, null when empty or invalid. */
  onChange?: (value: string | null) => void
  placeholder?: string
}

function TimePicker({
  size,
  appearance = "default",
  value,
  defaultValue,
  onChange,
  placeholder = "00:00:00 AM",
  disabled,
  onBlur,
  ...props
}: TimePickerProps) {
  const isControlled = value !== undefined
  const [text, setText] = React.useState<string>(value ?? defaultValue ?? "")
  const [invalid, setInvalid] = React.useState(false)

  // Sync a controlled value in; clear any stale error.
  React.useEffect(() => {
    if (isControlled) {
      setText(value ?? "")
      setInvalid(false)
    }
  }, [isControlled, value])

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = text.trim()
    if (raw === "") {
      setInvalid(false)
      onChange?.(null)
    } else {
      const parts = parseTime(raw)
      if (parts) {
        const canonical = formatTime(parts)
        setText(canonical)
        setInvalid(false)
        onChange?.(canonical)
      } else {
        setInvalid(true)
        onChange?.(null)
      }
    }
    onBlur?.(e)
  }

  const effectiveAppearance: TimePickerAppearance = invalid ? "danger" : appearance

  return (
    <Input
      data-slot="time-picker"
      size={size}
      appearance={effectiveAppearance}
      disabled={disabled}
      leftIcon={<Clock />}
      placeholder={placeholder}
      inputMode="numeric"
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (invalid) setInvalid(false)
      }}
      onBlur={handleBlur}
      {...props}
    />
  )
}

export { TimePicker, parseTime, formatTime }
export type { TimePickerAppearance }
