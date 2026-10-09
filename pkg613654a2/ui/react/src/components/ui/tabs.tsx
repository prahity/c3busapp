import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import "./tabs.scss"

/* =============================================================================
   c3 Tabs — wraps Radix `Tabs` with two visual variants:
     variant="boxed"    grey pill row, active tab is a raised white chip
     variant="bordered" baseline rule, active tab is underlined in accent

   Sizes (sm/md/lg) drive the trigger height & padding. Variant context is
   passed via TabsContext so triggers know which size + skin to render.

   Figma:
     - List & container: 16292-165001
     - Tab item state matrix: 408-8904
   ============================================================================= */

type TabsVariant = "boxed" | "bordered"
type TabsSize = "sm" | "md" | "lg"

type TabsContextValue = { variant: TabsVariant; size: TabsSize }
const TabsContext = React.createContext<TabsContextValue>({
  variant: "boxed",
  size: "md",
})

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: TabsVariant
  size?: TabsSize
}

function Tabs({
  className,
  variant = "boxed",
  size = "md",
  ...props
}: TabsProps) {
  return (
    <TabsContext.Provider value={{ variant, size }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        data-size={size}
        className={cn("tabs flex flex-col", className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = React.useContext(TabsContext)
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "tabs__list",
        `tabs__list--${variant}`,
        variant === "boxed"
          ? "inline-flex w-fit items-center"
          : "inline-flex w-full items-center border-b border-solid",
        className,
      )}
      {...props}
    />
  )
}

const SIZE_BOXED: Record<TabsSize, string> = {
  sm: "h-6 max-h-6 [&>svg]:size-4",
  md: "h-7 max-h-7 [&>svg]:size-4",
  lg: "h-9 max-h-9 [&>svg]:size-5",
}

const SIZE_BORDERED: Record<TabsSize, string> = {
  sm: "h-7 max-h-7 [&>svg]:size-4",
  md: "h-8 max-h-8 [&>svg]:size-4",
  lg: "h-10 max-h-10 [&>svg]:size-5",
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { variant, size } = React.useContext(TabsContext)
  const sizing = variant === "boxed" ? SIZE_BOXED[size] : SIZE_BORDERED[size]
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      data-size={size}
      className={cn(
        "tabs__trigger",
        `tabs__trigger--${variant}`,
        `tabs__trigger--size-${size}`,
        "relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-sans text-c3-regular-label-l2",
        "outline-hidden focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        sizing,
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("tabs__content outline-hidden", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabsVariant, TabsSize }
