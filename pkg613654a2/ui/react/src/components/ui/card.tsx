import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * c3 Card — verified against Figma node 44811:3115 ("Card / Card Example").
 *
 * Generic content surface. Composable subcomponents (CardHeader / CardTitle /
 * CardDescription / CardAction / CardContent / CardList / CardRow / CardFooter /
 * CardMedia) cover the 27 variants in that frame (9 categories × 3 variances) —
 * every variant is just a different arrangement of the same slots, so the
 * primitive stays content-agnostic rather than branching on a "pattern" prop.
 *
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Card title</CardTitle>
 *       <CardDescription>Category</CardDescription>
 *       <CardAction><button aria-label="More">···</button></CardAction>
 *     </CardHeader>
 *     <CardContent>Body text.</CardContent>
 *     <CardFooter><Button>Primary</Button></CardFooter>
 *   </Card>
 *
 * Tailwind + --c3-style-* tokens only — no SCSS (see references/scss-bem-convention.md
 * for when SCSS is still the right call; this primitive doesn't need it).
 */

const cardVariants = cva(
  "flex w-full flex-col overflow-hidden rounded-[var(--c3-style-border-radius-6)] bg-[var(--c3-style-basic-bg-primary)] text-[var(--c3-style-basic-fg-primary)]",
  {
    variants: {
      variant: {
        outlined: "border border-[var(--c3-style-basic-border-border)]",
        elevated: "border border-[var(--c3-style-basic-border-border)] shadow-sm",
        flush: "",
      },
    },
    defaultVariants: { variant: "outlined" },
  },
)

type CardSize = "sm" | "md" | "lg"

const CardSizeContext = React.createContext<CardSize>("md")

const sizePadding: Record<CardSize, string> = {
  sm: "p-[var(--c3-style-spacing-12)] gap-[var(--c3-style-spacing-8)]",
  md: "p-[var(--c3-style-spacing-16)] gap-[var(--c3-style-spacing-12)]",
  lg: "p-[var(--c3-style-spacing-24)] gap-[var(--c3-style-spacing-16)]",
}

type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    size?: CardSize
  }

function Card({ className, variant, size = "md", children, ...props }: CardProps) {
  return (
    <CardSizeContext.Provider value={size}>
      <div
        data-slot="card"
        data-variant={variant ?? "outlined"}
        data-size={size}
        className={cn(cardVariants({ variant }), sizePadding[size], className)}
        {...props}
      >
        {children}
      </div>
    </CardSizeContext.Provider>
  )
}

/**
 * Header row — a grid so a multi-line title/description stack sits in column 1
 * while an optional `<CardAction>` pins to column 2, spanning every row.
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-cols-[1fr_auto] items-start gap-x-[var(--c3-style-spacing-12)] gap-y-[var(--c3-style-spacing-2)]",
        "[&>[data-slot=card-title]]:col-start-1",
        "[&>[data-slot=card-description]]:col-start-1",
        "[&>[data-slot=card-action]]:col-start-2 [&>[data-slot=card-action]]:row-start-1 [&>[data-slot=card-action]]:row-span-full",
        className,
      )}
      {...props}
    />
  )
}

/** Title — regular-heading-h6 spec: 14/20, weight 500. */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("truncate text-c3-regular-heading-h6 text-[var(--c3-style-basic-fg-primary)]", className)}
      {...props}
    />
  )
}

/** Description / subtitle — regular-body-p3, secondary color. */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]", className)}
      {...props}
    />
  )
}

/** Right-aligned slot next to the title — ghost icon button, chip, or link. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("flex shrink-0 items-center gap-[var(--c3-style-spacing-4)] self-start", className)}
      {...props}
    />
  )
}

/** Body — regular-body-p3 by default; consumers can override for richer content. */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]", className)}
      {...props}
    />
  )
}

/**
 * Full-width list band for row content inside a card (activity feed, recent
 * items, key/value rows). Cancels the card's horizontal padding via a negative
 * margin so the row separators / hover reach the card edges, and stacks its
 * `CardRow` children with a hairline divider between them.
 *
 * Pair it with `CardRow`, which adds the matching horizontal padding back so the
 * row *content* stays inset — the same cancel-then-restore trick `CardFooter`
 * uses. Using the raw negative margin without `CardRow` is the usual cause of a
 * list whose avatars/text run flush to (and get clipped by) the card border.
 *
 *   <CardContent className="p-0">
 *     <CardList>
 *       {items.map((it) => (
 *         <CardRow key={it.id}>
 *           <Avatar>{it.initials}</Avatar>
 *           <div className="min-w-0 flex-1">…</div>
 *         </CardRow>
 *       ))}
 *     </CardList>
 *   </CardContent>
 */
function CardList({ className, ...props }: React.ComponentProps<"div">) {
  const size = React.useContext(CardSizeContext)
  const inset =
    size === "sm"
      ? "-mx-[var(--c3-style-spacing-12)]"
      : size === "lg"
        ? "-mx-[var(--c3-style-spacing-24)]"
        : "-mx-[var(--c3-style-spacing-16)]"
  return (
    <div
      data-slot="card-list"
      className={cn(
        "flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]",
        inset,
        className,
      )}
      {...props}
    />
  )
}

/**
 * A single row inside `CardList`. Restores the horizontal padding `CardList`
 * cancelled (matching the card's `size`) so content lines up with the header,
 * and adds comfortable vertical padding + gap. Compose freely — avatar/icon,
 * a `min-w-0 flex-1` text stack, trailing meta.
 */
function CardRow({ className, ...props }: React.ComponentProps<"div">) {
  const size = React.useContext(CardSizeContext)
  const pad =
    size === "sm"
      ? "gap-[var(--c3-style-spacing-8)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)]"
      : size === "lg"
        ? "gap-[var(--c3-style-spacing-16)] px-[var(--c3-style-spacing-24)] py-[var(--c3-style-spacing-16)]"
        : "gap-[var(--c3-style-spacing-12)] px-[var(--c3-style-spacing-16)] py-[var(--c3-style-spacing-12)]"
  return (
    <div data-slot="card-row" className={cn("flex items-center", pad, className)} {...props} />
  )
}

/**
 * Footer / action bar. No border by default — the section gap already reads
 * as separation. Pass `bordered` for a visible rule above the footer.
 */
type CardFooterProps = React.ComponentProps<"div"> & { bordered?: boolean }

function CardFooter({ className, bordered, ...props }: CardFooterProps) {
  const size = React.useContext(CardSizeContext)
  const borderInset =
    size === "sm"
      ? "-mx-[var(--c3-style-spacing-12)] -mb-[var(--c3-style-spacing-12)] px-[var(--c3-style-spacing-12)] py-[var(--c3-style-spacing-8)]"
      : size === "lg"
        ? "-mx-[var(--c3-style-spacing-24)] -mb-[var(--c3-style-spacing-24)] px-[var(--c3-style-spacing-24)] py-[var(--c3-style-spacing-12)]"
        : "-mx-[var(--c3-style-spacing-16)] -mb-[var(--c3-style-spacing-16)] px-[var(--c3-style-spacing-16)] py-[var(--c3-style-spacing-12)]"
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex items-center gap-[var(--c3-style-spacing-8)]",
        bordered && cn("border-t border-[var(--c3-style-basic-border-border)]", borderInset),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Top-bleed media region (image, chart, thumbnail) — rendered edge-to-edge via
 * a negative margin that cancels the card's own padding, paired with the
 * root's `overflow-hidden` so it still respects the card's corner radius.
 */
type CardMediaProps = React.ComponentProps<"div"> & {
  src?: string
  alt?: string
}

function CardMedia({ className, src, alt = "", children, ...props }: CardMediaProps) {
  const size = React.useContext(CardSizeContext)
  const negative =
    size === "sm"
      ? "-m-[var(--c3-style-spacing-12)]"
      : size === "lg"
        ? "-m-[var(--c3-style-spacing-24)]"
        : "-m-[var(--c3-style-spacing-16)]"
  return (
    <div
      data-slot="card-media"
      className={cn(negative, "relative mb-0 overflow-hidden bg-[var(--c3-style-basic-bg-secondary)]", className)}
      {...props}
    >
      {src ? <img src={src} alt={alt} className="block h-full w-full object-cover" /> : children}
    </div>
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardList, CardRow, CardFooter, CardMedia }
export type { CardProps, CardSize, CardFooterProps, CardMediaProps }
