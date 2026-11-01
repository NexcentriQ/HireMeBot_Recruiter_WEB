import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BrandLogo({
  className,
  variant = 'default',
}: {
  className?: string
  variant?: 'default' | 'sidebar'
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          variant === 'sidebar'
            ? 'bg-brand-blue text-white'
            : 'bg-brand-blue text-white'
        )}
      >
        <Bot className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <span
        className={cn(
          'text-lg font-bold',
          variant === 'sidebar' ? 'text-white' : 'text-brand-text'
        )}
      >
        HireMeBot
      </span>
    </div>
  )
}
