/**
 * Short-lived registration draft, kept in sessionStorage (not localStorage) so
 * it survives the Cognito Hosted UI redirect and a reload but not the tab.
 *
 * It holds ONLY the form fields (names, phone, Terms checkbox) and the Cognito
 * subject that owns it. Never tokens. A draft is only restored for the same
 * Google account; a different account's draft is discarded.
 */

const KEY = 'hmb.recruiter.registrationDraft'
const TTL_MS = 30 * 60 * 1000

export interface RegistrationDraft {
  firstName: string
  lastName: string
  phoneNumber: string
  acceptedTerms: boolean
}

interface StoredDraft {
  sub: string
  savedAt: number
  values: RegistrationDraft
}

function isDraft(value: unknown): value is RegistrationDraft {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.firstName === 'string' &&
    typeof v.lastName === 'string' &&
    typeof v.phoneNumber === 'string' &&
    typeof v.acceptedTerms === 'boolean'
  )
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

export function saveDraft(sub: string, values: RegistrationDraft): void {
  try {
    const stored: StoredDraft = {
      sub,
      savedAt: Date.now(),
      // Copy field by field so nothing else can ride along into storage.
      values: {
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: values.phoneNumber,
        acceptedTerms: values.acceptedTerms,
      },
    }
    sessionStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable or full: the draft is a convenience only */
  }
}

/** The draft for this Cognito subject, or null (and the draft is removed) if
 *  it belongs to another account, has expired or is malformed. */
export function loadDraft(sub: string): RegistrationDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    if (
      parsed.sub !== sub ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > TTL_MS ||
      !isDraft(parsed.values)
    ) {
      clearDraft()
      return null
    }
    return parsed.values
  } catch {
    clearDraft()
    return null
  }
}
