import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { cognitoIsConfigured, env } from '@/lib/env'
import { NO_SESSION } from './accountErrors'

/**
 * Thin wrapper around Amplify v6 Auth. Amplify owns the OAuth state/PKCE
 * handling and the token storage and refresh; nothing here reads, stores or
 * logs a token.
 */

export interface SessionIdentity {
  /** Cognito subject; used to tie a registration draft to one Google account. */
  sub: string
  /** Google email from the ID token. Display only; never submitted. */
  email?: string
}

export type AuthEvent =
  | { type: 'oauthFailure'; message: string }
  | { type: 'signedOut' }
  /** Amplify could not refresh the session and has dropped it: sign in again. */
  | { type: 'sessionExpired' }

const listeners = new Set<(event: AuthEvent) => void>()
let recordedOAuthFailure: string | null = null

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name: unknown }).name)
    : ''
}

function errorText(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message: unknown }).message)
    : ''
}

/**
 * Friendly text for an OAuth failure. The raw text (Cognito error codes,
 * Amplify messages) is only inspected, never shown.
 */
export function describeOAuthFailure(rawText: string): string {
  if (/cancel|access_denied|denied/i.test(rawText)) {
    return 'Sign-in was cancelled. You can try again whenever you are ready.'
  }
  return 'We could not complete Google sign-in. Please try again.'
}

// Refresh errors after which Amplify clears the tokens (see its TokenOrchestrator).
// Anything else (network, throttling) leaves the session intact and retryable,
// so it must NOT sign the user out.
const DEFINITIVE_REFRESH_FAILURES = [
  'NotAuthorizedException',
  'TokenRevokedException',
  'UserNotFoundException',
  'PasswordResetRequiredException',
  'UserNotConfirmedException',
  'RefreshTokenReuseException',
]

function emit(event: AuthEvent) {
  for (const listener of listeners) listener(event)
}

// Registered at module load, before Amplify is configured: the OAuth redirect
// can fail before React has mounted, and that failure must not be lost.
Hub.listen('auth', ({ payload }) => {
  switch (payload.event) {
    case 'signInWithRedirect_failure': {
      const error = payload.data?.error
      console.warn('[auth] OAuth sign-in failed:', errorName(error) || 'unknown')
      recordedOAuthFailure = describeOAuthFailure(
        `${errorName(error)} ${errorText(error)}`
      )
      emit({ type: 'oauthFailure', message: recordedOAuthFailure })
      break
    }
    case 'signedOut':
      emit({ type: 'signedOut' })
      break
    case 'tokenRefresh_failure': {
      const name = errorName(payload.data?.error)
      if (DEFINITIVE_REFRESH_FAILURES.some((n) => name.startsWith(n))) {
        emit({ type: 'sessionExpired' })
      }
      break
    }
    default:
      break
  }
})

export function subscribeToAuthEvents(
  handler: (event: AuthEvent) => void
): () => void {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}

/** The last OAuth failure seen since the page loaded, if any. */
export function getRecordedOAuthFailure(): string | null {
  return recordedOAuthFailure
}

/**
 * Current Cognito session, or null when there is none (or Cognito is not
 * configured). Amplify refreshes an expired access token here when the refresh
 * token is still valid. On the OAuth callback page load this waits for Amplify
 * to finish exchanging the authorization code, so the account lookup never
 * runs before the session is ready.
 *
 * Throws on unexpected errors such as a network failure while refreshing: that
 * is a retryable problem, not proof that the user is signed out.
 */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  if (!cognitoIsConfigured()) return null
  const session = await fetchAuthSession()
  const access = session.tokens?.accessToken
  if (!access) return null
  const sub =
    session.userSub ??
    (typeof access.payload.sub === 'string' ? access.payload.sub : undefined)
  if (!sub) return null
  const email = session.tokens?.idToken?.payload?.email
  return { sub, email: typeof email === 'string' ? email : undefined }
}

/** Cognito ACCESS token (not the ID token) for an API call, or null. */
export async function getAccessToken(): Promise<string | null> {
  if (!cognitoIsConfigured()) return null
  const { tokens } = await fetchAuthSession()
  return tokens?.accessToken?.toString() ?? null
}

/**
 * Authorization header for a protected call. Fetch it immediately before each
 * request (do not cache it) so Amplify can refresh the token when needed.
 */
export async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error(NO_SESSION)
  return { Authorization: `Bearer ${accessToken}` }
}

function describeStartError(error: unknown): string {
  const name = errorName(error)
  if (/InvalidOrigin|InvalidRedirect|InvalidPreferredRedirect/.test(name)) {
    let origin = env.cognito.redirectUri
    try {
      origin = new URL(env.cognito.redirectUri).origin
    } catch {
      /* keep the raw value */
    }
    return `Google sign-in is only registered for ${origin}. Open the portal at that address and try again.`
  }
  if (/Config/i.test(name)) {
    return 'Google sign-in is not configured. Check the VITE_COGNITO_* settings.'
  }
  return 'We could not start Google sign-in. Please try again.'
}

/**
 * Start Google sign-in through the Cognito Hosted UI (authorization code +
 * PKCE). On success the browser leaves the page; the promise only matters for
 * failures. `already-signed-in` means Amplify still holds a session, so the
 * caller should run the account lookup instead of redirecting again.
 */
export async function continueWithGoogle(): Promise<
  'redirecting' | 'already-signed-in'
> {
  recordedOAuthFailure = null
  try {
    await signInWithRedirect({ provider: 'Google' })
    return 'redirecting'
  } catch (error) {
    if (errorName(error) === 'UserAlreadyAuthenticatedException') {
      return 'already-signed-in'
    }
    console.warn('[auth] Could not start sign-in:', errorName(error) || 'unknown')
    throw new Error(describeStartError(error))
  }
}

/**
 * Clears the Amplify session locally, then Amplify redirects through Cognito's
 * /logout to the configured sign-out URL (the portal root).
 */
export async function signOutOfCognito(): Promise<void> {
  await signOut()
}
