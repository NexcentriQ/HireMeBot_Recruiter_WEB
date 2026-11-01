import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StepDescriptor {
  key: string
  label: string
}

interface ApplicationStepperProps {
  steps: StepDescriptor[]
  /** Zero-based active step. */
  activeStep: number
  /**
   * Highest step the user has reached so far. The user can jump freely to any
   * step `<= maxReached`, but cannot skip forward past it.
   */
  maxReached: number
  onStepClick: (index: number) => void
}

export function ApplicationStepper({
  steps,
  activeStep,
  maxReached,
  onStepClick,
}: ApplicationStepperProps) {
  return (
    <nav
      aria-label="Create application progress"
      className="px-6 pb-6 pt-5"
    >
      <ol className="flex items-start gap-0">
        {steps.map((step, i) => {
          const isCompleted = i < activeStep
          const isActive = i === activeStep
          const isReachable = i <= maxReached
          const indicator = isCompleted ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          ) : (
            <span className="text-sm font-semibold">{i + 1}</span>
          )

          const circleClass = cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            isCompleted && 'border-brand-blue bg-brand-blue text-white',
            isActive && 'border-brand-blue bg-brand-blue text-white shadow-sm',
            !isCompleted &&
              !isActive &&
              'border-brand-border bg-white text-brand-muted'
          )

          return (
            <li
              key={step.key}
              className={cn(
                'flex flex-1 items-center gap-3 last:flex-none',
                i === 0 ? 'min-w-0' : 'min-w-0'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => isReachable && onStepClick(i)}
                  disabled={!isReachable}
                  className={cn(
                    circleClass,
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2',
                    isReachable
                      ? 'cursor-pointer hover:ring-2 hover:ring-brand-blue/20'
                      : 'cursor-not-allowed opacity-70'
                  )}
                  aria-label={`Step ${i + 1}: ${step.label}`}
                >
                  {indicator}
                </button>
                <span
                  className={cn(
                    'text-xs font-medium transition-colors',
                    isActive && 'text-brand-text',
                    isCompleted && 'text-brand-text',
                    !isActive && !isCompleted && 'text-brand-muted'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {i < steps.length - 1 && (
                <div
                  aria-hidden
                  className={cn(
                    'mx-1 mt-[18px] h-0.5 flex-1 rounded-full transition-colors',
                    i < activeStep ? 'bg-brand-blue' : 'bg-brand-border'
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
