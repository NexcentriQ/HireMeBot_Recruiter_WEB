import * as React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  title: string
  description?: string
  kind: ToastKind
}

interface ToastContextValue {
  toast: (opts: Omit<ToastItem, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const toast = React.useCallback(
    (opts: Omit<ToastItem, 'id'>) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setItems((xs) => [...xs, { id, ...opts }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) =>
        toast({ title, description, kind: 'success' }),
      error: (title, description) =>
        toast({ title, description, kind: 'error' }),
      info: (title, description) =>
        toast({ title, description, kind: 'info' }),
    }),
    [toast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({
  item,
  onClose,
}: {
  item: ToastItem
  onClose: () => void
}) {
  const Icon =
    item.kind === 'success'
      ? CheckCircle2
      : item.kind === 'error'
        ? AlertCircle
        : Info
  const iconColor =
    item.kind === 'success'
      ? 'text-green-600'
      : item.kind === 'error'
        ? 'text-red-600'
        : 'text-brand-blue'

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg border border-brand-border bg-white p-4 shadow-lg',
        'animate-in slide-in-from-right-4 fade-in'
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
      <div className="flex-1">
        <p className="text-sm font-semibold text-brand-text">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-sm text-brand-muted">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-brand-muted transition-colors hover:text-brand-text"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
