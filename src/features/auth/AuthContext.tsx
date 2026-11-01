import * as React from 'react'
import { env, isDevRecruiterMode } from '@/lib/env'
import { configureAuth } from '@/lib/apiClient'
import type { RecruiterProfile } from '@/types/domain'
import {
  buildGoogleLoginUrl,
  buildLogoutUrl,
  clearSession,
  decodeJwtPayload,
  readSession,
  type CognitoTokens,
} from './cognitoClient'
import { fetchRecruiterProfile } from './recruiterService'

type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'
  | 'unauthorized'

interface AuthContextValue {
  status: AuthStatus
  profile: RecruiterProfile | null
  tokens: CognitoTokens | null
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => void
  completeLogin: (tokens: CognitoTokens) => Promise<void>
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('initializing')
  const [tokens, setTokens] = React.useState<CognitoTokens | null>(null)
  const [profile, setProfile] = React.useState<RecruiterProfile | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const signOut = React.useCallback(() => {
    clearSession()
    setTokens(null)
    setProfile(null)
    setStatus('unauthenticated')
    if (env.useMockApi || isDevRecruiterMode()) {
      sessionStorage.setItem(MOCK_SIGNED_OUT_KEY, '1')
      window.location.href = '/login'
      return
    }
    const url = buildLogoutUrl()
    window.location.href = url ?? '/login'
  }, [])

  // Wire the API client to this provider's auth state.
  React.useEffect(() => {
    configureAuth({
      getToken: () => tokens?.accessToken ?? null,
      onUnauthorized: () => {
        clearSession()
        setTokens(null)
        setProfile(null)
        setStatus('unauthenticated')
      },
    })
  }, [tokens])

  const resolveProfile = React.useCallback(
    async (t: CognitoTokens) => {
      try {
        if (env.useMockApi) {
          // In mock mode, display claim-derived info if available.
          const claims = decodeJwtPayload<{
            email?: string
            name?: string
            given_name?: string
            family_name?: string
          }>(t.idToken)
          const fullName =
            claims?.name ||
            [claims?.given_name, claims?.family_name].filter(Boolean).join(' ') ||
            MOCK_PROFILE.fullName
          const email = claims?.email || MOCK_PROFILE.email
          setProfile({ ...MOCK_PROFILE, email, fullName })
          setStatus('authenticated')
          return
        }
        const p = await fetchRecruiterProfile()
        if (!p.isActive || p.role !== 'RECRUITER') {
          setStatus('unauthorized')
          setProfile(null)
          return
        }
        setProfile(p)
        setStatus('authenticated')
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Could not verify recruiter access.'
        setError(message)
        setStatus('unauthorized')
      }
    },
    []
  )

  // Boot: restore session + mock-mode shortcut.
  React.useEffect(() => {
    let active = true
    async function boot() {
      // In mock mode, auto-authenticate so the UI is usable — but only
      // when the user has not just signed out of this browser tab.
      if (env.useMockApi) {
        if (sessionStorage.getItem(MOCK_SIGNED_OUT_KEY) === '1') {
          if (active) setStatus('unauthenticated')
          return
        }
        setTokens({
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        })
        if (active) {
          setProfile(MOCK_PROFILE)
          setStatus('authenticated')
        }
        return
      }

      // Dev-integration mode: real backend using the X-Dev-Recruiter-Id
      // header. We skip Cognito and auto-authorize so the UI is reachable.
      if (isDevRecruiterMode()) {
        if (sessionStorage.getItem(MOCK_SIGNED_OUT_KEY) === '1') {
          if (active) setStatus('unauthenticated')
          return
        }
        if (active) {
          setProfile({
            ...MOCK_PROFILE,
            fullName: 'Dev Recruiter',
            email: `dev-recruiter-${env.devRecruiterId}@local`,
          })
          setStatus('authenticated')
        }
        return
      }

      const existing = readSession()
      if (!existing || existing.expiresAt < Date.now()) {
        clearSession()
        if (active) setStatus('unauthenticated')
        return
      }
      if (active) {
        // Prime the API client with the restored token BEFORE the first
        // authenticated request. React state updates are async, so relying
        // on the `tokens`-effect to re-call configureAuth would race.
        configureAuth({
          getToken: () => existing.accessToken,
          onUnauthorized: () => {
            clearSession()
            setTokens(null)
            setProfile(null)
            setStatus('unauthenticated')
          },
        })
        setTokens(existing)
        await resolveProfile(existing)
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [resolveProfile])

  const signInWithGoogle = React.useCallback(async () => {
    if (env.useMockApi) {
      // Mock mode: pretend to log in immediately.
      sessionStorage.removeItem(MOCK_SIGNED_OUT_KEY)
      const t: CognitoTokens = {
        accessToken: 'mock-access-token',
        idToken: 'mock-id-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      }
      setTokens(t)
      setProfile(MOCK_PROFILE)
      setStatus('authenticated')
      window.location.href = '/dashboard'
      return
    }

    if (isDevRecruiterMode()) {
      sessionStorage.removeItem(MOCK_SIGNED_OUT_KEY)
      setProfile({
        ...MOCK_PROFILE,
        fullName: 'Dev Recruiter',
        email: `dev-recruiter-${env.devRecruiterId}@local`,
      })
      setStatus('authenticated')
      window.location.href = '/dashboard'
      return
    }
    const url = await buildGoogleLoginUrl()
    window.location.href = url
  }, [])

  const completeLogin = React.useCallback(
    async (t: CognitoTokens) => {
      // Prime the API client synchronously so the first authenticated
      // request after the OAuth callback has the Authorization header.
      configureAuth({
        getToken: () => t.accessToken,
        onUnauthorized: () => {
          clearSession()
          setTokens(null)
          setProfile(null)
          setStatus('unauthenticated')
        },
      })
      setTokens(t)
      await resolveProfile(t)
    },
    [resolveProfile]
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      tokens,
      error,
      signInWithGoogle,
      signOut,
      completeLogin,
    }),
    [status, profile, tokens, error, signInWithGoogle, signOut, completeLogin]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
