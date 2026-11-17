import { ApiError } from '@/lib/apiClient'
import type {
  AccountFailure,
  AccountRestriction,
  RestrictionCode,
} from '@/types/recruiterAuth'
import type { SessionNoticeKind } from './sessionNotice'

/** Error message used when there is no Cognito session to make a call with. */
export const NO_SESSION = 'NO_SESSION'

/** Fallback copy; the backend's own message is preferred when it sent one. */
const RESTRICTION_FALLBACK: Record<RestrictionCode, string> = {
  ACCOUNT_SUSPENDED: 'Your recruiter account has been suspended.',
  ACCOUNT_DELETED: 'This account is unavailable.',
  ACCOUNT_TYPE_MISMATCH:
    'This Google account is already associated with another HireMeBot account type.',
  ACCOUNT_IDENTITY_CONFLICT:
    'This email is already associated with another HireMeBot account.',
  EMAIL_NOT_VERIFIED:
    'Your Google account email must be verified before you can continue.',
  ACCESS_DENIED:
    'This account does not have access to the HireMeBot Recruiter Portal.',
}

const RESTRICTION_CODES = new Set<string>([
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_DELETED',
  'ACCOUNT_TYPE_MISMATCH',
  'ACCOUNT_IDENTITY_CONFLICT',
  'EMAIL_NOT_VERIFIED',
])

export type ClassifiedAccountError =
  /** The Cognito session is unusable: sign out and offer Continue with Google. */
  | { kind: 'session'; reason: SessionNoticeKind }
  /** The backend refused this account: never the dashboard, never the form. */
  | { kind: 'restricted'; restriction: AccountRestriction }
  /** Says nothing about the account (network, 5xx, malformed body): retryable. */
  | { kind: 'transient'; failure: AccountFailure }

function transientMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return error.message
      case 'SERVICE_UNAVAILABLE':
        return 'The service is temporarily unavailable. Please try again in a moment.'
      case 'INTERNAL_ERROR':
        return 'Something went wrong on our side. Please try again.'
      case 'UNEXPECTED_RESPONSE':
        return 'We received an unexpected response from the server. Please try again, or contact support if it continues.'
    }
  }
  return 'We could not check your account right now. Please try again.'
}

/**
 * Sort a lookup/registration failure into what the UI must do about it, using
 * the error codes of RECRUITER_AUTH_API.md. Validation, duplicate and name
 * conflicts are NOT handled here: those belong to the registration form.
 */
export function classifyAccountError(error: unknown): ClassifiedAccountError {
  if (error instanceof Error && error.message === NO_SESSION) {
    return { kind: 'session', reason: 'session-ended' }
  }

  if (error instanceof ApiError) {
    const { status, backendCode } = error

    if (backendCode === 'GOOGLE_ACCOUNT_REQUIRED') {
      return { kind: 'session', reason: 'google-required' }
    }

    if (backendCode && RESTRICTION_CODES.has(backendCode)) {
      const code = backendCode as RestrictionCode
      return {
        kind: 'restricted',
        restriction: {
          code,
          message: error.message || RESTRICTION_FALLBACK[code],
          requestId: error.requestId,
        },
      }
    }

    // 401/403 with no backend code is API Gateway's own `{message:"Unauthorized"}`
    // / `{message:"Forbidden"}`: treat it like UNAUTHORIZED. The user signs in
    // again on purpose; nothing here redirects to Google by itself.
    if (backendCode === 'UNAUTHORIZED' || (!backendCode && (status === 401 || status === 403))) {
      return { kind: 'session', reason: 'session-ended' }
    }

    // A 403 carrying a code we do not know is still a refusal, not an outage.
    if (status === 403) {
      return {
        kind: 'restricted',
        restriction: {
          code: 'ACCESS_DENIED',
          message: error.message || RESTRICTION_FALLBACK.ACCESS_DENIED,
          requestId: error.requestId,
        },
      }
    }

    return {
      kind: 'transient',
      failure: {
        message: transientMessage(error),
        requestId: error.requestId,
        code: error.code,
      },
    }
  }

  return {
    kind: 'transient',
    failure: { message: transientMessage(error), code: 'UNKNOWN' },
  }
}

/**
 * True when a failed registration POST may nevertheless have created the
 * account (no response, 5xx, or a malformed 2xx). The caller resolves the
 * outcome with an account lookup instead of retrying the POST.
 */
export function isAmbiguousRegistrationFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return (
    error.code === 'NETWORK_ERROR' ||
    error.code === 'UNEXPECTED_RESPONSE' ||
    error.status === 0 ||
    error.status >= 500 ||
    (error.status >= 200 && error.status < 300)
  )
}
