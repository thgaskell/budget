import './LoadingButton.css'

interface LoadingButtonProps {
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  variant?: 'primary' | 'danger' | 'secondary'
  type?: 'button' | 'submit'
  className?: string
}

/**
 * A reusable button component that shows a loading spinner during async operations.
 * Prevents double-clicks when loading and maintains button size during state transitions.
 */
export function LoadingButton({
  children,
  loading = false,
  disabled = false,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      className={`loading-button loading-button--${variant} ${loading ? 'loading-button--loading' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading && <span className="loading-button__spinner" />}
      <span className={loading ? 'loading-button__text--hidden' : ''}>
        {children}
      </span>
    </button>
  )
}
