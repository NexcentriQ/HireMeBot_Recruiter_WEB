import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from '../registrationDraft'
import { setSessionNotice, takeSessionNotice } from '../sessionNotice'

const DRAFT = {
  firstName: 'Alex',
  lastName: 'Smith',
  phoneNumber: '+1713',
  acceptedTerms: true,
}

describe('registration draft', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips for the same Cognito subject', () => {
    saveDraft('sub-1', DRAFT)
    expect(loadDraft('sub-1')).toEqual(DRAFT)
  })

  it('discards the draft of a different Google account', () => {
    saveDraft('sub-1', DRAFT)
    expect(loadDraft('sub-2')).toBeNull()
    // ...and does not leave it behind for anyone else.
    expect(loadDraft('sub-1')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('lives in sessionStorage only, never localStorage', () => {
    saveDraft('sub-1', DRAFT)
    expect(sessionStorage.length).toBe(1)
    expect(localStorage.length).toBe(0)
  })

  it('stores only the form fields and the subject (no tokens, no extras)', () => {
    saveDraft('sub-1', {
      ...DRAFT,
      accessToken: 'secret.jwt.value',
    } as unknown as typeof DRAFT)
    const raw = sessionStorage.getItem(sessionStorage.key(0)!)!
    expect(raw).not.toMatch(/secret|token/i)
    const stored = JSON.parse(raw) as { sub: string; savedAt: number; values: object }
    expect(Object.keys(stored).sort()).toEqual(['savedAt', 'sub', 'values'])
    expect(Object.keys(stored.values).sort()).toEqual(
      ['acceptedTerms', 'firstName', 'lastName', 'phoneNumber']
    )
  })

  it('expires after 30 minutes', () => {
    vi.useFakeTimers()
    saveDraft('sub-1', DRAFT)
    vi.advanceTimersByTime(29 * 60 * 1000)
    expect(loadDraft('sub-1')).toEqual(DRAFT)
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(loadDraft('sub-1')).toBeNull()
  })

  it('clearDraft removes it', () => {
    saveDraft('sub-1', DRAFT)
    clearDraft()
    expect(loadDraft('sub-1')).toBeNull()
  })

  it('ignores and removes malformed storage', () => {
    saveDraft('sub-1', DRAFT)
    const key = sessionStorage.key(0)!
    sessionStorage.setItem(key, '{not json')
    expect(loadDraft('sub-1')).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()

    sessionStorage.setItem(
      key,
      JSON.stringify({ sub: 'sub-1', savedAt: Date.now(), values: { firstName: 1 } })
    )
    expect(loadDraft('sub-1')).toBeNull()
  })
})

describe('session notice', () => {
  beforeEach(() => sessionStorage.clear())

  it('is shown once and then cleared', () => {
    setSessionNotice('session-ended')
    expect(takeSessionNotice()).toMatch(/session has ended/i)
    expect(takeSessionNotice()).toBeNull()
  })

  it('has distinct wording for a non-Google sign-in', () => {
    setSessionNotice('google-required')
    expect(takeSessionNotice()).toMatch(/continue with google/i)
  })

  it('ignores unknown stored values', () => {
    sessionStorage.setItem('hmb.recruiter.notice', 'something-else')
    expect(takeSessionNotice()).toBeNull()
  })
})
