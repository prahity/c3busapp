import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * c3 TopNavBar — verified against Figma node 4103-4910.
 *
 * The application chrome bar at the top of every screen: a 48px-tall, full-width
 * bar with a 1px bottom rule. It owns three layout zones and slots in existing
 * library components rather than reinventing them:
 *
 *   brand   — logo + application name on the far left (12px gap)
 *   center  — optional middle slot; pass <InputSearch> or <Tabs>
 *   actions — right-aligned action group: ghost icon Buttons, avatar last
 *
 * The three Figma "types" (Default / With Search / With Tabs) are not a prop —
 * they're just whether `center` is provided. Keeping it a slot avoids a variant
 * that only gates a child.
 *
 * Color/border/height live in top-nav-bar.scss; Tailwind here owns layout only.
 */
function TopNavBar({
  className,
  logo,
  appName,
  center,
  actions,
  ...props
}: React.ComponentProps<"header"> & {
  logo?: React.ReactNode
  appName?: React.ReactNode
  center?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="top-nav-bar"
      className={cn(
        "relative h-12 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]",
        "flex w-full items-center px-4",
        className,
      )}
      {...props}
    >
      <div className="top-nav-bar__brand flex flex-1 items-center gap-3 min-w-px">
        {logo ? (
          <span
            data-slot="top-nav-bar-logo"
            className="inline-flex shrink-0 items-center text-[var(--c3-style-basic-fg-primary)] [&_svg]:size-5"
          >
            {logo}
          </span>
        ) : null}
        {appName ? (
          <span className="text-c3-bold-heading-h6 whitespace-nowrap text-[var(--c3-style-basic-fg-primary)]">
            {appName}
          </span>
        ) : null}
      </div>

      {center ? (
        <div className="top-nav-bar__center flex flex-1 items-center justify-center min-w-px">
          {center}
        </div>
      ) : null}

      <div className="top-nav-bar__actions flex flex-1 items-center justify-end gap-2 min-w-px">
        {actions}
      </div>
    </header>
  )
}

export { TopNavBar }
