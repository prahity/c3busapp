import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import "./input.scss"

/**
 * c3 InputText — verified against Figma node 43439-7640.
 *
 * Prop vocabulary (canonical for the c3 system):
 *   size:        "sm" | "md" | "lg" — default "md".
 *   appearance:  "default" | "success" | "danger" — semantic palette swatch.
 *                Interaction states (hover, focus, disabled) are CSS-driven
 *                via :hover / :focus-within / [disabled], not props.
 *   leftIcon, rightIcon: ReactNode slots for inline 16px icons.
 *
 * Theming (bg, border per appearance, focus ring, disabled opacity) lives in
 * input.scss — see references/scss-bem-convention.md.
 */

type InputAppearance = "default" | "success" | "danger"

const inputLayout = cva(
  [
    "flex w-full items-center",
    "font-sans text-c3-regular-body-p2",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "input--size-sm",
        md: "input--size-md",
        lg: "input--size-lg",
      },
    },
    defaultVariants: { size: "md" },
  }
)

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputLayout> & {
    appearance?: InputAppearance
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
  }

function Input({
  className,
  size,
  appearance,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}: InputProps) {
  const resolvedAppearance: InputAppearance = appearance ?? "default"
  return (
    <div
      data-slot="input"
      data-appearance={resolvedAppearance}
      data-size={size ?? "md"}
      className={cn(
        "input",
        `input--appearance-${resolvedAppearance}`,
        inputLayout({ size }),
        className,
      )}
    >
      {leftIcon != null && <span className="input__icon inline-flex shrink-0">{leftIcon}</span>}
      <input
        disabled={disabled}
        className={cn(
          "input__field",
          "min-w-0 flex-1",
        )}
        {...props}
      />
      {rightIcon != null && <span className="input__icon inline-flex shrink-0">{rightIcon}</span>}
    </div>
  )
}

// retained for any back-compat callers; only layout/size now
const inputWrapperVariants = inputLayout

export { Input, inputWrapperVariants }
export type { InputAppearance }
