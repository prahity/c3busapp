import * as React from "react"

import { cn } from "@/lib/utils"
import { Breadcrumbs } from "@/components/ui/breadcrumbs"
import type { BreadcrumbItemData } from "@/components/ui/breadcrumbs"
import { Header } from "@/components/ui/header"
import "./page-header.scss"

/**
 * c3 Page Header — the full-width band at the top of a page (Figma 44568-17928).
 * Replaces the standalone Tab Panel.
 *
 * A composition shell, not a new primitive: each region delegates to an existing
 * component so the page header only owns section layout + the bottom border.
 * Top → bottom:
 *
 *   breadcrumbs — optional trail, rendered via <Breadcrumbs> (size md)
 *   title group — title + description + right-aligned actions, rendered via the
 *                 <Header size="xl"> band (H4-bold title, P2 description, actions
 *                 aligned to the top of the block)
 *   children    — optional content region (stats / selects / KPI cards). There is
 *                 no built Stat/Metric component — this is bring-your-own content.
 *                 Its presence tightens the title-group bottom padding (Figma's
 *                 "With Content" type).
 *   tabs        — optional tab row slot. Pass a <Tabs variant="bordered">; the tab
 *                 panels live in the page body below the header, not here.
 *
 * Color (bg + bottom border) lives in page-header.scss; Tailwind here owns the
 * section paddings/gaps via --c3-style-spacing-* tokens.
 */

type PageHeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** Breadcrumb trail. Renders <Breadcrumbs items={breadcrumbs} size="md" />. */
  breadcrumbs?: BreadcrumbItemData[]
  /** Status chip(s) shown inline to the right of the title (left side of the
   *  band). A status is not an action — pass it here, not in `actions`.
   *  Forwarded to the <Header> `badges` slot. */
  badges?: React.ReactNode
  /** Right-aligned action group. Pass an <ActionGroup> (the canonical
   *  tertiary → secondary → primary │ ellipsis cluster); a bare node also works. */
  actions?: React.ReactNode
  /** Tab row slot — pass a <Tabs variant="bordered"><TabsList>…</TabsList></Tabs>. */
  tabs?: React.ReactNode
  /** Content region (stats / selects / KPI cards). Shown only when provided. */
  children?: React.ReactNode
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function PageHeader({
  className,
  title,
  description,
  breadcrumbs,
  badges,
  actions,
  tabs,
  children,
  ...props
}: PageHeaderProps) {
  const hasContent = children != null

  return (
    <div
      data-slot="page-header"
      data-with-content={hasContent || undefined}
      className={cn(
        "page-header",
        hasContent && "page-header--with-content",
        "flex w-full flex-col",
        className,
      )}
      {...props}
    >
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="page-header__breadcrumbs flex items-center">
          <Breadcrumbs items={breadcrumbs} size="md" />
        </div>
      ) : null}

      <div className="page-header__title-group">
        <Header
          size="xl"
          title={title}
          subtitle={description}
          badges={badges}
          actions={actions}
        />
      </div>

      {hasContent ? (
        <div className="page-header__content flex items-start">{children}</div>
      ) : null}

      {tabs ? <div className="page-header__tabs">{tabs}</div> : null}
    </div>
  )
}

export { PageHeader }
export type { PageHeaderProps }
