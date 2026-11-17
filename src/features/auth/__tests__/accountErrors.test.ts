import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', async () => (await import('./authMocks')).envModule)

import { apiError } from './apiErrors'
import {
  classifyAccountError,
  isAmbiguousRegistrationFailure,
  NO_SESSION,
} from '../accountErrors'

describe('classifyAccountError: restricted accounts', () => {
  it.each([
    ['ACCOUNT_SUSPENDED', 403, 'Your recruiter account has been suspended.'],
    ['ACCOUNT_DELETED', 403, 'This account is unavailable.'],
    [
      'ACCOUNT_TYPE_MISMATCH',
      403,
      'This Google account is already associated with another HireMeBot account type.',
    ],
    [
      'ACCOUNT_IDENTITY_CONFLICT',
      409,
      'This email is already associated with another HireMeBot account.',
    ],
    ['EMAIL_NOT_VERIFIED', 403, 'Google did not provide a verified email.'],
  ])('%s is restricted and keeps the server message', (code, status, message) => {
    const result = classifyAccountError(apiError(code, status, { message, requestId: 'req-1' }))
    expect(result).toEqual({
      kind: 'restricted',
      restriction: { code, message, requestId: 'req-1' },
    })
  })

  it('falls back to built-in copy when the server sent no message', () => {
    const result = classifyAccountError(apiError('ACCOUNT_SUSPENDED', 403, { message: '' }))
    expect(result).toMatchObject({
      kind: 'restricted',
      restriction: { message: 'Your recruiter account has been suspended.' },
    })
  })

  it('treats a 403 with a code this client does not know as access denied, not an outage', () => {
    const result = classifyAccountError(apiError('SOMETHING_NEW', 403, { message: 'Nope.' }))
    expect(result).toMatchObject({
      kind: 'restricted',
      restriction: { code: 'ACCESS_DENIED', message: 'Nope.' },
    })
  })
})

describe('classifyAccountError: session problems', () => {
  it('UNAUTHORIZED (backend envelope) ends the session', () => {
    expect(classifyAccountError(apiError('UNAUTHORIZED', 401))).toEqual({
      kind: 'session',
      reason: 'session-ended',
    })
  })

  it.each([401, 403])(
    'API Gateway %i with no backend code is treated like UNAUTHORIZED',
    (status) => {
      const gateway = apiError(status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', status, {
        message: status === 401 ? 'Unauthorized' : 'Forbidden',
        backendCode: null,
      })
      expect(classifyAccountError(gateway)).toEqual({ kind: 'session', reason: 'session-ended' })
    }
  )

  it('GOOGLE_ACCOUNT_REQUIRED asks for Google sign-in (not a restriction)', () => {
    expect(classifyAccountError(apiError('GOOGLE_ACCOUNT_REQUIRED', 403))).toEqual({
      kind: 'session',
      reason: 'google-required',
    })
  })

  it('a missing Cognito session is a session problem', () => {
    expect(classifyAccountError(new Error(NO_SESSION))).toEqual({
      kind: 'session',
      reason: 'session-ended',
    })
  })
})

describe('classifyAccountError: transient failures', () => {
  it('503 is retryable and says so', () => {
    const result = classifyAccountError(apiError('SERVICE_UNAVAILABLE', 503, { requestId: 'r-9' }))
    expect(result).toMatchObject({
      kind: 'transient',
      failure: { code: 'SERVICE_UNAVAILABLE', requestId: 'r-9' },
    })
    expect(result.kind === 'transient' && result.failure.message).toMatch(/temporarily unavailable/i)
  })

  it('500 shows generic copy plus the request id, never the raw server text', () => {
    const result = classifyAccountError(
      apiError('INTERNAL_ERROR', 500, { message: 'SQLException at org.hmb.Foo', requestId: 'r-1' })
    )
    expect(result).toMatchObject({ kind: 'transient', failure: { requestId: 'r-1' } })
    expect(JSON.stringify(result)).not.toMatch(/SQLException/)
  })

  it('a malformed or unknown-nextStep response is a controlled error', () => {
    const result = classifyAccountError(apiError('UNEXPECTED_RESPONSE', 200, { backendCode: null }))
    expect(result.kind).toBe('transient')
    expect(result.kind === 'transient' && result.failure.message).toMatch(/unexpected response/i)
  })

  it('a network error keeps its friendly message', () => {
    const result = classifyAccountError(
      apiError('NETWORK_ERROR', 0, { message: 'Unable to connect.', backendCode: null })
    )
    expect(result).toMatchObject({ kind: 'transient', failure: { message: 'Unable to connect.' } })
  })

  it('an unknown thrown value is transient, not an access decision', () => {
    expect(classifyAccountError(new Error('boom')).kind).toBe('transient')
    expect(classifyAccountError('weird').kind).toBe('transient')
  })
})

describe('isAmbiguousRegistrationFailure', () => {
  it('is true when the POST may have created the account', () => {
    expect(isAmbiguousRegistrationFailure(apiError('NETWORK_ERROR', 0, { backendCode: null }))).toBe(true)
    expect(isAmbiguousRegistrationFailure(apiError('INTERNAL_ERROR', 500))).toBe(true)
    expect(isAmbiguousRegistrationFailure(apiError('SERVICE_UNAVAILABLE', 503))).toBe(true)
    expect(isAmbiguousRegistrationFailure(apiError('UNEXPECTED_RESPONSE', 201, { backendCode: null }))).toBe(true)
    expect(isAmbiguousRegistrationFailure(new Error('boom'))).toBe(true)
  })

  it('is false for definitive rejections', () => {
    expect(isAmbiguousRegistrationFailure(apiError('VALIDATION_FAILED', 400))).toBe(false)
    expect(isAmbiguousRegistrationFailure(apiError('ACCOUNT_ALREADY_REGISTERED', 409))).toBe(false)
    expect(isAmbiguousRegistrationFailure(apiError('NAME_ALREADY_REGISTERED', 409))).toBe(false)
    expect(isAmbiguousRegistrationFailure(apiError('UNAUTHORIZED', 401))).toBe(false)
  })
})
