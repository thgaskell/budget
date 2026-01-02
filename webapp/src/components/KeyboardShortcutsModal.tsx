import { useEffect, useRef } from 'react'
import './KeyboardShortcutsModal.css'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'n', description: 'New transaction' },
  { key: 't', description: 'Go to current month (today)' },
  { key: '←', description: 'Previous month' },
  { key: '→', description: 'Next month' },
  { key: 'Esc', description: 'Close modal / Cancel' },
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap and close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    modalRef.current?.focus()

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="keyboard-shortcuts-overlay" onClick={onClose}>
      <div
        className="keyboard-shortcuts-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <div className="keyboard-shortcuts-header">
          <h2 id="keyboard-shortcuts-title">Keyboard Shortcuts</h2>
          <button
            className="keyboard-shortcuts-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="keyboard-shortcuts-content">
          <table className="keyboard-shortcuts-table">
            <tbody>
              {shortcuts.map(({ key, description }) => (
                <tr key={key}>
                  <td className="keyboard-shortcuts-key">
                    <kbd>{key}</kbd>
                  </td>
                  <td className="keyboard-shortcuts-description">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="keyboard-shortcuts-footer">
          <span className="keyboard-shortcuts-hint">
            Press <kbd>?</kbd> anytime to show this help
          </span>
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcutsModal
