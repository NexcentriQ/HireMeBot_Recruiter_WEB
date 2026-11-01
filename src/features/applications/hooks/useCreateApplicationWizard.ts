import { useCallback, useRef, useState } from 'react'
import type { FieldPath, UseFormReturn } from 'react-hook-form'
import type { CreateApplicationFormValues } from '../applicationSchemas'

/**
 * Field names each step is responsible for. The wizard will only `trigger`
 * these when the user clicks Next, so a user never gets blocked by errors
 * from a different step they haven't visited yet.
 */
export const STEP_FIELDS: Record<
  number,
  FieldPath<CreateApplicationFormValues>[]
> = {
  0: ['studentId'],
  1: [
    'companyName',
    'jobTitle',
    'jobLink',
    'jobLocation',
    'jobSourceOption',
    'jobSourceCustom',
  ],
  2: ['resumeObjectId', 'coverLetterObjectId'],
  3: ['questions'],
}

export const WIZARD_STEPS = [
  { key: 'student', label: 'Student' },
  { key: 'job', label: 'Job Details' },
  { key: 'documents', label: 'Documents' },
  { key: 'questions', label: 'Questions & Submit' },
] as const

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key']

interface UseCreateApplicationWizardArgs {
  form: UseFormReturn<CreateApplicationFormValues>
  totalSteps?: number
}

export function useCreateApplicationWizard({
  form,
  totalSteps = WIZARD_STEPS.length,
}: UseCreateApplicationWizardArgs) {
  const [activeStep, setActiveStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const scrollAnchor = useRef<HTMLDivElement | null>(null)

  const scrollIntoView = useCallback(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= totalSteps) return
      if (nextIndex > maxReached) return
      setActiveStep(nextIndex)
      scrollIntoView()
    },
    [maxReached, scrollIntoView, totalSteps]
  )

  const next = useCallback(async () => {
    const fields = STEP_FIELDS[activeStep] ?? []
    // Validate only the fields this step owns.
    const ok = await form.trigger(fields, { shouldFocus: true })
    if (!ok) return false
    const nextIndex = Math.min(activeStep + 1, totalSteps - 1)
    setActiveStep(nextIndex)
    setMaxReached((m) => Math.max(m, nextIndex))
    scrollIntoView()
    return true
  }, [activeStep, form, scrollIntoView, totalSteps])

  const previous = useCallback(() => {
    if (activeStep === 0) return
    setActiveStep((s) => Math.max(0, s - 1))
    scrollIntoView()
  }, [activeStep, scrollIntoView])

  const isFirst = activeStep === 0
  const isLast = activeStep === totalSteps - 1

  return {
    activeStep,
    maxReached,
    isFirst,
    isLast,
    goTo,
    next,
    previous,
    scrollAnchor,
  }
}
