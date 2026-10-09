"use client"

import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "./button"
import "./calendar.scss"

/**
 * c3 Calendar — verified against Figma node 43561-8360.
 *
 * Container: bg-overlay, 12px padding, 4px radius, soft drop-shadow.
 * Day cells: 32×32 px, 4px border radius.
 * Selected (single + range endpoints): bg-accent-inverse + fg-inverse (solid blue, 4px square).
 * Today: subtle outlined indicator (no fill).
 * Range middle: bg-accent + fg-accent + 0px radius (continuous tint band).
 * States: default, hover, pressed (bg-pressed), selected, focus-visible ring.
 * Outside / disabled: fg-secondary (muted gray), 50% opacity for disabled.
 *
 * Outside days (leading/trailing days from adjacent months) are hidden by
 * default so they don't duplicate across month panels in multi-month views.
 * Opt in with `showOutsideDays={true}`.
 *
 * Theming lives in calendar.scss. Nav prev/next render the shared Button
 * primitive (variant=ghost, appearance=secondary, size=icon-sm) via the
 * `components.PreviousMonthButton` / `NextMonthButton` slots.
 */

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  captionLayout = "label",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()
  // Read (don't destructure) mode: it's the discriminant of DayPicker's props
  // union, so pulling it out of `props` and re-spreading would fight
  // TypeScript's narrowing. DayButton needs it to tell "multiple" selections
  // apart from a single/range-endpoint selection (see CalendarDayButton).
  const mode = (props as { mode?: "single" | "multiple" | "range" }).mode

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "calendar",
        "group/calendar",
        "font-sans",
        "[--cell-size:32px]",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        "in-data-[slot=popover-content]:bg-transparent in-data-[slot=popover-content]:p-0 in-data-[slot=popover-content]:shadow-none",
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("calendar__months relative flex flex-col md:flex-row", defaultClassNames.months),
        month: cn("calendar__month flex w-full flex-col", defaultClassNames.month),
        nav: cn(
          "calendar__nav absolute inset-x-0 top-0 flex w-full items-center justify-between",
          defaultClassNames.nav
        ),
        month_caption: cn(
          "calendar__caption",
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          "font-sans text-c3-regular-heading-h6",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "calendar__caption-label",
          "font-medium select-none",
          captionLayout === "label"
            ? "text-c3-regular-heading-h6"
            : "calendar__caption-label--dropdown flex items-center text-c3-regular-heading-h6 [&>svg]:size-3.5 [&>svg]:text-[color:var(--c3-style-basic-fg-secondary)]",
          defaultClassNames.caption_label
        ),
        dropdowns: cn(
          "calendar__dropdowns flex h-(--cell-size) w-full items-center justify-center text-c3-regular-heading-h6 font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn("calendar__dropdown-root relative", defaultClassNames.dropdown_root),
        dropdown: cn("absolute inset-0 opacity-0", defaultClassNames.dropdown),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "calendar__weekday",
          "flex-1 select-none font-sans text-c3-regular-label-l3 font-normal",
          defaultClassNames.weekday
        ),
        week: cn("calendar__week flex w-full", defaultClassNames.week),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn(
          "calendar__week-number",
          "select-none text-c3-regular-label-l3",
          defaultClassNames.week_number
        ),
        day: cn(
          "calendar__day group/day relative aspect-square h-full w-full text-center select-none",
          defaultClassNames.day
        ),
        range_middle: cn(
          "calendar__range-middle",
          defaultClassNames.range_middle
        ),
        range_start: cn(
          "calendar__range-start",
          defaultClassNames.range_start
        ),
        range_end: cn(
          "calendar__range-end",
          defaultClassNames.range_end
        ),
        today: cn("calendar__today", defaultClassNames.today),
        outside: cn("calendar__outside", defaultClassNames.outside),
        disabled: cn("calendar__disabled", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
        ),
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") return <ChevronLeftIcon className={cn("size-4", className)} {...props} />
          if (orientation === "right") return <ChevronRightIcon className={cn("size-4", className)} {...props} />
          return <ChevronDownIcon className={cn("size-4", className)} {...props} />
        },
        DayButton: ({ ...props }) => <CalendarDayButton locale={locale} mode={mode} {...props} />,
        PreviousMonthButton: ({ className, children, ...buttonProps }) => (
          <Button
            variant="ghost"
            appearance="secondary"
            size="icon-sm"
            className={cn("calendar__nav-button", className)}
            {...buttonProps}
          >
            {children}
          </Button>
        ),
        NextMonthButton: ({ className, children, ...buttonProps }) => (
          <Button
            variant="ghost"
            appearance="secondary"
            size="icon-sm"
            className={cn("calendar__nav-button", className)}
            {...buttonProps}
          >
            {children}
          </Button>
        ),
        WeekNumber: ({ children, ...props }) => (
          <td {...props}>
            <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  mode,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  locale?: Partial<Locale>
  mode?: "single" | "multiple" | "range"
}) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  // mode="multiple" has no range_start/range_end/range_middle modifiers at
  // all — every selected day just has modifiers.selected=true, identically
  // to a single-mode selection. Without checking mode, every multi-selected
  // day would fall through to isSelectedSingle and render as a solid square
  // (bg-accent-inverse) instead of the lighter multi-select tint (matches
  // the reference c3design site: multi-select uses the same soft bg-accent
  // tint as a range's middle days, not the solid single/range-endpoint fill).
  const isMultiSelected = mode === "multiple" && modifiers.selected
  const isSelectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle &&
    !isMultiSelected

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={isSelectedSingle || undefined}
      data-multi-selected={isMultiSelected || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      className={cn(
        "calendar__day-button",
        "relative isolate z-10 inline-flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center",
        "leading-none font-normal",
        "font-sans text-c3-regular-label-l2",
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
