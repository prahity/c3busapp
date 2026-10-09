import * as React from "react"

import { cn } from "@/lib/utils"
import "./header.scss"

/**
 * c3 Header — verified against Figma node 44751-4628.
 *
 * A header band for *other containers* — cards, sections, forms, pages. It spans
 * the full width of its parent and lays out, left-to-right:
 *
 *   leadingIcon / avatarSrc — optional decoration on the far left
 *   title (+ badges + infoIcon) — the title block; subtitle sits beneath it
 *   actions — optional right-aligned action group (ghost icon Buttons, etc.)
 *
 * The five Figma sizes map to the kind of container the header heads:
 *   xs → child section/card   sm → card   md → container (default)
 *   lg → form/section         xl → page
 * Size only changes title/subtitle typography and the title↔subtitle gap.
 *
 * Adornments are slots, not boolean toggles: each renders only when provided,
 * letting consumers pass real <Badge>, <Button>, or tooltip-wrapped icons rather
 * than gating a baked-in default. Color lives in header.scss; Tailwind here owns
 * layout and typography.
 */

type HeaderSize = "xs" | "sm" | "md" | "lg" | "xl"

type HeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  size?: HeaderSize
  title: React.ReactNode
  subtitle?: React.ReactNode
  leadingIcon?: React.ReactNode
  avatarSrc?: string
  badges?: React.ReactNode
  infoIcon?: React.ReactNode
  actions?: React.ReactNode
}

// Per-size typography. Title weight/scale and subtitle scale follow the Figma
// style entries on node 44751-4628 (C3 Regular/Heading/*, C3 Bold/Heading/H4,
// C3 Regular/Body/*, C3 Regular/Label/L3).
const TITLE_TYPOGRAPHY: Record<HeaderSize, string> = {
  xs: "text-c3-regular-label-l3",
  sm: "text-c3-regular-heading-h6",
  md: "text-c3-regular-heading-h5",
  lg: "text-c3-regular-heading-h4",
  xl: "text-c3-bold-heading-h4",
}

const SUBTITLE_TYPOGRAPHY: Record<HeaderSize, string> = {
  xs: "text-c3-regular-body-p3",
  sm: "text-c3-regular-body-p3",
  md: "text-c3-regular-body-p2",
  lg: "text-c3-regular-body-p2",
  xl: "text-c3-regular-body-p2",
}

function Header({
  className,
  size = "md",
  title,
  subtitle,
  leadingIcon,
  avatarSrc,
  badges,
  infoIcon,
  actions,
  ...props
}: HeaderProps) {
  // On Page headers (xl) the actions align to the whole block; on every other
  // size they sit inline with the title row.
  const actionsOutside = size === "xl"
  const actionsNode = actions ? (
    <div className="header__actions flex shrink-0 items-center gap-[var(--c3-style-spacing-4)]">
      {actions}
    </div>
  ) : null

  return (
    <div
      data-slot="header"
      data-size={size}
      className={cn(
        "header",
        `header--size-${size}`,
        "flex w-full items-start gap-[var(--c3-style-spacing-12)]",
        className,
      )}
      {...props}
    >
      {leadingIcon ? (
        <span className="header__leading inline-flex h-7 shrink-0 items-center [&_svg]:size-4">
          {leadingIcon}
        </span>
      ) : null}

      {avatarSrc ? (
        <img
          alt=""
          src={avatarSrc}
          className="header__avatar size-7 shrink-0 rounded-[var(--c3-style-border-radius-8)] object-cover"
        />
      ) : null}

      <div className="header__main flex min-w-px flex-1 flex-col">
        <div className="header__top flex items-center justify-between">
          <div className="header__title-group flex min-w-px flex-1 items-center gap-[var(--c3-style-spacing-4)]">
            <span className={cn("header__title truncate", TITLE_TYPOGRAPHY[size])}>
              {title}
            </span>
            {badges ? (
              <div className="header__badges flex shrink-0 items-center gap-[var(--c3-style-spacing-8)]">
                {badges}
              </div>
            ) : null}
            {infoIcon ? (
              <span className="header__info inline-flex shrink-0 items-center [&_svg]:size-4">
                {infoIcon}
              </span>
            ) : null}
          </div>
          {!actionsOutside ? actionsNode : null}
        </div>

        {subtitle ? (
          <p className={cn("header__subtitle w-full truncate", SUBTITLE_TYPOGRAPHY[size])}>
            {subtitle}
          </p>
        ) : null}
      </div>

      {actionsOutside ? actionsNode : null}
    </div>
  )
}

export { Header }
export type { HeaderProps, HeaderSize }
