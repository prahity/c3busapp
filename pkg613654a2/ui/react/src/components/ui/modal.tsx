import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Divider } from "./divider"
import "./modal.scss"

/* =============================================================================
   c3 Modal — wraps Radix `Dialog` for blocking confirmations / forms.

   Two axes that match Figma node 43813-26116:
     contentWidth:  "contained" | "full"
       - contained: 24px padding wraps the whole modal (header, body, footer)
       - full:      24px padding only on header/footer; body goes edge-to-edge
     footer:        "default" | "fixed"
       - default:   body flows, footer has no separator
       - fixed:     header has a bottom rule, footer has a top rule

   Composition mirrors the Figma anatomy: ModalHeader (title + subtitle + close),
   ModalBody (the container slot), ModalFooter (action row with optional Tertiary
   pinned left + Primary/Secondary group on the right).
   ============================================================================= */

type ContentWidth = "contained" | "full"
type FooterMode = "default" | "fixed"

type ModalContextValue = { contentWidth: ContentWidth; footerMode: FooterMode }
const ModalContext = React.createContext<ModalContextValue>({
  contentWidth: "contained",
  footerMode: "default",
})

function Modal(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="modal" {...props} />
}

function ModalTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="modal-trigger" {...props} />
}

function ModalPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="modal-portal" {...props} />
}

function ModalClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="modal-close" {...props} />
}

function ModalOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="modal-overlay"
      className={cn(
        "modal__overlay",
        "fixed inset-0 z-50",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

type ModalContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  contentWidth?: ContentWidth
  footerMode?: FooterMode
  /** Pixel width of the card (default 500). */
  width?: number | string
}

function ModalContent({
  className,
  contentWidth = "contained",
  footerMode = "default",
  width = 500,
  children,
  ...props
}: ModalContentProps) {
  return (
    <ModalPortal>
      <ModalOverlay />
      <DialogPrimitive.Content
        data-slot="modal-content"
        data-content-width={contentWidth}
        data-footer-mode={footerMode}
        style={{ width, ...(props.style ?? {}) }}
        className={cn(
          "modal__content",
          `modal__content--${contentWidth}`,
          `modal__content--footer-${footerMode}`,
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "flex flex-col overflow-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        <ModalContext.Provider value={{ contentWidth, footerMode }}>
          {children}
        </ModalContext.Provider>
      </DialogPrimitive.Content>
    </ModalPortal>
  )
}

type ModalHeaderProps = React.ComponentProps<"div"> & {
  /** Hide the default close (X) button in the top-right. */
  hideClose?: boolean
}

function ModalHeader({
  className,
  hideClose = false,
  children,
  ...props
}: ModalHeaderProps) {
  const { contentWidth, footerMode } = React.useContext(ModalContext)
  const fixed = footerMode === "fixed"
  return (
    <div
      data-slot="modal-header"
      className={cn(
        "modal__header",
        `modal__header--footer-${footerMode}`,
        fixed && "flex w-full flex-col",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "modal__header-row flex w-full items-start",
          (contentWidth === "full" || fixed) && "modal__header-row--padded",
        )}
      >
        <div className="modal__header-text flex min-w-0 flex-1 flex-col">
          {children}
        </div>
        {!hideClose && (
          <ModalClose asChild>
            <Button
              variant="ghost"
              appearance="secondary"
              size="icon-sm"
              aria-label="Close"
              className="modal__header-close"
            >
              <X />
            </Button>
          </ModalClose>
        )}
      </div>
      {fixed && <Divider decorative className="modal__header-divider" />}
    </div>
  )
}

function ModalTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="modal-title"
      className={cn(
        "modal__title text-c3-regular-heading-h4 font-medium",
        className,
      )}
      {...props}
    />
  )
}

function ModalSubtitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="modal-subtitle"
      className={cn(
        "modal__subtitle text-c3-regular-body-p2",
        className,
      )}
      {...props}
    />
  )
}

function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  const { contentWidth, footerMode } = React.useContext(ModalContext)
  return (
    <div
      data-slot="modal-body"
      className={cn(
        "modal__body min-w-0 flex-1",
        footerMode === "fixed" && "modal__body--footer-fixed",
        footerMode === "fixed" && contentWidth === "contained" && "modal__body--footer-fixed-contained",
        className,
      )}
      {...props}
    />
  )
}

function ModalFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  const { contentWidth, footerMode } = React.useContext(ModalContext)
  const fixed = footerMode === "fixed"
  return (
    <div
      data-slot="modal-footer"
      className={cn(
        "modal__footer",
        `modal__footer--footer-${footerMode}`,
        fixed && "flex w-full flex-col",
        className,
      )}
      {...props}
    >
      {fixed && <Divider decorative className="modal__footer-divider" />}
      <div
        className={cn(
          "modal__footer-row flex w-full items-center justify-end",
          (contentWidth === "full" || fixed) && "modal__footer-row--padded",
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Optional tertiary slot — sits at the far left of the footer row. */
function ModalFooterTertiary({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer-tertiary"
      className={cn("modal__footer-tertiary mr-auto", className)}
      {...props}
    />
  )
}

/**
 * Right-aligned action cluster — holds the primary + secondary buttons as a unit
 * (mirrors the Figma footer ActionGroup). Buttons inside share an 8px gap. One
 * primary plus any number of secondary buttons; no hard cap.
 */
function ModalFooterActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer-actions"
      className={cn("modal__footer-actions flex items-center", className)}
      {...props}
    />
  )
}

export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalPortal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalSubtitle,
  ModalBody,
  ModalFooter,
  ModalFooterTertiary,
  ModalFooterActions,
  // Exported so docs-only static previews (Storybook MDX) can supply
  // contentWidth/footerMode to Header/Body/Footer without a real, open
  // Dialog — see src/components/Storybook/ModalPreview.tsx.
  ModalContext,
}
export type { ContentWidth as ModalContentWidth, FooterMode as ModalFooterMode }
