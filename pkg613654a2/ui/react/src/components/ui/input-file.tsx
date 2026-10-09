import * as React from "react"
import { Upload } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Button } from "./button"

/**
 * c3 InputFile — soft Button (left) + filename area (right) inside a 1px border
 * frame. Clicking either side opens the native file picker.
 *
 * Filename area shows:
 *   0 files → placeholderText (default "Upload File")
 *   1 file  → the file's name
 *   2+      → "N files"
 *
 * Theming lives in input-file.scss; Button styling is delegated to Button.
 */

const filenameLayout = cva(
  [
    "flex min-w-0 flex-1 items-center",
    "font-sans text-c3-regular-body-p2 truncate text-left",
  ].join(" "),
  {
    variants: {
      size: { sm: "h-7", md: "h-8", lg: "h-9" },
    },
    defaultVariants: { size: "md" },
  }
)

type InputFileProps = Omit<React.ComponentProps<"input">, "size" | "type" | "defaultValue"> &
  VariantProps<typeof filenameLayout> & {
    buttonLabel?: string
    placeholderText?: string
    /**
     * Display-only seed for the filename area (e.g. when restoring a previously
     * uploaded list, or for visual stories). The browser does not allow us to
     * pre-fill <input type="file">, so this only drives the rendered label.
     */
    defaultFileNames?: string[]
  }

function InputFile({
  className,
  size = "md",
  buttonLabel = "Upload",
  placeholderText = "Upload file",
  disabled,
  onChange,
  multiple,
  defaultFileNames,
  ...props
}: InputFileProps) {
  const [fileNames, setFileNames] = React.useState<string[]>(
    defaultFileNames ?? [],
  )
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileNames(
      e.target.files ? Array.from(e.target.files).map((f) => f.name) : [],
    )
    onChange?.(e)
  }

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const label =
    fileNames.length === 0
      ? placeholderText
      : fileNames.length === 1
        ? fileNames[0]
        : `${fileNames.length} files uploaded`
  const hasFile = fileNames.length > 0

  return (
    <div
      data-slot="input-file"
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-border)]",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        disabled={disabled}
        multiple={multiple}
        onChange={handleChange}
        {...props}
      />
      <Button
        type="button"
        variant="soft"
        size={size ?? "md"}
        disabled={disabled}
        leadingIcon={<Upload />}
        onClick={openPicker}
        className="shrink-0 rounded-l-[var(--c3-style-border-radius-4)] rounded-r-none"
      >
        {buttonLabel}
      </Button>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          "cursor-pointer bg-[var(--c3-style-basic-bg-input)] px-[var(--c3-style-spacing-12)] text-[var(--c3-style-basic-fg-secondary)] disabled:cursor-not-allowed disabled:opacity-50",
          hasFile && "text-[var(--c3-style-basic-fg-primary)]",
          filenameLayout({ size }),
        )}
      >
        {label}
      </button>
    </div>
  )
}

export { InputFile }
