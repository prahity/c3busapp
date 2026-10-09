import * as React from "react"
import { Slot } from "radix-ui"
import { CircleAlert, CheckCircle2, Info, TriangleAlert, X } from "lucide-react"

import { cn } from "@/lib/utils"
import "./alert.scss"

/* =============================================================================
   c3 Alert — banner with leading icon/avatar, title + subtitle, and an
   optional trailing action button + close.

   Three visual variants × five appearances (matches Figma node 43581-6096 family):
     variant:     "solid" | "soft" | "ghost"
     appearance:  "default" | "info" | "success" | "warning" | "destructive"

   Note on naming: Figma's third variant is labelled "Outline" (white bg +
   appearance border). The user spec calls this "Ghost" — we use
   `variant="ghost"` and document the mapping in alert.md.
   ============================================================================= */

const APPEARANCES = ["default", "info", "success", "warning", "destructive"] as const
type AlertAppearance = (typeof APPEARANCES)[number]
type AlertVariant = "solid" | "soft" | "ghost"

type AlertProps = React.ComponentProps<"div"> & {
  variant?: AlertVariant
  appearance?: AlertAppearance
}

function Alert({
  className,
  variant = "solid",
  appearance = "default",
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      data-slot="alert"
      data-variant={variant}
      data-appearance={appearance}
      className={cn(
        "alert",
        `alert--${variant}`,
        `alert--appearance-${appearance}`,
        // Center children vertically so a title-only / message-only alert lines
        // up its icon, text, action, and close on one axis. For the typical
        // 1–2 line banner this reads clean; long multi-line bodies stay centered.
        "relative flex w-full items-center",
        "font-sans",
        className,
      )}
      {...props}
    />
  )
}

function AlertIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="alert-icon"
      aria-hidden
      className={cn(
        "alert__icon inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  )
}

/** Pre-canned icon for an appearance — pass `appearance` to draw the matching lucide glyph. */
function AlertAppearanceIcon({ appearance = "default" }: { appearance?: AlertAppearance }) {
  const Cmp =
    appearance === "success"
      ? CheckCircle2
      : appearance === "destructive"
        ? TriangleAlert
        : appearance === "info"
          ? Info
          : CircleAlert
  return (
    <AlertIcon>
      <Cmp />
    </AlertIcon>
  )
}

type AlertAvatarProps = Omit<React.ComponentProps<"div">, "children"> & {
  src?: string
  alt?: string
  /** Render a custom node in place of the default <img> (e.g. a lucide icon). */
  children?: React.ReactNode
}

function AlertAvatar({
  className,
  src,
  alt = "",
  children,
  ...props
}: AlertAvatarProps) {
  return (
    <div
      data-slot="alert-avatar"
      className={cn(
        "alert__avatar relative size-8 shrink-0 overflow-hidden",
        className,
      )}
      {...props}
    >
      {children ?? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  )
}

function AlertContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-content"
      className={cn(
        "alert__content min-w-0 flex-1 flex flex-col",
        className,
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "alert__title text-c3-bold-body-p2",
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "alert__description text-c3-regular-body-p2",
        className,
      )}
      {...props}
    />
  )
}

type AlertActionProps = React.ComponentProps<"button"> & { asChild?: boolean }

function AlertAction({
  className,
  asChild = false,
  ...props
}: AlertActionProps) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="alert-action"
      className={cn(
        "alert__action",
        "inline-flex shrink-0 items-center justify-center",
        "min-w-14 max-h-7",
        "border border-solid border-transparent",
        "text-c3-bold-label-l3 font-semibold whitespace-nowrap",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    />
  )
}

type AlertCloseProps = React.ComponentProps<"button">

function AlertClose({ className, ...props }: AlertCloseProps) {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      data-slot="alert-close"
      className={cn(
        "alert__close inline-flex size-5 shrink-0 items-center justify-center",
        "opacity-80 hover:opacity-100",
        className,
      )}
      {...props}
    >
      <X className="size-4" />
    </button>
  )
}

export {
  Alert,
  AlertIcon,
  AlertAppearanceIcon,
  AlertAvatar,
  AlertContent,
  AlertTitle,
  AlertDescription,
  AlertAction,
  AlertClose,
}
export type { AlertAppearance, AlertVariant }
