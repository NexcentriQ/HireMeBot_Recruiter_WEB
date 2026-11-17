import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ClipboardList, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/common/BrandLogo'
import { GoogleIcon } from '@/components/common/GoogleIcon'
import { LoadingState } from '@/components/common/LoadingState'
import { useAuth } from '../AuthContext'
import { routeForStatus } from '../authRoutes'
import { takeSessionNotice } from '../sessionNotice'
import { AccountErrorScreen } from '../components/AccountErrorScreen'
import { cognitoIsConfigured, env, isDevRecruiterMode } from '@/lib/env'
import { useToast } from '@/components/ui/toast'

export function LoginPage() {
  const { signInWithGoogle, status } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: a double click must not start two redirects before the
  // first render has disabled the button.
  const startedRef = useRef(false)
  const [notice, setNotice] = useState<string | null>(null)
  const toast = useToast()
  const canSignIn =
    env.useMockApi || isDevRecruiterMode() || cognitoIsConfigured()
  const devMode = isDevRecruiterMode()

  useEffect(() => {
    document.title = 'Sign in · HireMeBot Recruiter'
  }, [])

  // Why the user is back here (expired session, non-Google account, ...).
  useEffect(() => {
    const text = takeSessionNotice()
    if (text) setNotice(text)
  }, [])

  // Coming back from the Cognito Hosted UI through the browser's back button
  // restores this page from the bfcache with the button still disabled.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        startedRef.current = false
        setSubmitting(false)
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <LoadingState label="Checking your account…" />
      </div>
    )
  }

  if (status === 'error') return <AccountErrorScreen />

  // Signed in already: go wherever the backend says this account belongs.
  if (status !== 'unauthenticated') {
    return <Navigate to={routeForStatus(status) ?? '/login'} replace />
  }

  async function handleSignIn() {
    if (startedRef.current) return
    if (!canSignIn) {
      toast.error(
        'Authentication not configured',
        'Set the VITE_COGNITO_* environment variables or enable VITE_USE_MOCK_API.'
      )
      return
    }
    startedRef.current = true
    setSubmitting(true)
    try {
      await signInWithGoogle()
      // On success the browser is already leaving for Google; keep the button
      // disabled so it cannot be clicked twice.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.'
      toast.error('Could not start sign-in', message)
      startedRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 py-10">
        <div className="grid w-full gap-6 overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm lg:grid-cols-2">
          {/* Left — brand pitch */}
          <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-100 p-10">
            <BrandLogo />
            <div className="relative z-10 max-w-md space-y-4">
              <h2 className="text-3xl font-bold leading-tight text-brand-text md:text-4xl">
                Manage Student Applications Easily
              </h2>
              <p className="text-base text-brand-muted">
                Create and track job applications for your assigned students.
              </p>
              <div className="pt-6">
                <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-blue-100">
                  <ClipboardList className="h-20 w-20 text-brand-blue" />
                </div>
              </div>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl"
            />
          </div>

          {/* Right — sign in */}
          <div className="flex flex-col items-center justify-center gap-8 p-10 md:p-16">
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-brand-text">
                Welcome to
              </h1>
              <h2 className="text-3xl font-bold text-brand-blue">HireMeBot</h2>
              <p className="mt-2 text-sm text-brand-muted">Recruiter Portal</p>
            </div>

            {notice && (
              <p
                role="status"
                className="w-full max-w-sm rounded-md bg-blue-50 px-3 py-2 text-center text-sm text-brand-blue"
              >
                {notice}
              </p>
            )}

            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full max-w-sm gap-3 text-base font-medium"
              onClick={handleSignIn}
              disabled={submitting}
            >
              <GoogleIcon className="h-5 w-5" />
              Continue with Google
            </Button>

            <p className="flex max-w-sm items-start gap-2 text-xs text-brand-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              New recruiters register after signing in. Access to the portal
              begins once your account is approved.
            </p>

            {env.useMockApi && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Demo Mode — using in-memory mock data.
              </p>
            )}
            {!env.useMockApi && devMode && (
              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-brand-blue">
                Dev integration mode — real backend via X-Dev-Recruiter-Id={' '}
                {env.devRecruiterId}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
