import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { Check, X } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import "./switch.scss"

/**
 * c3 Switch — verified against Figma node 3853-15460.
 *
 * Theming (track colors, focus ring, thumb fill, icon color) lives in
 * switch.scss — see references/scss-bem-convention.md. Tailwind here owns
 * layout, sizing, and thumb travel only.
 *
 * Sizes (track w × h, thumb):
 *   sm: 32 × 18, thumb 14
 *   md: 40 × 22, thumb 18
 *   lg: 48 × 26, thumb 22
 */

const switchLayout = cva(
  [
    "peer group/switch inline-flex shrink-0 items-center",
    "outline-none",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-[18px] w-8",
        md: "h-[22px] w-10",
        lg: "h-[26px] w-12",
      },
    },
    defaultVariants: { size: "md" },
  }
)

const thumbLayout = cva(
  [
    "block",
    "data-[state=unchecked]:translate-x-0",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "size-[14px]",
        md: "size-[18px]",
        lg: "size-[22px]",
      },
      style: {
        solid: "",
        outline: "",
      },
    },
    compoundVariants: [
      // Travel = track_w − thumb_w − 2×padding (− 2×border for outline)
      { size: "sm", style: "solid", class: "data-[state=checked]:translate-x-[14px]" },
      { size: "md", style: "solid", class: "data-[state=checked]:translate-x-[18px]" },
      { size: "lg", style: "solid", class: "data-[state=checked]:translate-x-[22px]" },
      { size: "sm", style: "outline", class: "data-[state=checked]:translate-x-[12px]" },
      { size: "md", style: "outline", class: "data-[state=checked]:translate-x-[16px]" },
      { size: "lg", style: "outline", class: "data-[state=checked]:translate-x-[20px]" },
    ],
    defaultVariants: { size: "md", style: "solid" },
  }
)

const iconLayout = cva("", {
  variants: {
    size: {
      sm: "size-2",
      md: "size-3",
      lg: "size-4",
    },
  },
  defaultVariants: { size: "md" },
})

type SwitchStyle = "solid" | "outline"
type SwitchSize = "sm" | "md" | "lg"

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchLayout> & {
    style?: SwitchStyle
    withIcon?: boolean
  }

function Switch({ className, size, style, withIcon = false, ...props }: SwitchProps) {
  const resolvedSize: SwitchSize = size ?? "md"
  const resolvedStyle: SwitchStyle = style ?? "solid"
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={resolvedSize}
      data-style={resolvedStyle}
      className={cn(
        "switch",
        `switch--${resolvedStyle}`,
        switchLayout({ size: resolvedSize }),
        className,
      )}
      {...props}
    >
      {withIcon && (
        <>
          <Check
            aria-hidden
            data-slot="switch-icon"
            className={cn("switch__icon switch__icon--check left-1", "group-data-[state=unchecked]/switch:hidden", iconLayout({ size: resolvedSize }))}
          />
          <X
            aria-hidden
            data-slot="switch-icon"
            className={cn("switch__icon switch__icon--x right-1", "group-data-[state=checked]/switch:hidden", iconLayout({ size: resolvedSize }))}
          />
        </>
      )}
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn("switch__thumb", thumbLayout({ size: resolvedSize, style: resolvedStyle }))}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
