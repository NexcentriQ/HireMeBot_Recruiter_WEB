import { vi } from 'vitest'
import type { AuthEvent } from '../cognitoAuth'

/**
 * Shared test doubles for the recruiter auth flow. Imported by the lazy
 * `vi.mock` factories in each test file; it deliberately imports nothing from
 * the app except a type, so it cannot create an import cycle (the mocked env
 * module is built here, and apiClient imports env).
 */

// --- @/lib/env ---------------------------------------------------------

export const envState = {
  authMode: 'cognito' as 'mock' | 'dev-header' | 'cognito',
}

export const envModule = {
  env: {
    useMockApi: false,
    apiBaseUrl: 'http://127.0.0.1:3000',
    devRecruiterId: '',
    termsUrl: '',
    cognito: {
      userPoolId: 'pool',
      clientId: 'client',
      domain: 'example.auth.us-east-2.amazoncognito.com',
      redirectUri: 'http://localhost:5173/auth/callback',
      logoutUri: 'http://localhost:5173/',
    },
  },
  getAuthMode: () => envState.authMode,
  isDevRecruiterMode: () => envState.authMode === 'dev-header',
  cognitoIsConfigured: () => true,
}

// --- ../cognitoAuth ----------------------------------------------------

let handler: ((event: AuthEvent) => void) | null = null

export const cognito = {
  getSessionIdentity: vi.fn(),
  getAccessToken: vi.fn(),
  getAuthHeaders: vi.fn(),
  continueWithGoogle: vi.fn(),
  signOutOfCognito: vi.fn(),
  getRecordedOAuthFailure: vi.fn(),
  subscribeToAuthEvents: vi.fn(),
}

export const cognitoModule = {
  ...cognito,
  describeOAuthFailure: (text: string) =>
    /cancel|denied/i.test(text)
      ? 'Sign-in was cancelled. You can try again whenever you are ready.'
      : 'We could not complete Google sign-in. Please try again.',
}

/** Deliver an Amplify Hub event to the AuthProvider's subscription. */
export function emitAuthEvent(event: AuthEvent) {
  handler?.(event)
}

// --- ../recruiterService -----------------------------------------------

export const service = {
  lookupRecruiterAccount: vi.fn(),
  registerRecruiter: vi.fn(),
}

// --- defaults + builders -------------------------------------------------

export const SUB = 'cognito-sub-1'

export function resetAuthMocks() {
  envState.authMode = 'cognito'
  handler = null
  for (const fn of [...Object.values(cognito), ...Object.values(service)]) {
    fn.mockReset()
  }
  cognito.getSessionIdentity.mockResolvedValue({
    sub: SUB,
    email: 'recruiter@gmail.com',
  })
  cognito.getAccessToken.mockResolvedValue('access-token')
  cognito.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer access-token' })
  cognito.getRecordedOAuthFailure.mockReturnValue(null)
  cognito.continueWithGoogle.mockResolvedValue('redirecting')
  cognito.signOutOfCognito.mockResolvedValue(undefined)
  cognito.subscribeToAuthEvents.mockImplementation(
    (h: (event: AuthEvent) => void) => {
      handler = h
      return () => {
        if (handler === h) handler = null
      }
    }
  )
}

export const ACTIVE_LOOKUP = {
  nextStep: 'RECRUITER_DASHBOARD' as const,
  user: {
    userId: 1000000001,
    recruiterId: 1000000001,
    firstName: 'Alex',
    lastName: 'Smith',
    email: 'recruiter@gmail.com',
    phoneNumber: '+17135550101',
    emailVerified: true,
    phoneVerified: false,
    accountStatus: 'ACTIVE' as const,
    accountType: 'RECRUITER' as const,
  },
}
export const PENDING_LOOKUP = { nextStep: 'APPROVAL_PENDING' as const }
export const SIGNUP_LOOKUP = { nextStep: 'RECRUITER_SIGNUP_FORM' as const }
