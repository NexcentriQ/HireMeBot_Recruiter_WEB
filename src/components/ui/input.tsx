import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, startIcon, endIcon, ...props }, ref) => {
    if (startIcon || endIcon) {
      return (
        <div className="relative">
          {startIcon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted">
              {startIcon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              'flex h-10 w-full rounded-md border border-brand-border bg-white px-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
              startIcon ? 'pl-9' : undefined,
              endIcon ? 'pr-9' : undefined,
              className
            )}
            {...props}
          />
          {endIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted">
              {endIcon}
            </div>
          )}
        </div>
      )
    }
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-brand-border bg-white px-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
