import * as React from "react"
import { cn } from "@/lib/utils"
import "./input-frame.scss"

/**
 * c3 InputFrame — verified against Figma node 414-12784.
 *
 * Layout wrapper: top label row, body (one or many inputs), helper row.
 * Appearance (default/success/danger) recolors ALL four label slots. Disabled
 * fades the whole frame. Children get an 8px gap between siblings via the
 * .input-frame__body wrapper, vertical or horizontal per `direction`.
 *
 * Theming lives in input-frame.scss.
 */

type InputFrameAppearance = "default" | "success" | "danger"
type InputFrameDirection = "vertical" | "horizontal"

type InputFrameProps = React.ComponentProps<"div"> & {
  label?: React.ReactNode
  /** Right-side text on the top row (e.g. "Required"). */
  required?: React.ReactNode
  /** Helper text under the input. */
  helperText?: React.ReactNode
  /** Right-side text on the bottom row (e.g. "0/3"). */
  counter?: React.ReactNode
  appearance?: InputFrameAppearance
  disabled?: boolean
  /** Direction sibling inputs stack when more than one is passed. */
  direction?: InputFrameDirection
  children?: React.ReactNode
}

function InputFrame({
  className,
  label,
  required,
  helperText,
  counter,
  appearance = "default",
  disabled = false,
  direction = "vertical",
  children,
  ...props
}: InputFrameProps) {
  const showTop = label != null || required != null
  const showBottom = helperText != null || counter != null

  return (
    <div
      data-slot="input-frame"
      data-appearance={appearance}
      data-direction={direction}
      data-disabled={disabled || undefined}
      className={cn(
        "input-frame",
        `input-frame--appearance-${appearance}`,
        disabled && "input-frame--disabled",
        "flex w-72 flex-col items-start",
        className,
      )}
      {...props}
    >
      {showTop && (
        <div className={cn(
          "input-frame__label",
          "flex w-full items-center justify-between",
          "font-sans text-c3-regular-label-l2",
        )}>
          {label != null ? <span className="flex-1 truncate">{label}</span> : <span />}
          {required != null && (
            <span className="input-frame__required text-c3-regular-label-l3">
              {required}
            </span>
          )}
        </div>
      )}

      <div
        className={cn(
          "input-frame__body",
          `input-frame__body--direction-${direction}`,
        )}
      >
        {children}
      </div>

      {showBottom && (
        <div className={cn(
          "input-frame__helper",
          "flex w-full items-center justify-between",
          "font-sans text-c3-regular-body-p3",
        )}>
          {helperText != null ? <span className="flex-1 truncate">{helperText}</span> : <span />}
          {counter != null && <span className="input-frame__counter">{counter}</span>}
        </div>
      )}
    </div>
  )
}

export { InputFrame }
export type { InputFrameAppearance, InputFrameDirection }
