import { useEffect, useRef, useCallback } from 'react'
import './ConfirmationDialog.css'

interface ConfirmationDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A reusable confirmation dialog component that replaces browser confirm() calls.
 * Provides accessible modal behavior with focus trapping and keyboard navigation.
 */
export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Handle Escape key to cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }

      // Focus trap: Tab key cycles between cancel and confirm buttons
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          // Shift+Tab: if on first element, move to last
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          // Tab: if on last element, move to first
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }
    },
    [onCancel]
  )

  // Set up keyboard event listener and focus management
  useEffect(() => {
    if (isOpen) {
      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown)

      // Auto-focus the confirm button when dialog opens
      confirmButtonRef.current?.focus()

      // Store the previously focused element to restore later
      const previouslyFocused = document.activeElement as HTMLElement | null

      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        // Restore focus when dialog closes
        previouslyFocused?.focus()
      }
    }
  }, [isOpen, handleKeyDown])

  // Handle backdrop click to cancel
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  if (!isOpen) {
    return null
  }

  const titleId = 'confirmation-dialog-title'
  const messageId = 'confirmation-dialog-message'

  return (
    <div className="confirmation-dialog__backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className="confirmation-dialog__title">
          {title}
        </h2>
        <p id={messageId} className="confirmation-dialog__message">
          {message}
        </p>
        <div className="confirmation-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirmation-dialog__button confirmation-dialog__button--cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`confirmation-dialog__button confirmation-dialog__button--confirm confirmation-dialog__button--${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
