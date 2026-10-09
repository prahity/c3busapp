import * as React from "react"
import { cn } from "@/lib/utils"
import "./textarea.scss"

/**
 * c3 Textarea — verified against Figma node 3928-2374.
 *
 * Multi-line text input. Same `appearance` model as <Input> but no `size`
 * prop (single padding scheme: 12 inline / 8 block). Text uses P2 *regular*
 * (vs Input's P2 *bold*). All 3 appearances (default/success/danger) support
 * the same interaction states (hover, focus, disabled) via CSS pseudo classes
 * — see textarea.scss. Resize is height-only (`resize-y`).
 *
 * Theming (bg, border per appearance, focus ring, disabled) lives in
 * textarea.scss.
 */

type TextareaAppearance = "default" | "success" | "danger"

type TextareaProps = React.ComponentProps<"textarea"> & {
  appearance?: TextareaAppearance
}

function Textarea({ className, appearance, ...props }: TextareaProps) {
  const resolvedAppearance: TextareaAppearance = appearance ?? "default"
  return (
    <textarea
      data-slot="textarea"
      data-appearance={resolvedAppearance}
      className={cn(
        "textarea",
        `textarea--appearance-${resolvedAppearance}`,
        "flex w-full",
        "font-sans text-c3-regular-body-p2",
        "min-h-[60px] resize-y",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaAppearance }
