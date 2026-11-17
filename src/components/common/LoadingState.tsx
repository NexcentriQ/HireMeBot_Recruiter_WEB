import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-10 text-sm text-brand-muted',
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
