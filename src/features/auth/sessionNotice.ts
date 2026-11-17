/**
 * A one-shot message for the login page, carried across the sign-out redirect
 * through Cognito (sessionStorage survives it within the tab). It explains why
 * the user is looking at the login page again.
 */

const KEY = 'hmb.recruiter.notice'

export type SessionNoticeKind = 'session-ended' | 'google-required'

const NOTICE_TEXT: Record<SessionNoticeKind, string> = {
  'session-ended': 'Your session has ended. Please continue with Google to sign in again.',
  'google-required': 'Recruiters sign in with Google. Please use Continue with Google.',
}

export function setSessionNotice(kind: SessionNoticeKind): void {
  try {
    sessionStorage.setItem(KEY, kind)
  } catch {
    /* storage unavailable: the notice is a convenience only */
  }
}

/** Read and clear the pending notice text, if any. */
export function takeSessionNotice(): string | null {
  try {
    const kind = sessionStorage.getItem(KEY)
    if (!kind) return null
    sessionStorage.removeItem(KEY)
    return NOTICE_TEXT[kind as SessionNoticeKind] ?? null
  } catch {
    return null
  }
}
