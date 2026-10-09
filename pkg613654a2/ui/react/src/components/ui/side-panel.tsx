import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Header } from "./header"
import { Button } from "./button"

/**
 * c3 SidePanel — verified against Figma node 44627-2452.
 *
 * A side-pinned container panel: a header (title + subtitle + close), a flexible
 * content area, and an optional footer button stack. It is a *presentational*
 * container — it does not own open/close state, a backdrop, or slide-in
 * animation (that's Modal's job). The consumer decides when it mounts and where
 * it sits; SidePanel only provides the styled shell.
 *
 * Two layout axes match the Figma variants:
 *   behavior     — "push" (inline, no shadow) | "overlay" (floats with a drop shadow)
 *   contentWidth — "contained" (16px frame around everything)
 *                | "full" (header/footer keep 16px x-padding, body runs edge-to-edge)
 *
 * The header row is the library Header component (size md) with a ghost close
 * button slotted into its `actions`, so the title/subtitle treatment stays in
 * sync. Color/border/shadow live in side-panel.scss; Tailwind owns layout.
 */

type SidePanelBehavior = "push" | "overlay"
type SidePanelContentWidth = "contained" | "full"

type SidePanelProps = React.ComponentProps<"div"> & {
  behavior?: SidePanelBehavior
  contentWidth?: SidePanelContentWidth
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Fired when the header close button is pressed. Omit + set `hideClose` to drop the button. */
  onClose?: () => void
  hideClose?: boolean
  /** Footer slot — typically a stack of <Button>s. Hidden when not provided. */
  footer?: React.ReactNode
}

function SidePanel({
  className,
  behavior = "push",
  contentWidth = "contained",
  title,
  subtitle,
  onClose,
  hideClose = false,
  footer,
  children,
  ...props
}: SidePanelProps) {
  const contained = contentWidth === "contained"
  // In "full" mode the body runs edge-to-edge; header/footer keep their inset.
  const inset = contained ? undefined : "px-[var(--c3-style-spacing-16)]"

  const closeButton =
    onClose || !hideClose ? (
      <Button
        variant="ghost"
        appearance="secondary"
        size="icon-sm"
        onClick={onClose}
        aria-label="Close"
      >
        <X />
      </Button>
    ) : undefined

  return (
    <div
      data-slot="side-panel"
      data-behavior={behavior}
      data-content-width={contentWidth}
      className={cn(
        "border-l border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]",
        // Overlay elevation — RAW shadow values (no --c3-style-shadow-default-* token; flagged in side-panel.md).
        behavior === "overlay" &&
          (contained
            ? "shadow-[0_4px_6px_-1px_rgb(10_10_10/20%),0_2px_4px_-1px_rgb(10_10_10/20%)]"
            : "shadow-[0_20px_25px_-5px_rgb(10_10_10/20%),0_8px_10px_-1px_rgb(10_10_10/20%)]"),
        "flex h-full w-[320px] flex-col gap-[var(--c3-style-spacing-16)] overflow-hidden",
        contained ? "p-[var(--c3-style-spacing-16)]" : "pt-[var(--c3-style-spacing-16)]",
        className,
      )}
      {...props}
    >
      <Header
        size="md"
        title={title}
        subtitle={subtitle}
        actions={hideClose ? undefined : closeButton}
        className={cn("shrink-0", inset)}
      />

      {/* In "full" mode the body is intentionally edge-to-edge (no inset). */}
      <div className="min-h-px w-full flex-1 overflow-y-auto">
        {children}
      </div>

      {footer ? (
        <div
          className={cn(
            "flex w-full shrink-0 flex-col items-center gap-[var(--c3-style-spacing-8)]",
            inset,
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export { SidePanel }
export type { SidePanelProps, SidePanelBehavior, SidePanelContentWidth }
