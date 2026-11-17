import * as React from 'react'
import { configureAuth } from '@/lib/apiClient'
import { getAuthMode, type AuthMode } from '@/lib/env'
import type { RecruiterProfile } from '@/types/domain'
import type {
  AccountFailure,
  AccountRestriction,
  ActiveRecruiterUser,
  RecruiterAccountLookup,
} from '@/types/recruiterAuth'
import { classifyAccountError } from './accountErrors'
import {
  continueWithGoogle,
  getAccessToken,
  getRecordedOAuthFailure,
  getSessionIdentity,
  signOutOfCognito,
  subscribeToAuthEvents,
} from './cognitoAuth'
import { lookupRecruiterAccount } from './recruiterService'
import { clearDraft } from './registrationDraft'
import { setSessionNotice, type SessionNoticeKind } from './sessionNotice'

/**
 * Where the backend says this user stands. Only `authenticated` (an ACTIVE,
 * approved recruiter confirmed by GET /api/v1/recruiters/auth/me) opens the
 * dashboard; a Cognito session alone never does.
 */
export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'signup-required'
  | 'pending'
  | 'authenticated'
  | 'restricted'
  | 'error'

/**
 * Outcome of re-running the account lookup. `ok: false` is a transient failure
 * (network, 5xx, malformed body) that left an already-established state alone;
 * `ok: true` means the lookup produced a state, which may be any AuthStatus.
 */
export type RefreshResult =
  | { ok: true; status: AuthStatus }
  | { ok: false; failure: AccountFailure }

interface AuthState {
  status: AuthStatus
  /** Set only while `authenticated`. */
  profile: RecruiterProfile | null
  /** Set only while `restricted`. */
  restriction: AccountRestriction | null
  /** Set only while `error`. */
  failure: AccountFailure | null
  /** Friendly text for a failed or cancelled Google sign-in. */
  oauthError: string | null
}

interface AuthContextValue extends AuthState {
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  /** Re-run GET /recruiters/auth/me (deduplicated) and apply the answer. */
  refreshAccount: () => Promise<RefreshResult>
  /** Apply a lookup/registration failure: session end, restriction, or transient. */
  handleAccountError: (error: unknown) => RefreshResult
  /** The registration POST returned 201 `APPROVAL_PENDING`. */
  markRegistrationSubmitted: () => void
}

const EMPTY: AuthState = {
  status: 'initializing',
  profile: null,
  restriction: null,
  failure: null,
  oauthError: null,
}

const SIGNED_OUT: AuthState = { ...EMPTY, status: 'unauthenticated' }

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

const MOCK_PROFILE: RecruiterProfile = {
  id: 'rec-001',
  email: 'recruiter@nexcentriq.com',
  fullName: 'Recruiter',
  role: 'RECRUITER',
  isActive: true,
}

// In mock mode the boot effect would otherwise auto-authenticate on every
// reload, which traps the user after logout. This flag records an explicit
// sign-out so mock boot stays on the login screen until they sign in again.
const MOCK_SIGNED_OUT_KEY = 'hmb.mock.signedOut'

function toProfile(user: ActiveRecruiterUser): RecruiterProfile {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
  return {
    id: String(user.recruiterId),
    email: user.email ?? '',
    fullName: fullName || 'Recruiter',
    role: 'RECRUITER',
    isActive: true,
  }
}

function legacyProfile(mode: AuthMode): RecruiterProfile {
  if (mode === 'dev-header') {
    return {
      ...MOCK_PROFILE,
      fullName: 'Dev Recruiter',
      email: 'dev-recruiter@local',
    }
  }
  return MOCK_PROFILE
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Decided once per provider. `mock` and `dev-header` are local-only
  // development modes that skip Cognito; `cognito` is the real flow.
  const [mode] = React.useState<AuthMode>(getAuthMode)
  const [state, setState] = React.useState<AuthState>(EMPTY)

  const statusRef = React.useRef<AuthStatus>(state.status)
  React.useEffect(() => {
    statusRef.current = state.status
  })

  /** The one in-flight lookup. Guards, Strict Mode and the 401 hook share it. */
  const inflight = React.useRef<Promise<RefreshResult> | null>(null)
  const booted = React.useRef(false)

  // --- applying backend answers ---------------------------------------

  const endSession = React.useCallback((reason: SessionNoticeKind) => {
    // The registration draft is deliberately kept: the user is about to sign
    // in again and the draft is only restored for the same Cognito subject.
    setSessionNotice(reason)
    setState(SIGNED_OUT)
    // Clears the Amplify session; the page then returns via Cognito's /logout.
    void signOutOfCognito().catch(() => {})
  }, [])

  const applyLookup = React.useCallback(
    (result: RecruiterAccountLookup): RefreshResult => {
      switch (result.nextStep) {
        case 'RECRUITER_DASHBOARD':
          clearDraft()
          setState({
            ...EMPTY,
            status: 'authenticated',
            profile: toProfile(result.user),
          })
          return { ok: true, status: 'authenticated' }
        case 'APPROVAL_PENDING':
          clearDraft()
          setState({ ...EMPTY, status: 'pending' })
          return { ok: true, status: 'pending' }
        case 'RECRUITER_SIGNUP_FORM':
          setState({ ...EMPTY, status: 'signup-required' })
          return { ok: true, status: 'signup-required' }
      }
    },
    []
  )

  const handleAccountError = React.useCallback(
    (error: unknown): RefreshResult => {
      const classified = classifyAccountError(error)
      switch (classified.kind) {
        case 'session':
          endSession(classified.reason)
          return { ok: true, status: 'unauthenticated' }
        case 'restricted':
          clearDraft()
          setState({
            ...EMPTY,
            status: 'restricted',
            restriction: classified.restriction,
          })
          return { ok: true, status: 'restricted' }
        case 'transient':
          // A transient failure never discards a state the backend already
          // confirmed (for example the pending page after "Check again").
          setState((prev) =>
            prev.status === 'initializing' || prev.status === 'error'
              ? { ...EMPTY, status: 'error', failure: classified.failure }
              : prev
          )
          return { ok: false, failure: classified.failure }
      }
    },
    [endSession]
  )

  const refreshAccount = React.useCallback((): Promise<RefreshResult> => {
    if (mode !== 'cognito') {
      return Promise.resolve({ ok: true, status: statusRef.current })
    }
    if (inflight.current) return inflight.current
    const run = (async (): Promise<RefreshResult> => {
      try {
        return applyLookup(await lookupRecruiterAccount())
      } catch (error) {
        return handleAccountError(error)
      }
    })().finally(() => {
      if (inflight.current === run) inflight.current = null
    })
    inflight.current = run
    return run
  }, [mode, applyLookup, handleAccountError])

  // --- API client wiring ----------------------------------------------

  React.useEffect(() => {
    configureAuth({
      // Called per request: Amplify returns a fresh token when one is expiring.
      getToken: () => (mode === 'cognito' ? getAccessToken() : null),
      // A 401 from any API is not trusted as "signed out" by itself: re-ask the
      // backend who this user is and follow the answer (deduplicated).
      onUnauthorized: () => {
        if (mode === 'cognito') void refreshAccount()
      },
    })
  }, [mode, refreshAccount])

  // --- boot: restore the session, then ALWAYS ask the backend ---------

  React.useEffect(() => {
    // Strict Mode runs effects twice in development; boot exactly once.
    if (booted.current) return
    booted.current = true

    async function boot() {
      if (mode === 'mock' || mode === 'dev-header') {
        // Local-only development modes. They never talk to Cognito.
        if (sessionStorage.getItem(MOCK_SIGNED_OUT_KEY) === '1') {
          setState(SIGNED_OUT)
          return
        }
        setState({
          ...EMPTY,
          status: 'authenticated',
          profile: legacyProfile(mode),
        })
        return
      }

      let identity
      try {
        // On /auth/callback this waits for Amplify to finish the code exchange.
        identity = await getSessionIdentity()
      } catch (error) {
        handleAccountError(error)
        return
      }
      if (!identity) {
        if (/[?&](code|error)=/.test(window.location.search)) {
          // A failed OAuth redirect is reported through Amplify's Hub a few
          // microtasks AFTER the session wait above is released. Let it land so
          // the callback page can say what went wrong.
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
        setState({ ...SIGNED_OUT, oauthError: getRecordedOAuthFailure() })
        return
      }
      await refreshAccount()
    }
    void boot()
  }, [mode, refreshAccount, handleAccountError])

  // --- Amplify events --------------------------------------------------

  React.useEffect(() => {
    if (mode !== 'cognito') return
    return subscribeToAuthEvents((event) => {
      const status = statusRef.current
      switch (event.type) {
        case 'oauthFailure':
          setState((prev) => ({ ...prev, oauthError: event.message }))
          break
        case 'signedOut':
          // Our own sign-out, or another tab's.
          if (status !== 'initializing' && status !== 'unauthenticated') {
            clearDraft()
            setState(SIGNED_OUT)
          }
          break
        case 'sessionExpired':
          // Keep the draft: it is restored for the same Google account.
          if (status !== 'initializing' && status !== 'unauthenticated') {
            setSessionNotice('session-ended')
            setState(SIGNED_OUT)
          }
          break
      }
    })
  }, [mode])

  // --- actions ---------------------------------------------------------

  const signInWithGoogle = React.useCallback(async () => {
    if (mode === 'mock' || mode === 'dev-header') {
      sessionStorage.removeItem(MOCK_SIGNED_OUT_KEY)
      setState({
        ...EMPTY,
        status: 'authenticated',
        profile: legacyProfile(mode),
      })
      window.location.href = '/applications/new'
      return
    }
    const outcome = await continueWithGoogle()
    // Amplify still holds a session (e.g. a stale tab): resolve it through the
    // backend instead of redirecting to Google again.
    if (outcome === 'already-signed-in') await refreshAccount()
  }, [mode, refreshAccount])

  const signOut = React.useCallback(async () => {
    clearDraft()
    setState(SIGNED_OUT)
    if (mode !== 'cognito') {
      sessionStorage.setItem(MOCK_SIGNED_OUT_KEY, '1')
      window.location.href = '/login'
      return
    }
    try {
      await signOutOfCognito()
    } catch {
      // Amplify clears the local tokens before it redirects, so the user is
      // signed out of this app even if the Cognito logout redirect failed.
    }
  }, [mode])

  const markRegistrationSubmitted = React.useCallback(() => {
    clearDraft()
    setState({ ...EMPTY, status: 'pending' })
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      signInWithGoogle,
      signOut,
      refreshAccount,
      handleAccountError,
      markRegistrationSubmitted,
    }),
    [
      state,
      signInWithGoogle,
      signOut,
      refreshAccount,
      handleAccountError,
      markRegistrationSubmitted,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
