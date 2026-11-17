import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Phone, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandLogo } from '@/components/common/BrandLogo'
import { ApiError } from '@/lib/apiClient'
import { env } from '@/lib/env'
import { useAuth } from '../AuthContext'
import { classifyAccountError, isAmbiguousRegistrationFailure } from '../accountErrors'
import { getSessionIdentity, type SessionIdentity } from '../cognitoAuth'
import { registerRecruiter } from '../recruiterService'
import { loadDraft, saveDraft } from '../registrationDraft'
import {
  buildRegistrationPayload,
  isRegistrationField,
  registrationSchema,
  type RegistrationFormValues,
} from '../registrationSchema'

interface FormProblem {
  message: string
  requestId?: string
}

/** Only http(s) links are rendered: the value comes from build-time config. */
function safeTermsUrl(): string {
  const url = env.termsUrl.trim()
  const scheme = url.toLowerCase()
  return scheme.startsWith('https://') || scheme.startsWith('http://') ? url : ''
}

const REQUEST_PROBLEM =
  'We could not submit your registration because of a problem with the request. Please try again, or contact support if it continues.'

export function RegisterPage() {
  const { signOut, refreshAccount, handleAccountError, markRegistrationSubmitted } =
    useAuth()
  const [identity, setIdentity] = useState<SessionIdentity | null>(null)
  const [problem, setProblem] = useState<FormProblem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const termsUrl = safeTermsUrl()
  // Synchronous guard against double clicks, Enter-key repeats and Strict Mode.
  const submittingRef = useRef(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      phoneNumber: '',
      acceptedTerms: false,
    },
  })

  useEffect(() => {
    document.title = 'Register · HireMeBot Recruiter'
  }, [])

  // Who is signed in (for the read-only email) and the draft that belongs to
  // that Google account. A different account's draft is discarded by loadDraft.
  useEffect(() => {
    let cancelled = false
    getSessionIdentity()
      .then((who) => {
        if (cancelled || !who) return
        setIdentity(who)
        const draft = loadDraft(who.sub)
        if (draft) reset(draft)
      })
      .catch(() => {
        /* the email and draft are conveniences; the form still works */
      })
    return () => {
      cancelled = true
    }
  }, [reset])

  // Keep the draft (names, phone, Terms checkbox only) while the user types.
  useEffect(() => {
    if (!identity) return
    const subscription = watch((values) => {
      saveDraft(identity.sub, {
        firstName: values.firstName ?? '',
        lastName: values.lastName ?? '',
        phoneNumber: values.phoneNumber ?? '',
        acceptedTerms: values.acceptedTerms === true,
      })
    })
    return () => subscription.unsubscribe()
  }, [identity, watch])

  /** Re-ask the backend (never re-POST) and report what it says. */
  async function resolveByLookup(notYetMessage: string) {
    const result = await refreshAccount()
    if (!result.ok) {
      setProblem({
        message: `${result.failure.message} We could not confirm whether your registration was received.`,
        requestId: result.failure.requestId,
      })
    } else if (result.status === 'signup-required') {
      setProblem({ message: notYetMessage })
    }
    // Any other status already changed the app state; the route guard moves on.
  }

  async function handleFailure(error: unknown) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'VALIDATION_FAILED': {
          const unmatched: string[] = []
          for (const fe of error.fieldErrors ?? []) {
            if (isRegistrationField(fe.field)) {
              setError(fe.field, { type: 'server', message: fe.message })
            } else {
              unmatched.push(fe.message)
            }
          }
          if (unmatched.length > 0 || !error.fieldErrors?.length) {
            setProblem({
              message: unmatched[0] ?? 'Please check your details and try again.',
              requestId: error.requestId,
            })
          }
          return
        }
        case 'INVALID_REQUEST':
        case 'PAYLOAD_TOO_LARGE':
        case 'UNSUPPORTED_MEDIA_TYPE':
          setProblem({ message: REQUEST_PROBLEM, requestId: error.requestId })
          return
        case 'NAME_ALREADY_REGISTERED':
          // The server's own message; never retried or worked around.
          setProblem({ message: error.message, requestId: error.requestId })
          return
        case 'ACCOUNT_ALREADY_REGISTERED':
          // A double submit, or a retry after a lost 201: the lookup decides.
          await resolveByLookup('Your registration was not found. Please submit it again.')
          return
      }
    }

    // Ended session, restricted account, wrong account type, unverified email...
    if (classifyAccountError(error).kind !== 'transient') {
      handleAccountError(error)
      return
    }

    // No response, 5xx or a malformed 201: the POST may have created the
    // account. Resolve it with a lookup instead of blindly POSTing again.
    if (isAmbiguousRegistrationFailure(error)) {
      await resolveByLookup('Your registration was not received. Please try again.')
      return
    }

    // Any other definitive rejection (for example a 4xx code this client does
    // not know): the account was not created, so the form stays as it is.
    setProblem({
      message: 'We could not submit your registration. Please try again.',
      requestId: error instanceof ApiError ? error.requestId : undefined,
    })
  }

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setProblem(null)
    try {
      await registerRecruiter(buildRegistrationPayload(values))
      // 201 APPROVAL_PENDING: the guard now moves to the pending screen.
      markRegistrationSubmitted()
    } catch (error) {
      await handleFailure(error)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-10">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-brand-border bg-white p-8 shadow-sm md:p-10">
        <BrandLogo />

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold text-brand-text">
            Complete your recruiter registration
          </h1>
          <p className="text-sm text-brand-muted">
            Tell us a little about you. Your account will be reviewed and approved
            before you can use the portal.
          </p>
          {identity?.email && (
            <p className="text-sm text-brand-muted">
              Signed in with Google as{' '}
              <span className="font-medium text-brand-text">{identity.email}</span>.{' '}
              <button
                type="button"
                className="text-brand-blue underline-offset-4 hover:underline"
                onClick={() => void signOut()}
              >
                Use a different account
              </button>
            </p>
          )}
        </div>

        {problem && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {problem.message}
            {problem.requestId && (
              <span className="mt-1 block text-xs text-red-600/80">
                Reference: {problem.requestId}
              </span>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" required>
                First name
              </Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                startIcon={<User className="h-4 w-4" />}
                disabled={isSubmitting}
                aria-invalid={!!errors.firstName}
                {...register('firstName')}
              />
              {errors.firstName && (
                <p className="text-xs text-red-600">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lastName" required>
                Last name
              </Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                startIcon={<User className="h-4 w-4" />}
                disabled={isSubmitting}
                aria-invalid={!!errors.lastName}
                {...register('lastName')}
              />
              {errors.lastName && (
                <p className="text-xs text-red-600">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber" required>
              Phone number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              autoComplete="tel"
              placeholder="+17135550101"
              startIcon={<Phone className="h-4 w-4" />}
              disabled={isSubmitting}
              aria-invalid={!!errors.phoneNumber}
              {...register('phoneNumber')}
            />
            {errors.phoneNumber ? (
              <p className="text-xs text-red-600">{errors.phoneNumber.message}</p>
            ) : (
              <p className="text-xs text-brand-muted">
                Include the country code, for example +17135550101.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5">
              <input
                id="acceptedTerms"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-brand-border accent-brand-blue"
                disabled={isSubmitting}
                aria-invalid={!!errors.acceptedTerms}
                {...register('acceptedTerms')}
              />
              <Label htmlFor="acceptedTerms" className="font-normal leading-snug">
                I agree to the HireMeBot{' '}
                {termsUrl ? (
                  <a
                    href={termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue underline-offset-4 hover:underline"
                  >
                    Terms and Conditions
                  </a>
                ) : (
                  'Terms and Conditions'
                )}
                <span className="ml-0.5 text-red-500">*</span>
              </Label>
            </div>
            {errors.acceptedTerms && (
              <p className="text-xs text-red-600">{errors.acceptedTerms.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit registration'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
