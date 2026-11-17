import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'

vi.mock('@/lib/env', async () => (await import('./authMocks')).envModule)
vi.mock('../cognitoAuth', async () => (await import('./authMocks')).cognitoModule)

import { apiClient, ApiError, configureAuth } from '@/lib/apiClient'
import {
  LOOKUP_RETRY_DELAYS_MS,
  lookupRecruiterAccount,
  registerRecruiter,
  RECRUITER_LOOKUP_PATH,
  RECRUITER_REGISTER_PATH,
} from '../recruiterService'
import { ACTIVE_LOOKUP, cognito, envState, resetAuthMocks } from './authMocks'

interface Reply {
  status: number
  data?: unknown
  networkError?: boolean
}

let replies: Reply[] = []
let requests: InternalAxiosRequestConfig[] = []

/** Stands in for the network but leaves apiClient's interceptors in place. */
const adapter: AxiosAdapter = async (config) => {
  requests.push(config)
  const reply = replies.shift() ?? { status: 500, data: {} }
  if (reply.networkError) throw new AxiosError('Network Error', 'ERR_NETWORK', config)
  const response = {
    data: reply.data,
    status: reply.status,
    statusText: '',
    headers: {},
    config,
  }
  if (!config.validateStatus || config.validateStatus(reply.status)) return response
  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    'ERR_BAD_REQUEST',
    config,
    null,
    response
  )
}

const FAST = { retryDelaysMs: [0, 0, 0] }

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the promise to reject')
}

beforeEach(() => {
  resetAuthMocks()
  replies = []
  requests = []
  apiClient.defaults.adapter = adapter
  configureAuth({ getToken: () => null, onUnauthorized: () => {} })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('lookupRecruiterAccount: request', () => {
  it('GETs /api/v1/recruiters/auth/me (plural) with only the Cognito access token', async () => {
    replies = [{ status: 200, data: { success: true, nextStep: 'RECRUITER_SIGNUP_FORM' } }]
    await lookupRecruiterAccount(FAST)

    expect(requests).toHaveLength(1)
    const req = requests[0]
    expect(RECRUITER_LOOKUP_PATH).toBe('/api/v1/recruiters/auth/me')
    expect(req.url).toBe('/api/v1/recruiters/auth/me')
    expect(req.method).toBe('get')
    expect(req.headers.get('Authorization')).toBe('Bearer access-token')
    // No email, user id or recruiter id: identity comes only from the token.
    expect(req.params).toBeUndefined()
    expect(req.data).toBeUndefined()
  })

  it('never sends the development recruiter header, even in dev-header mode', async () => {
    envState.authMode = 'dev-header'
    replies = [{ status: 200, data: { success: true, nextStep: 'RECRUITER_SIGNUP_FORM' } }]
    await lookupRecruiterAccount(FAST)

    const req = requests[0]
    expect(req.headers.get('Authorization')).toBe('Bearer access-token')
    expect(req.headers.get('X-Dev-Recruiter-Id')).toBeFalsy()
  })

  it('asks Amplify for a fresh token on every attempt instead of caching one', async () => {
    replies = [
      { status: 503, data: { success: false, code: 'SERVICE_UNAVAILABLE' } },
      { status: 200, data: { success: true, nextStep: 'RECRUITER_SIGNUP_FORM' } },
    ]
    await lookupRecruiterAccount(FAST)
    expect(cognito.getAuthHeaders).toHaveBeenCalledTimes(2)
  })

  it('makes no request without a Cognito session', async () => {
    cognito.getAuthHeaders.mockRejectedValue(new Error('NO_SESSION'))
    await expect(lookupRecruiterAccount(FAST)).rejects.toThrow('NO_SESSION')
    expect(requests).toHaveLength(0)
  })
})

describe('lookupRecruiterAccount: response handling', () => {
  it('RECRUITER_DASHBOARD for an ACTIVE recruiter returns the profile', async () => {
    replies = [{ status: 200, data: { success: true, registered: true, ...ACTIVE_LOOKUP } }]
    const result = await lookupRecruiterAccount(FAST)
    expect(result.nextStep).toBe('RECRUITER_DASHBOARD')
    expect(result).toMatchObject({ user: { recruiterId: 1000000001, firstName: 'Alex' } })
  })

  it('APPROVAL_PENDING carries no user', async () => {
    replies = [
      {
        status: 200,
        data: {
          success: true,
          registered: true,
          nextStep: 'APPROVAL_PENDING',
          message: 'Your recruiter account is waiting for approval.',
          user: { userId: 1, recruiterId: 1, accountType: 'RECRUITER', accountStatus: 'PENDING' },
        },
      },
    ]
    const result = await lookupRecruiterAccount(FAST)
    expect(result).toEqual({
      nextStep: 'APPROVAL_PENDING',
      message: 'Your recruiter account is waiting for approval.',
    })
  })

  it('RECRUITER_SIGNUP_FORM does not invent a user object', async () => {
    replies = [
      {
        status: 200,
        data: {
          success: true,
          registered: false,
          nextStep: 'RECRUITER_SIGNUP_FORM',
          message: 'Complete your HireMeBot recruiter registration.',
        },
      },
    ]
    const result = await lookupRecruiterAccount(FAST)
    expect(result.nextStep).toBe('RECRUITER_SIGNUP_FORM')
    expect('user' in result).toBe(false)
  })

  it.each([
    ['an unknown nextStep', { success: true, nextStep: 'RECRUITER_MFA' }],
    ['a missing nextStep', { success: true }],
    ['success: false', { success: false, nextStep: 'RECRUITER_SIGNUP_FORM' }],
    ['a dashboard step without a user', { success: true, nextStep: 'RECRUITER_DASHBOARD' }],
    [
      'a dashboard step for a PENDING account',
      { success: true, nextStep: 'RECRUITER_DASHBOARD', user: { ...ACTIVE_LOOKUP.user, accountStatus: 'PENDING' } },
    ],
    [
      'a dashboard step for a SUSPENDED account',
      { success: true, nextStep: 'RECRUITER_DASHBOARD', user: { ...ACTIVE_LOOKUP.user, accountStatus: 'SUSPENDED' } },
    ],
    [
      'a dashboard step for a non-recruiter',
      { success: true, nextStep: 'RECRUITER_DASHBOARD', user: { ...ACTIVE_LOOKUP.user, accountType: 'STUDENT' } },
    ],
    ['a non-object body', 'ok'],
  ])('rejects %s so it can never open the dashboard', async (_label, body) => {
    replies = [{ status: 200, data: body }]
    const error = await rejection(lookupRecruiterAccount(FAST))
    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(requests).toHaveLength(1) // a bad body is not retried
  })

  it('logs only safe diagnostics for an unknown nextStep (no body, no tokens)', async () => {
    replies = [
      { status: 200, data: { success: true, nextStep: 'RECRUITER_MFA', email: 'secret@gmail.com' } },
    ]
    await rejection(lookupRecruiterAccount(FAST))
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls)
    expect(logged).toContain('RECRUITER_MFA')
    expect(logged).not.toContain('secret@gmail.com')
    expect(logged).not.toContain('access-token')
  })
})

describe('lookupRecruiterAccount: errors and retry', () => {
  it('retries a 503 with bounded backoff and then succeeds', async () => {
    replies = [
      { status: 503, data: { success: false, code: 'SERVICE_UNAVAILABLE', message: 'down' } },
      { status: 503, data: { success: false, code: 'SERVICE_UNAVAILABLE', message: 'down' } },
      { status: 200, data: { success: true, nextStep: 'RECRUITER_SIGNUP_FORM' } },
    ]
    const result = await lookupRecruiterAccount(FAST)
    expect(result.nextStep).toBe('RECRUITER_SIGNUP_FORM')
    expect(requests).toHaveLength(3)
  })

  it('gives up after the last retry instead of looping forever', async () => {
    replies = Array.from({ length: 10 }, () => ({
      status: 503,
      data: { success: false, code: 'SERVICE_UNAVAILABLE', message: 'down', requestId: 'r-1' },
    }))
    const error = await rejection(lookupRecruiterAccount(FAST))
    expect(error.code).toBe('SERVICE_UNAVAILABLE')
    expect(error.status).toBe(503)
    expect(error.requestId).toBe('r-1')
    expect(requests).toHaveLength(1 + FAST.retryDelaysMs.length) // 4 attempts, no more
  })

  it('uses the documented 1 s / 2 s / 4 s backoff by default', () => {
    expect([...LOOKUP_RETRY_DELAYS_MS]).toEqual([1000, 2000, 4000])
  })

  it.each([
    [401, { success: false, code: 'UNAUTHORIZED', message: 'x' }],
    [403, { success: false, code: 'ACCOUNT_SUSPENDED', message: 'x' }],
    [409, { success: false, code: 'ACCOUNT_IDENTITY_CONFLICT', message: 'x' }],
    [500, { success: false, code: 'INTERNAL_ERROR', message: 'x' }],
  ])('does not retry a %i', async (status, data) => {
    replies = [{ status, data }, { status: 200, data: { success: true, nextStep: 'RECRUITER_SIGNUP_FORM' } }]
    await rejection(lookupRecruiterAccount(FAST))
    expect(requests).toHaveLength(1)
  })

  it('preserves the HTTP status, backend code, message and requestId', async () => {
    replies = [
      {
        status: 403,
        data: {
          success: false,
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your recruiter account has been suspended.',
          requestId: '68d329fa',
        },
      },
    ]
    const error = await rejection(lookupRecruiterAccount(FAST))
    expect(error).toMatchObject({
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      backendCode: 'ACCOUNT_SUSPENDED',
      message: 'Your recruiter account has been suspended.',
      requestId: '68d329fa',
    })
  })

  it("keeps API Gateway's code-less 401/403 distinguishable from backend errors", async () => {
    replies = [{ status: 401, data: { message: 'Unauthorized' } }]
    const unauthorized = await rejection(lookupRecruiterAccount(FAST))
    expect(unauthorized).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })
    expect(unauthorized.backendCode).toBeUndefined()

    replies = [{ status: 403, data: { message: 'Forbidden' } }]
    const forbidden = await rejection(lookupRecruiterAccount(FAST))
    expect(forbidden).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(forbidden.backendCode).toBeUndefined()
  })

  it('reports a network failure as NETWORK_ERROR (not retried)', async () => {
    replies = [{ status: 0, networkError: true }]
    const error = await rejection(lookupRecruiterAccount(FAST))
    expect(error.code).toBe('NETWORK_ERROR')
    expect(requests).toHaveLength(1)
  })

  it('does not trigger the global 401 handler (the caller resolves it)', async () => {
    const onUnauthorized = vi.fn()
    configureAuth({ getToken: () => null, onUnauthorized })
    replies = [{ status: 401, data: { message: 'Unauthorized' } }]
    await rejection(lookupRecruiterAccount(FAST))
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('registerRecruiter', () => {
  const payload = {
    firstName: 'Alex',
    lastName: 'Smith',
    phoneNumber: '+17135550101',
    acceptedTerms: true as const,
  }
  const created = {
    success: true,
    code: 'RECRUITER_REGISTRATION_SUBMITTED',
    message: 'Your recruiter registration is pending approval.',
    data: {
      userId: 1000000001,
      recruiterId: 1000000001,
      firstName: 'Alex',
      lastName: 'Smith',
      email: 'recruiter@gmail.com',
      phoneNumber: '+17135550101',
      emailVerified: true,
      phoneVerified: false,
      accountStatus: 'PENDING',
      accountType: 'RECRUITER',
      nextStep: 'APPROVAL_PENDING',
    },
  }

  it('POSTs exactly the four documented fields with the Cognito access token', async () => {
    replies = [{ status: 201, data: created }]
    await registerRecruiter(payload)

    const req = requests[0]
    expect(RECRUITER_REGISTER_PATH).toBe('/api/v1/recruiters/register')
    expect(req.url).toBe('/api/v1/recruiters/register')
    expect(req.method).toBe('post')
    expect(req.headers.get('Authorization')).toBe('Bearer access-token')
    expect(req.headers.get('Content-Type')).toMatch(/application\/json/)
    expect(JSON.parse(req.data as string)).toEqual({
      firstName: 'Alex',
      lastName: 'Smith',
      phoneNumber: '+17135550101',
      acceptedTerms: true,
    })
  })

  it('cannot be made to send email, ids, status or OTP fields', async () => {
    replies = [{ status: 201, data: created }]
    await registerRecruiter({
      ...payload,
      email: 'intruder@example.com',
      userId: 1,
      recruiterId: 1,
      managerId: 1,
      cognitoSub: 'x',
      accountStatus: 'ACTIVE',
      phoneVerified: true,
      otp: '123456',
    } as unknown as typeof payload)
    expect(Object.keys(JSON.parse(requests[0].data as string)).sort()).toEqual([
      'acceptedTerms',
      'firstName',
      'lastName',
      'phoneNumber',
    ])
  })

  it('returns APPROVAL_PENDING on a 201', async () => {
    replies = [{ status: 201, data: created }]
    const result = await registerRecruiter(payload)
    expect(result).toMatchObject({ userId: 1000000001, recruiterId: 1000000001, nextStep: 'APPROVAL_PENDING' })
  })

  it('never accepts a dashboard step from a registration response', async () => {
    replies = [{ status: 201, data: { ...created, data: { ...created.data, nextStep: 'RECRUITER_DASHBOARD' } } }]
    expect((await rejection(registerRecruiter(payload))).code).toBe('UNEXPECTED_RESPONSE')
  })

  it('treats any 2xx other than 201 as a failure', async () => {
    replies = [{ status: 200, data: created }]
    const error = await rejection(registerRecruiter(payload))
    expect(error.status).toBe(200)
    expect(error.code).not.toBe('APPROVAL_PENDING')
  })

  it('maps VALIDATION_FAILED field errors, dropping malformed entries', async () => {
    replies = [
      {
        status: 400,
        data: {
          success: false,
          code: 'VALIDATION_FAILED',
          message: 'Please provide valid registration details.',
          fieldErrors: [
            { field: 'phoneNumber', message: 'Enter a valid phone number.' },
            { field: 'firstName' },
            'nonsense',
          ],
          requestId: 'r-2',
        },
      },
    ]
    const error = await rejection(registerRecruiter(payload))
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', requestId: 'r-2' })
    expect(error.fieldErrors).toEqual([{ field: 'phoneNumber', message: 'Enter a valid phone number.' }])
  })

  it.each([
    [409, 'ACCOUNT_ALREADY_REGISTERED'],
    [409, 'NAME_ALREADY_REGISTERED'],
    [409, 'ACCOUNT_IDENTITY_CONFLICT'],
    [400, 'INVALID_REQUEST'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [403, 'ACCOUNT_TYPE_MISMATCH'],
    [403, 'EMAIL_NOT_VERIFIED'],
    [403, 'GOOGLE_ACCOUNT_REQUIRED'],
    [500, 'INTERNAL_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('surfaces %i %s with its code intact', async (status, code) => {
    replies = [{ status, data: { success: false, code, message: `${code} text`, requestId: 'r' } }]
    const error = await rejection(registerRecruiter(payload))
    expect(error).toMatchObject({ status, code, message: `${code} text` })
  })

  it('never retries the POST, not even on a 503', async () => {
    replies = [
      { status: 503, data: { success: false, code: 'SERVICE_UNAVAILABLE' } },
      { status: 201, data: created },
    ]
    await rejection(registerRecruiter(payload))
    expect(requests).toHaveLength(1)
  })

  it('flags a lost response on a POST as possibly sent', async () => {
    replies = [{ status: 0, networkError: true }]
    const error = await rejection(registerRecruiter(payload))
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', possiblySent: true })
  })

  it('does not trigger the global 401 handler', async () => {
    const onUnauthorized = vi.fn()
    configureAuth({ getToken: () => null, onUnauthorized })
    replies = [{ status: 401, data: { success: false, code: 'UNAUTHORIZED' } }]
    await rejection(registerRecruiter(payload))
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('apiClient token handling (shared with the older dashboard APIs)', () => {
  it('awaits an async token provider and attaches the Bearer token', async () => {
    configureAuth({ getToken: async () => 'async-token' })
    replies = [{ status: 200, data: {} }]
    await apiClient.get('/api/v1/recruiter/students')
    expect(requests[0].headers.get('Authorization')).toBe('Bearer async-token')
  })

  it('does not override an explicit Authorization header', async () => {
    const getToken = vi.fn(async () => 'provider-token')
    configureAuth({ getToken })
    replies = [{ status: 200, data: {} }]
    await apiClient.get('/x', { headers: { Authorization: 'Bearer explicit' } })
    expect(requests[0].headers.get('Authorization')).toBe('Bearer explicit')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('still calls the global 401 handler for ordinary requests', async () => {
    const onUnauthorized = vi.fn()
    configureAuth({ getToken: () => null, onUnauthorized })
    replies = [{ status: 401, data: { success: false, error: 'UNAUTHORIZED' } }]
    await rejection(apiClient.get('/api/v1/recruiter/students'))
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('keeps reading the legacy { error } envelope', async () => {
    replies = [{ status: 400, data: { success: false, error: 'VALIDATION_ERROR', details: ['a'] } }]
    const error = await rejection(apiClient.get('/x'))
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', details: ['a'] })
  })
})
