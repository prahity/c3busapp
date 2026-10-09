import * as React from "react"
import { User } from "lucide-react"

import { cn } from "@/lib/utils"
import "./avatar.scss"

/**
 * c3 Avatar — a 32px user/entity glyph (Figma node 323-321).
 *
 * Three content types:
 *   image     — an <img> (object-cover), clipped to the shape
 *   initials  — short text (e.g. "C3"), L3, centered on a slate placeholder
 *   icon      — a lucide glyph (default <User/>) on a slate placeholder
 * `type` defaults to "image" when `src` is given, otherwise "icon".
 *
 * shape: rounded (8px, default) | circle (full). `border` adds a 1px ring.
 * `indicator` renders the success-green modifier dot at the top-right.
 *
 * Color/size/border-radius tokens live in avatar.scss — Tailwind here owns only
 * layout. No raw hex; placeholder bg is --c3-style-deco-slate-bg.
 */

type AvatarType = "image" | "initials" | "icon"
type AvatarShape = "rounded" | "circle"

type AvatarProps = React.ComponentProps<"div"> & {
  type?: AvatarType
  src?: string
  alt?: string
  initials?: string
  icon?: React.ReactNode
  shape?: AvatarShape
  border?: boolean
  indicator?: boolean
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function Avatar({
  className,
  type,
  src,
  alt = "",
  initials,
  icon,
  shape = "rounded",
  border = false,
  indicator = false,
  ...props
}: AvatarProps) {
  const resolvedType: AvatarType = type ?? (src ? "image" : "icon")

  return (
    <div
      data-slot="avatar"
      data-shape={shape}
      data-type={resolvedType}
      className={cn(
        "avatar",
        `avatar--${shape}`,
        border && "avatar--bordered",
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      {...props}
    >
      {resolvedType === "image" && src ? (
        <img alt={alt} src={src} className="avatar__image" />
      ) : resolvedType === "initials" ? (
        <span className="avatar__initials text-c3-regular-label-l3">{initials}</span>
      ) : (
        <span className="avatar__icon inline-flex items-center justify-center [&_svg]:size-6">
          {icon ?? <User aria-hidden="true" />}
        </span>
      )}

      {indicator ? (
        <span className="avatar__indicator size-4" aria-hidden="true" />
      ) : null}
    </div>
  )
}

export { Avatar }
export type { AvatarProps, AvatarType, AvatarShape }
