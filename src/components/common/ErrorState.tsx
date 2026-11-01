import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-brand-text">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-brand-muted">{description}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
