import { useNavigate } from 'react-router-dom'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { usePageMeta } from '@/components/layout/PageMeta'
import {
  createApplicationFormSchema,
  type CreateApplicationFormValues,
  type ParsedCreateApplicationFormValues,
} from './applicationSchemas'
import { toCreateApplicationRequest } from './applicationMapper'
import {
  createApplicationErrorMessage,
  useCreateApplication,
} from './applicationService'
import { ApplicationStepper } from './components/ApplicationStepper'
import { StudentSelectionStep } from './components/StudentSelectionStep'
import { JobDetailsStep } from './components/JobDetailsStep'
import { DocumentsStep } from './components/DocumentsStep'
import { ApplicationQuestionsStep } from './components/ApplicationQuestionsStep'
import { ApplicationReviewSummary } from './components/ApplicationReviewSummary'
import {
  useCreateApplicationWizard,
  WIZARD_STEPS,
} from './hooks/useCreateApplicationWizard'
import { env } from '@/lib/env'

export function CreateApplicationPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const createMutation = useCreateApplication()

  usePageMeta({
    title: 'Create Application',
    description:
      'Add a new job application for one of your assigned students.',
  })

  const form = useForm<CreateApplicationFormValues>({
    resolver: zodResolver(createApplicationFormSchema),
    mode: 'onTouched',
    // Keep every field alive across step mounts so wizard navigation
    // never clears data from a step the user is not currently on.
    shouldUnregister: false,
    defaultValues: {
      studentId: '',
      companyName: '',
      jobTitle: '',
      jobLink: '',
      jobLocation: '',
      jobSourceOption: 'LinkedIn',
      jobSourceCustom: '',
      resumeObjectId: '',
      coverLetterObjectId: '',
      questions: [],
    },
  })

  const wizard = useCreateApplicationWizard({ form })
  const submitting =
    form.formState.isSubmitting || createMutation.isPending

  async function handleSubmit() {
    // Final cross-step validation before firing the POST.
    const ok = await form.trigger()
    if (!ok) return

    const values = form.getValues()
    const payload = toCreateApplicationRequest(
      values as unknown as ParsedCreateApplicationFormValues
    )

    try {
      const res = await createMutation.mutateAsync(payload)
      toast.success(
        'Application created successfully.',
        `Application ID: ${res.applicationId}`
      )
      form.reset()
      wizard.reset()
    } catch (err) {
      const info = createApplicationErrorMessage(err)
      toast.error(info.title, info.description)
      if (info.details?.length) {
        for (const d of info.details.slice(0, 4)) {
          toast.info('Validation detail', d)
        }
      }
      // Stay on the current step; form data is preserved by shouldUnregister:false.
    }
  }

  async function handlePrimary() {
    if (wizard.isLast) {
      await handleSubmit()
    } else {
      await wizard.next()
    }
  }

  return (
    <div className="max-w-4xl">
      <div ref={wizard.scrollAnchor} />
      <Card>
        <ApplicationStepper
          steps={WIZARD_STEPS as unknown as { key: string; label: string }[]}
          activeStep={wizard.activeStep}
          maxReached={wizard.maxReached}
          onStepClick={wizard.goTo}
        />

        <FormProvider {...form}>
          <form
            onSubmit={(e) => {
              // Prevent the browser's default form submission; the Next
              // button must not trigger a POST on intermediate steps.
              e.preventDefault()
              void handlePrimary()
            }}
            className="space-y-6 border-t border-brand-border px-6 py-6"
          >
            <StepContent step={wizard.activeStep} />

            {env.useMockApi && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Mock mode is on. The real backend is not being called.
              </p>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-brand-border pt-5">
              <div>
                {!wizard.isFirst && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={wizard.previous}
                    disabled={submitting}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(-1)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  aria-label={
                    wizard.isLast ? 'Submit Application' : 'Next step'
                  }
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : wizard.isLast ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {submitting
                    ? wizard.isLast
                      ? 'Creating…'
                      : 'Validating…'
                    : wizard.isLast
                      ? 'Submit Application'
                      : 'Next'}
                </Button>
              </div>
            </div>
          </form>
        </FormProvider>
      </Card>
    </div>
  )
}

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 0:
      return <StudentSelectionStep />
    case 1:
      return <JobDetailsStep />
    case 2:
      return <DocumentsStep />
    case 3:
    default:
      return (
        <div className="space-y-5">
          <ApplicationQuestionsStep />
          <ApplicationReviewSummary />
        </div>
      )
  }
}
