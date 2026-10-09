import * as React from "react"

import { cn } from "@/lib/utils"
import { Header } from "@/components/ui/header"
import "./container.scss"

/**
 * c3 Container — a bordered card surface that wraps a header, body, and optional
 * footer (Figma node 43738-14577). The shell around tables, lists, and forms.
 *
 *   size: xs | sm | md — drives padding + header typography (via <Header>)
 *   contentWidth:
 *     contained  — the card is padded; header/body/footer share the padding
 *     full-width — padding 0; header & footer get their own padded rows with
 *                  borders and the body sits flush to the card edges (so a DataGrid
 *                  fills it edge-to-edge)
 *
 * Reuses <Header> for the title block (its size map already matches Figma:
 * md→H5, sm→H6, xs→L3). Padding/border/gap per size+variant live in
 * container.scss. NB: the BEM block is `.c3-container`, not `.container`, because
 * `container` is a Tailwind core utility (responsive max-widths) that would both
 * collide in cn() and apply unwanted styles — see [[feedback_twmerge_custom_utilities]].
 */

type ContainerSize = "xs" | "sm" | "md"
type ContainerContentWidth = "contained" | "full-width"

type ContainerProps = Omit<React.ComponentProps<"div">, "title"> & {
  size?: ContainerSize
  contentWidth?: ContainerContentWidth
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function Container({
  className,
  size = "md",
  contentWidth = "contained",
  title,
  subtitle,
  actions,
  footer,
  children,
  ...props
}: ContainerProps) {
  const hasHeader = title != null || subtitle != null || actions != null

  return (
    <div
      data-slot="container"
      data-size={size}
      data-content-width={contentWidth}
      className={cn(
        "c3-container",
        `c3-container--size-${size}`,
        contentWidth === "full-width" && "c3-container--full-width",
        "flex flex-col",
        className,
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="c3-container__header">
          <Header size={size} title={title} subtitle={subtitle} actions={actions} />
        </div>
      ) : null}

      <div className="c3-container__body">{children}</div>

      {footer ? <div className="c3-container__footer">{footer}</div> : null}
    </div>
  )
}

export { Container }
export type { ContainerProps, ContainerSize, ContainerContentWidth }
