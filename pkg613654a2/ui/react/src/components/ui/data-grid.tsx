import * as React from "react"
import { ArrowDown, ArrowDownUp, ArrowUp, Columns3, Download, ListFilter, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { ActionGroup } from "@/components/ui/action-group"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Listbox, ListboxItem } from "@/components/ui/listbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import "./data-grid.scss"

/**
 * c3 DataGrid — a composable, presentational data table (Figma node 43967-28031).
 *
 * Compose it like an HTML table:
 *   <DataGrid>
 *     <DataGridHeader>
 *       <DataGridRow>
 *         <DataGridHead><Checkbox …/></DataGridHead>
 *         <DataGridHead sortable sortDirection="asc" onSort={…}>Name</DataGridHead>
 *         <DataGridHead align="right">Amount</DataGridHead>
 *       </DataGridRow>
 *     </DataGridHeader>
 *     <DataGridBody>
 *       <DataGridRow selected>
 *         <DataGridCell><Checkbox …/></DataGridCell>
 *         <DataGridCell><Link>…</Link></DataGridCell>
 *         <DataGridCell align="right"><Badge …/></DataGridCell>
 *       </DataGridRow>
 *     </DataGridBody>
 *   </DataGrid>
 *
 * Cell *content* is bring-your-own composition of existing primitives — Avatar,
 * Link, Badge/DotBadge, Progress (+ a "%" label), lucide icons + Tooltip, inputs.
 * Sort/filter/selection are presentational: they render state and emit callbacks
 * (onSort / onFilter / a Checkbox's onChange); the consumer owns the data.
 *
 * Sort + filter affordances default ON for every <DataGridHead>; pass
 * sortable={false} / filterable={false} to hide them (e.g. the select and
 * actions columns). Selection checkboxes in cells should be size="sm".
 *
 * <DataGridToolbar> is the band above the table: a search slot on the left and an
 * <ActionGroup> on the right whose icon group is always columns-3 (show/hide
 * columns) · download (CSV of the full dataset) · ellipsis (overflow menu). It
 * carries the bottom border that separates it from the header row.
 *
 * NB: the BEM family is prefixed `c3-data-grid*` because `table`, `table-row`, and
 * `table-cell` are all Tailwind display utilities (collision — see
 * [[feedback_twmerge_custom_utilities]]). Spacing/borders/colors live in data-grid.scss.
 *
 * Note: this component is a simpler, fully-presentational grid (no headless
 * table engine) — distinct from any TanStack-Table-backed DataGrid elsewhere in
 * the design system. A separate, more minimal `Table` (no sort/filter/toolbar)
 * is planned for cases that don't need any of this.
 */

type Align = "left" | "right"
type SortDirection = "asc" | "desc" | null

function DataGrid({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="c3-data-grid__scroll">
      <table data-slot="data-grid" className={cn("c3-data-grid", className)} {...props} />
    </div>
  )
}

function DataGridHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="data-grid-header" className={cn("c3-data-grid__header", className)} {...props} />
}

function DataGridBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="data-grid-body" className={cn("c3-data-grid__body", className)} {...props} />
}

type DataGridRowProps = React.ComponentProps<"tr"> & { selected?: boolean }

function DataGridRow({ className, selected, ...props }: DataGridRowProps) {
  return (
    <tr
      data-slot="data-grid-row"
      data-selected={selected || undefined}
      className={cn("c3-data-grid__row", className)}
      {...props}
    />
  )
}

type DataGridHeadProps = Omit<React.ComponentProps<"th">, "onClick"> & {
  align?: Align
  columnBorder?: boolean
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
  filterable?: boolean
  filterActive?: boolean
  onFilter?: () => void
}

function DataGridHead({
  className,
  align = "left",
  columnBorder = false,
  sortable = true,
  sortDirection = null,
  onSort,
  filterable = true,
  filterActive = false,
  onFilter,
  children,
  ...props
}: DataGridHeadProps) {
  const SortIcon = sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ArrowDownUp
  const hasActions = sortable || filterable

  return (
    <th
      data-slot="data-grid-head"
      data-align={align}
      data-column-border={columnBorder || undefined}
      scope="col"
      aria-sort={
        sortable ? (sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none") : undefined
      }
      className={cn("c3-data-grid__head", className)}
      {...props}
    >
      <div className="c3-data-grid__head-inner">
        <span className="c3-data-grid__head-label text-c3-regular-label-l2">{children}</span>
        {hasActions ? (
          <span className="c3-data-grid__head-actions">
            {filterable ? (
              <button
                type="button"
                onClick={onFilter}
                aria-label="Filter column"
                aria-pressed={filterActive}
                data-active={filterActive || undefined}
                className="c3-data-grid__head-action"
              >
                <ListFilter />
              </button>
            ) : null}
            {sortable ? (
              <button
                type="button"
                onClick={onSort}
                aria-label="Sort column"
                data-active={sortDirection != null || undefined}
                className="c3-data-grid__head-action"
              >
                <SortIcon />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </th>
  )
}

type DataGridCellProps = React.ComponentProps<"td"> & { align?: Align }

function DataGridCell({ className, align = "left", ...props }: DataGridCellProps) {
  return (
    <td
      data-slot="data-grid-cell"
      data-align={align}
      className={cn("c3-data-grid__cell", className)}
      {...props}
    />
  )
}

type DataGridRowActionsProps = React.ComponentProps<"div"> & {
  /** Keep the actions visible at rest (defaults to hover/selected-only). */
  alwaysVisible?: boolean
}

// End-of-row action cluster (edit / delete / overflow). Hidden by default;
// revealed on row hover, when the row is selected, or on keyboard focus-within
// (reveal logic lives in data-grid.scss). Drop inside a <DataGridCell align="right">.
function DataGridRowActions({ className, alwaysVisible, ...props }: DataGridRowActionsProps) {
  return (
    <div
      data-slot="data-grid-row-actions"
      data-always-visible={alwaysVisible || undefined}
      className={cn("c3-data-grid__row-actions inline-flex items-center justify-end", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Toolbar — the band above the table.
// ---------------------------------------------------------------------------

type ActionGroupSize = "sm" | "md" | "lg"
const ICON_SIZE: Record<ActionGroupSize, "icon-sm" | "icon-md" | "icon-lg"> = {
  sm: "icon-sm",
  md: "icon-md",
  lg: "icon-lg",
}

/** A toggleable column for the columns-3 show/hide popover. */
type DataGridColumnToggle = { id: string; label: string }

// columns-3: a multi-select popover listing every column; checking/unchecking
// shows/hides it. Controlled via `visibleColumns`, else manages its own state
// (all columns visible to start).
function DataGridColumnsToggle({
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  size = "md",
}: {
  columns: DataGridColumnToggle[]
  visibleColumns?: string[]
  onVisibleColumnsChange?: (ids: string[]) => void
  size?: ActionGroupSize
}) {
  const allIds = React.useMemo(() => columns.map((c) => c.id), [columns])
  const isControlled = visibleColumns !== undefined
  const [internal, setInternal] = React.useState<string[]>(allIds)
  const values = isControlled ? visibleColumns! : internal

  const commit = (next: string[]) => {
    if (!isControlled) setInternal(next)
    onVisibleColumnsChange?.(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          appearance="secondary"
          size={ICON_SIZE[size]}
          aria-label="Show or hide columns"
        >
          <Columns3 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="c3-data-grid-toolbar__columns">
        <Listbox mode="multiple" values={values} onValuesChange={commit} aria-label="Toggle columns">
          {columns.map((c) => (
            <ListboxItem key={c.id} value={c.id} label={c.label} />
          ))}
        </Listbox>
      </PopoverContent>
    </Popover>
  )
}

type DataGridToolbarProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Left-aligned search slot — pass an <InputSearch>. */
  search?: React.ReactNode
  /** ActionGroup hierarchy buttons (auto-styled — pass bare <Button>s). */
  tertiary?: React.ReactNode
  secondary?: React.ReactNode
  primary?: React.ReactNode
  /** columns-3: the toggleable columns. Omit to hide the columns button. */
  columns?: DataGridColumnToggle[]
  visibleColumns?: string[]
  onVisibleColumnsChange?: (ids: string[]) => void
  /** download: invoked by the download icon button. Build the CSV with
   *  downloadDataGridCsv (include hidden columns). */
  onDownload?: () => void
  /** ellipsis: <DropdownMenuItem>s for the always-present overflow menu. */
  menu?: React.ReactNode
  menuLabel?: string
  size?: ActionGroupSize
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function DataGridToolbar({
  className,
  search,
  tertiary,
  secondary,
  primary,
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  onDownload,
  menu,
  menuLabel = "More table actions",
  size = "md",
  ...props
}: DataGridToolbarProps) {
  // The fixed icon group: columns-3 · download · ellipsis (always all three).
  const iconActions = (
    <>
      {columns ? (
        <DataGridColumnsToggle
          columns={columns}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={onVisibleColumnsChange}
          size={size}
        />
      ) : null}
      <Button
        variant="ghost"
        appearance="secondary"
        size={ICON_SIZE[size]}
        aria-label="Download CSV"
        onClick={onDownload}
      >
        <Download />
      </Button>
      <DropdownMenu align="end">
        <DropdownMenuTrigger>
          <Button variant="ghost" appearance="secondary" size={ICON_SIZE[size]} aria-label={menuLabel}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </>
  )

  return (
    <div
      data-slot="data-grid-toolbar"
      className={cn("c3-data-grid-toolbar flex items-center gap-4", className)}
      {...props}
    >
      <div className="c3-data-grid-toolbar__search min-w-0 flex-1">
        <div className="max-w-[400px]">{search}</div>
      </div>
      <ActionGroup
        size={size}
        tertiary={tertiary}
        secondary={secondary}
        primary={primary}
        iconActions={iconActions}
      />
    </div>
  )
}

export {
  DataGrid,
  DataGridHeader,
  DataGridBody,
  DataGridRow,
  DataGridHead,
  DataGridCell,
  DataGridRowActions,
  DataGridToolbar,
}
export type {
  DataGridHeadProps,
  DataGridCellProps,
  DataGridRowProps,
  DataGridRowActionsProps,
  DataGridToolbarProps,
  DataGridColumnToggle,
  Align,
  SortDirection,
}
