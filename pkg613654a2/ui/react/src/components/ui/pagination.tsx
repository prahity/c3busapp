import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import "./pagination.scss"

/**
 * c3 Pagination — a presentational, controlled pager (Figma node 44734-12271).
 *
 * The consumer owns the page state: pass `page` (1-based) + `pageCount` and react
 * to `onPageChange`. Two layouts:
 *   controls — prev · page numbers · "more" · next
 *   full     — items-per-page <Combobox> · range label · the same controls,
 *              right-aligned (for a table footer)
 *
 * Reuses Button (ghost icon) for the arrows + "more", and Combobox for the
 * items-per-page select. The page-number buttons are a small dedicated element;
 * their sizing/colors/states live in pagination.scss.
 */

type PaginationType = "controls" | "full"

type PaginationProps = Omit<React.ComponentProps<"nav">, "onChange"> & {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  type?: PaginationType
  totalItems?: number
  pageSize?: number
  pageSizeOptions?: number[]
  onPageSizeChange?: (size: number) => void
  showItemsPerPage?: boolean
  showRangeLabel?: boolean
  showMore?: boolean
}

// Up to 3 page numbers around the current page (matches the Figma window).
function visiblePages(page: number, pageCount: number): number[] {
  if (pageCount <= 3) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  const start = Math.min(Math.max(page - 1, 1), pageCount - 2)
  return [start, start + 1, start + 2]
}

function PageButton({
  n,
  current,
  onClick,
}: {
  n: number
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={cn(
        "pagination__page",
        current && "pagination__page--current",
        "inline-flex items-center justify-center",
        current ? "text-c3-bold-label-l3" : "text-c3-regular-label-l3",
      )}
    >
      {n}
    </button>
  )
}

// React 19: ref flows through React.ComponentProps<"nav"> + spread — no forwardRef.
function Pagination({
  className,
  page,
  pageCount,
  onPageChange,
  type = "controls",
  totalItems,
  pageSize,
  pageSizeOptions = [12, 24, 48, 96],
  onPageSizeChange,
  showItemsPerPage = true,
  showRangeLabel = true,
  showMore = true,
  ...props
}: PaginationProps) {
  const pages = visiblePages(page, pageCount)
  const hasMore = showMore && pages[pages.length - 1] < pageCount
  const atStart = page <= 1
  const atEnd = page >= pageCount

  const controls = (
    <div className="pagination__controls inline-flex items-center">
      <Button
        variant="ghost"
        appearance="secondary"
        size="icon-sm"
        aria-label="Previous page"
        disabled={atStart}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft />
      </Button>
      <div className="pagination__pages inline-flex items-center">
        {pages.map((n) => (
          <PageButton
            key={n}
            n={n}
            current={n === page}
            onClick={() => onPageChange(n)}
          />
        ))}
      </div>
      {hasMore ? (
        <Button
          variant="ghost"
          appearance="secondary"
          size="icon-sm"
          aria-label="More pages"
          onClick={() => onPageChange(Math.min(page + 3, pageCount))}
        >
          <MoreHorizontal />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        appearance="secondary"
        size="icon-sm"
        aria-label="Next page"
        disabled={atEnd}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  )

  if (type === "controls") {
    return (
      <nav
        data-slot="pagination"
        data-type="controls"
        aria-label="Pagination"
        className={cn("pagination inline-flex items-center", className)}
        {...props}
      >
        {controls}
      </nav>
    )
  }

  // full: items-per-page select · range label · controls (right-aligned)
  const rangeLabel =
    totalItems != null && pageSize != null
      ? `${(page - 1) * pageSize + 1} – ${Math.min(page * pageSize, totalItems)} of ${totalItems} items`
      : null

  return (
    <nav
      data-slot="pagination"
      data-type="full"
      aria-label="Pagination"
      className={cn("pagination flex w-full items-center", className)}
      {...props}
    >
      {showItemsPerPage && pageSize != null ? (
        <div className="pagination__per-page flex flex-1 items-center">
          <span className="pagination__per-page-label text-c3-regular-label-l3">
            Items per page:
          </span>
          <DropdownMenu align="start">
            <DropdownMenuTrigger>
              <button
                type="button"
                className="pagination__per-page-select inline-flex items-center justify-between text-c3-regular-body-p2"
              >
                {pageSize}
                <ChevronDown className="size-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            {pageSizeOptions.map((n) => (
              <DropdownMenuItem
                key={n}
                label={String(n)}
                onSelect={() => onPageSizeChange?.(n)}
              />
            ))}
          </DropdownMenu>
        </div>
      ) : null}
      {showRangeLabel && rangeLabel ? (
        <span className="pagination__range text-c3-regular-label-l3">{rangeLabel}</span>
      ) : null}
      {controls}
    </nav>
  )
}

export { Pagination }
export type { PaginationProps, PaginationType }
