import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import "./input-number.scss"

/**
 * c3 InputNumber — composite of two ghost icon Buttons + an <Input> numeric
 * field inside a bordered frame. The frame owns the visible border +
 * appearance styling; the inner <Input> contributes text + placeholder color
 * from the shared Input token cascade.
 */

type InputNumberSize = "sm" | "md" | "lg"
type InputNumberAppearance = "default" | "success" | "danger"

const FRAME_HEIGHT: Record<InputNumberSize, string> = {
  sm: "h-7",
  md: "h-8",
  lg: "h-9",
}

const BUTTON_SIZE: Record<InputNumberSize, "icon-sm" | "icon-md" | "icon-lg"> = {
  sm: "icon-sm",
  md: "icon-md",
  lg: "icon-lg",
}

type InputNumberProps = Omit<React.ComponentProps<"input">, "size" | "type"> & {
  size?: InputNumberSize
  appearance?: InputNumberAppearance
  incrementButtons?: boolean
  onIncrement?: () => void
  onDecrement?: () => void
}

function InputNumber({
  className,
  size = "md",
  appearance,
  incrementButtons = true,
  onIncrement,
  onDecrement,
  disabled,
  defaultValue,
  value,
  onChange,
  placeholder = "0",
  ...props
}: InputNumberProps) {
  const resolvedAppearance: InputNumberAppearance = appearance ?? "default"

  const [internal, setInternal] = React.useState<string>(
    defaultValue !== undefined ? String(defaultValue) : "",
  )
  const current = value !== undefined ? String(value) : internal

  const emit = (next: string) => {
    if (value === undefined) setInternal(next)
    onChange?.({
      target: { value: next },
      currentTarget: { value: next },
    } as unknown as React.ChangeEvent<HTMLInputElement>)
  }

  const step = (delta: number) => {
    const n = Number(current || 0) || 0
    emit(String(n + delta))
  }

  return (
    <div
      data-slot="input-number"
      data-appearance={resolvedAppearance}
      data-size={size}
      className={cn(
        "input-number",
        `input-number--appearance-${resolvedAppearance}`,
        "flex w-full items-stretch overflow-hidden",
        FRAME_HEIGHT[size],
        className,
      )}
    >
      {incrementButtons && (
        <Button
          variant="ghost"
          appearance="secondary"
          size={BUTTON_SIZE[size]}
          aria-label="Decrease"
          onClick={() => (onDecrement ? onDecrement() : step(-1))}
          disabled={disabled}
          className="input-number__stepper"
        >
          <Minus />
        </Button>
      )}
      <Input
        size={size}
        appearance="default"
        type="number"
        inputMode="numeric"
        disabled={disabled}
        value={current}
        onChange={(e) => emit(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "input-number__field",
          "min-w-0 flex-1 text-center",
          "[&_input]:text-center [&_input]:[appearance:textfield]",
          "[&_input::-webkit-outer-spin-button]:appearance-none [&_input::-webkit-inner-spin-button]:appearance-none",
        )}
        {...props}
      />
      {incrementButtons && (
        <Button
          variant="ghost"
          appearance="secondary"
          size={BUTTON_SIZE[size]}
          aria-label="Increase"
          onClick={() => (onIncrement ? onIncrement() : step(1))}
          disabled={disabled}
          className="input-number__stepper"
        >
          <Plus />
        </Button>
      )}
    </div>
  )
}

export { InputNumber }
export type { InputNumberAppearance }
