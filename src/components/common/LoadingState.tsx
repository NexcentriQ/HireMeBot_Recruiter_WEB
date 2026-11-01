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

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-4 w-full animate-pulse rounded bg-slate-200', className)}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-xl border border-brand-border bg-white p-6">
      <SkeletonLine className="h-5 w-1/3" />
      <SkeletonLine className="h-8 w-2/3" />
      <SkeletonLine className="h-3 w-1/2" />
    </div>
  )
}
