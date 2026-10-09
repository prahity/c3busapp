import * as React from "react"
import { cn } from "@/lib/utils"
import "./table.scss"

/**
 * c3 Table — a lightweight, presentational table for INLINE CONTENT: docs
 * tables, spec sheets, key/value matrices, comparison grids embedded in prose.
 *
 * This is deliberately NOT the data solution. For anything interactive —
 * sorting, filtering, row selection, pagination, a toolbar, CSV export — use
 * DataGrid (see data-grid.tsx). Table is the small, static counterpart: no
 * state, no callbacks, just semantic <table> markup with c3 tokens applied.
 *
 * Composable primitives mirror the native table elements:
 *   Table
 *     TableHeader → TableRow → TableHead
 *     TableBody   → TableRow → TableCell
 *     TableFooter → TableRow → TableCell
 *   TableCaption (optional, rendered below the table)
 *
 * Props on <Table>:
 *   size:  "sm" | "md"  (default "md") — cell density.
 *   hover: boolean       (default false) — tint body rows on :hover. Inline
 *          content is usually static, so this is off unless the table doubles
 *          as a selectable list.
 *
 * Theming (border, rounded container, header fill, row dividers, hover) lives
 * in table.scss — see references/scss-bem-convention.md. Tailwind here owns
 * width, alignment, and typography only.
 */

type TableSize = "sm" | "md"

type TableProps = React.ComponentProps<"table"> & {
  size?: TableSize
  hover?: boolean
}

function Table({ className, size = "md", hover = false, ...props }: TableProps) {
  return (
    // The container owns the rounded border and clips corners; it also scrolls
    // horizontally on overflow so a wide table never breaks the page layout.
    <div data-slot="table-container" className="table-container overflow-x-auto">
      <table
        data-slot="table"
        data-size={size}
        className={cn(
          "table",
          `table--size-${size}`,
          hover && "table--hover",
          "w-full font-sans text-c3-regular-body-p2",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("table__header", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("table__body", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("table__footer", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("table__row", className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn("table__head text-left align-top text-c3-bold-label-l2", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("table__cell align-top", className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("table__caption text-c3-regular-body-p3", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
}
export type { TableSize }
