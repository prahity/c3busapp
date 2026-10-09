import * as React from "react"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ButtonAppearance, ButtonVariant } from "@/components/ui/button"
import { Divider } from "@/components/ui/divider"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * c3 ActionGroup — the canonical, ordered action cluster shared by PageHeader,
 * DataGridToolbar, and any container that needs a button hierarchy + overflow.
 *
 * Left → right, the fixed order is:
 *
 *   tertiary  (max 1)  → secondary (as many as you like) → primary (max 1)
 *   │ vertical divider │
 *   iconActions (extra trailing icon buttons) → overflow ellipsis (DropdownMenu)
 *
 * Each hierarchy slot is given its canonical Button styling so callers only pass
 * a bare <Button> with its label/icon; an explicit `variant`/`appearance`/`size`
 * on the passed Button always wins:
 *   tertiary  → variant="ghost"   appearance="accent"  (text-only accent)
 *   secondary → variant="outline" appearance="accent"  (bordered accent)
 *   primary   → variant="solid"   appearance="accent"  (the Button default)
 *
 * The divider only renders when there is BOTH a hierarchy button AND something
 * trailing (iconActions or menu): an overflow-only group (e.g. a lone ellipsis)
 * shows no divider.
 *
 * Layout/gaps + the divider height live in action-group.scss.
 */

type ActionGroupSize = "sm" | "md" | "lg"

const ICON_SIZE: Record<ActionGroupSize, "icon-sm" | "icon-md" | "icon-lg"> = {
  sm: "icon-sm",
  md: "icon-md",
  lg: "icon-lg",
}

// Vertical divider height per group size — an items-center row doesn't give the
// vertical Divider a height, so pin it to the button height of the group.
const DIVIDER_HEIGHT: Record<ActionGroupSize, string> = {
  sm: "h-[var(--c3-style-height-h-28)]",
  md: "h-[var(--c3-style-height-h-32)]",
  lg: "h-[var(--c3-style-height-h-36)]",
}

type SlotDefaults = { variant: ButtonVariant; appearance: ButtonAppearance }

const SLOT_DEFAULTS: Record<"tertiary" | "secondary" | "primary", SlotDefaults> = {
  tertiary: { variant: "ghost", appearance: "accent" },
  secondary: { variant: "outline", appearance: "accent" },
  primary: { variant: "solid", appearance: "accent" },
}

// Clone a passed <Button> applying the slot's canonical defaults without
// clobbering anything the caller set explicitly.
function withSlotDefaults(
  node: React.ReactNode,
  slot: "tertiary" | "secondary" | "primary",
  size: ActionGroupSize,
  key?: React.Key,
): React.ReactNode {
  if (!React.isValidElement(node)) return node
  const props = node.props as {
    variant?: ButtonVariant
    appearance?: ButtonAppearance
    size?: string
  }
  const defaults = SLOT_DEFAULTS[slot]
  return React.cloneElement(node as React.ReactElement<Record<string, unknown>>, {
    key,
    variant: props.variant ?? defaults.variant,
    appearance: props.appearance ?? defaults.appearance,
    size: props.size ?? size,
  })
}

type ActionGroupProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Lowest-emphasis action — a single <Button>. */
  tertiary?: React.ReactNode
  /** Medium-emphasis actions — one or many <Button>s (array or fragment). */
  secondary?: React.ReactNode
  /** Highest-emphasis action — a single <Button>. */
  primary?: React.ReactNode
  /** Extra trailing icon buttons placed after the divider, before the overflow. */
  iconActions?: React.ReactNode
  /** Overflow menu items — when present, renders a trailing ellipsis icon button
   *  that opens a <DropdownMenu> containing these <DropdownMenuItem>s. */
  menu?: React.ReactNode
  /** aria-label for the overflow ellipsis trigger. */
  menuLabel?: string
  /** Drives the button sizing for the whole group. Default "md". */
  size?: ActionGroupSize
}

// React 19: ref flows through React.ComponentProps<"div"> + spread — no forwardRef.
function ActionGroup({
  className,
  tertiary,
  secondary,
  primary,
  iconActions,
  menu,
  menuLabel = "More actions",
  size = "md",
  ...props
}: ActionGroupProps) {
  const tertiaryNode = withSlotDefaults(tertiary, "tertiary", size)
  const secondaryNodes = React.Children.toArray(secondary).map((child, i) =>
    withSlotDefaults(child, "secondary", size, `secondary-${i}`),
  )
  const primaryNode = withSlotDefaults(primary, "primary", size)

  const hasHierarchy = tertiary != null || secondaryNodes.length > 0 || primary != null
  const hasTrailing = iconActions != null || menu != null
  const showDivider = hasHierarchy && hasTrailing

  const overflow = menu != null ? (
    <DropdownMenu align="end">
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          appearance="secondary"
          size={ICON_SIZE[size]}
          aria-label={menuLabel}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  ) : null

  return (
    <div
      data-slot="action-group"
      className={cn("flex items-center gap-[var(--c3-style-spacing-8)]", className)}
      {...props}
    >
      {tertiaryNode}
      {secondaryNodes}
      {primaryNode}
      {showDivider ? (
        <Divider
          orientation="vertical"
          decorative
          className={cn(DIVIDER_HEIGHT[size], "mx-[var(--c3-style-spacing-2)]")}
        />
      ) : null}
      {iconActions}
      {overflow}
    </div>
  )
}

export { ActionGroup }
export type { ActionGroupProps, ActionGroupSize }
