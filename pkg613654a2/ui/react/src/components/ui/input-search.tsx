import * as React from "react"
import { Search, X } from "lucide-react"
import { Input } from "./input"

/**
 * c3 InputSearch — verified against Figma node 43547-5166.
 *
 * A specialization of <Input> with a baked-in left Search icon and an optional
 * Clear (X) button that appears when the field has a value. Same size/state
 * API as <Input>. Filled state colors match Figma (placeholder uses fg-secondary,
 * value uses fg-primary).
 */

type InputSearchProps = Omit<React.ComponentProps<typeof Input>, "leftIcon" | "rightIcon"> & {
  /** Render a clear button on the right when there's a value. Default true. */
  showClear?: boolean
  /** Called when the user clicks the clear button. */
  onClear?: () => void
}

function InputSearch({
  value,
  defaultValue,
  showClear = true,
  onClear,
  placeholder = "Search",
  ...props
}: InputSearchProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? "")
  const current = value !== undefined ? value : internal
  const hasValue = String(current ?? "").length > 0

  const handleClear = () => {
    setInternal("")
    onClear?.()
  }

  return (
    <Input
      {...props}
      placeholder={placeholder}
      value={current}
      onChange={(e) => {
        if (value === undefined) setInternal(e.target.value)
        props.onChange?.(e)
      }}
      leftIcon={<Search />}
      rightIcon={
        showClear && hasValue ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={handleClear}
            className="inline-flex shrink-0 items-center justify-center text-[var(--c3-style-basic-fg-secondary)] transition-colors hover:text-[var(--c3-style-basic-fg-primary)] focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        ) : undefined
      }
    />
  )
}

export { InputSearch }
