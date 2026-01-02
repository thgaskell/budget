import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'
import { ToastContainer } from '../components/Toast'

// Public interface for adding toasts
export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number // ms, default 5000, 0 for manual dismiss
}

// Input for addToast - id is generated automatically
interface AddToastInput {
  type: Toast['type']
  message: string
  duration?: number
}

// Context value interface
interface ToastContextValue {
  addToast: (toast: AddToastInput) => string
  removeToast: (id: string) => void
  toasts: Toast[]
}

// Reducer actions
type ToastAction =
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }

// Reducer state
interface ToastState {
  toasts: Toast[]
}

// Generate unique ID
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Reducer function
function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
      }
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.payload),
      }
    default:
      return state
  }
}

// Initial state
const initialState: ToastState = {
  toasts: [],
}

// Create context with undefined default (will be provided by Provider)
const ToastContext = createContext<ToastContextValue | undefined>(undefined)

// Provider props
interface ToastProviderProps {
  children: ReactNode
}

// Toast Provider component
export function ToastProvider({ children }: ToastProviderProps) {
  const [state, dispatch] = useReducer(toastReducer, initialState)

  const addToast = useCallback((input: AddToastInput): string => {
    const id = generateId()
    const toast: Toast = {
      id,
      type: input.type,
      message: input.message,
      duration: input.duration,
    }
    dispatch({ type: 'ADD_TOAST', payload: toast })
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id })
  }, [])

  const value: ToastContextValue = {
    addToast,
    removeToast,
    toasts: state.toasts,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={state.toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

// Hook for consuming toast context
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
