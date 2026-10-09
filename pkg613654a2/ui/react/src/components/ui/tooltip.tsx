import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/* =============================================================================
   c3 Tooltip — dark bubble with optional arrow on Top/Bottom/Left/Right.
   Pass `side="..."` for placement; pass `showArrow={false}` to hide the arrow
   (the "None" variant in Figma node 15139-15897).

   Optional sub-parts (composed as children of TooltipContent):
     - TooltipIcon / TooltipAvatar     leading 16×16 slot
     - TooltipTitle                    label (L2 medium, inverse fg)
     - TooltipSubtitle                 secondary line (P3 regular)
   ============================================================================= */

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /** Render the small caret arrow pointing at the trigger. Default true. */
  showArrow?: boolean
}

function TooltipContent({
  className,
  sideOffset,
  showArrow = true,
  children,
  ...props
}: TooltipContentProps) {
  // Visible gap to the trigger should be a consistent 4px on every side. The
  // arrow tip protrudes 4px into the gap, so offset the box by 8 when the arrow
  // shows (8 − 4 = 4px to the tip) and by 4 when it doesn't.
  const resolvedSideOffset = sideOffset ?? (showArrow ? 8 : 4)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={resolvedSideOffset}
        className={cn(
          "gap-[var(--c3-style-spacing-4)] rounded-[var(--c3-style-border-radius-4)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)] bg-[var(--c3-style-basic-bg-tooltip)] text-[var(--c3-style-basic-fg-inverse)]",
          "z-50 inline-flex max-w-xs items-start",
          "outline-hidden",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className,
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow
            data-slot="tooltip-arrow"
            className="fill-[var(--c3-style-basic-bg-tooltip)]"
            width={8}
            height={4}
          />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

function TooltipText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tooltip-text"
      className={cn("flex flex-col gap-[var(--c3-style-spacing-2)]", className)}
      {...props}
    />
  )
}

function TooltipTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tooltip-title"
      className={cn(
        "tooltip-content__title",
        "font-sans text-c3-regular-label-l2 leading-4",
        className,
      )}
      {...props}
    />
  )
}

function TooltipSubtitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tooltip-subtitle"
      className={cn(
        "font-sans text-c3-regular-body-p3 leading-4 font-normal text-[var(--c3-style-basic-fg-secondary)]",
        className,
      )}
      {...props}
    />
  )
}

function TooltipIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tooltip-icon"
      aria-hidden
      className={cn(
        "tooltip-content__icon inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TooltipAvatar({
  className,
  src,
  alt = "",
  ...props
}: React.ComponentProps<"img">) {
  return (
    <img
      data-slot="tooltip-avatar"
      src={src}
      alt={alt}
      className={cn(
        "tooltip-content__avatar size-4 shrink-0 rounded-full object-cover",
        className,
      )}
      {...props}
    />
  )
}

export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  TooltipText,
  TooltipTitle,
  TooltipSubtitle,
  TooltipIcon,
  TooltipAvatar,
}
