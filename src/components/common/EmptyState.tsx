import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-brand-border bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-brand-text">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-brand-muted">{description}</p>
      )}
      {action}
    </div>
  )
}
