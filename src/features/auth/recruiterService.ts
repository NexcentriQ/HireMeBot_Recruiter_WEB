import { z } from 'zod'
import { apiClient, ApiError } from '@/lib/apiClient'
import type {
  RecruiterAccountLookup,
  RegisterRecruiterRequest,
  RegisterRecruiterResult,
} from '@/types/recruiterAuth'
import { getAuthHeaders } from './cognitoAuth'

/** Note the PLURAL `recruiters`: these are not the older `/recruiter/...` routes. */
export const RECRUITER_LOOKUP_PATH = '/api/v1/recruiters/auth/me'
export const RECRUITER_REGISTER_PATH = '/api/v1/recruiters/register'

/** Backoff for a 503 on the (safe, idempotent) lookup: 1 s, 2 s, then 4 s. */
export const LOOKUP_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000]

const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined)
const optionalBoolean = z
  .boolean()
  .nullish()
  .transform((v) => v ?? undefined)
const id = z.number().int().positive()

/**
 * Only the fields that decide access are strict. `RECRUITER_DASHBOARD` is
 * accepted solely for an ACTIVE RECRUITER; any other `nextStep` makes the
 * whole parse fail, so an unknown value can never open the dashboard.
 */
const lookupSchema = z.discriminatedUnion('nextStep', [
  z.object({
    success: z.literal(true),
    nextStep: z.literal('RECRUITER_DASHBOARD'),
    user: z.object({
      userId: id,
      recruiterId: id,
      firstName: optionalString,
      lastName: optionalString,
      email: optionalString,
      phoneNumber: optionalString,
      emailVerified: optionalBoolean,
      phoneVerified: optionalBoolean,
      accountStatus: z.literal('ACTIVE'),
      accountType: z.literal('RECRUITER'),
    }),
  }),
  z.object({
    success: z.literal(true),
    nextStep: z.literal('APPROVAL_PENDING'),
    message: optionalString,
  }),
  z.object({
    success: z.literal(true),
    nextStep: z.literal('RECRUITER_SIGNUP_FORM'),
    message: optionalString,
  }),
])

const registerSchema = z.object({
  success: z.literal(true),
  message: optionalString,
  data: z.object({
    userId: id,
    recruiterId: id,
    accountStatus: optionalString,
    // A registration never returns a dashboard step.
    nextStep: z.literal('APPROVAL_PENDING'),
  }),
})

function unexpectedResponse(what: string, status: number, data: unknown): ApiError {
  // Safe diagnostics only: never the body, which could hold personal data.
  const nextStep =
    data && typeof data === 'object' && 'nextStep' in data
      ? String((data as { nextStep: unknown }).nextStep).slice(0, 64)
      : undefined
  console.warn(`[recruiter-auth] Unexpected ${what} response`, { status, nextStep })
  return new ApiError({
    message: 'The server returned an unexpected response.',
    status,
    code: 'UNEXPECTED_RESPONSE',
  })
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function lookupOnce(): Promise<RecruiterAccountLookup> {
  // Fetched right before the request so Amplify can refresh an expiring token.
  const headers = await getAuthHeaders()
  const response = await apiClient.get<unknown>(RECRUITER_LOOKUP_PATH, {
    headers,
    skipUnauthorizedHandler: true,
    validateStatus: (status) => status === 200,
  })
  const parsed = lookupSchema.safeParse(response.data)
  if (!parsed.success) {
    throw unexpectedResponse('account lookup', response.status, response.data)
  }
  const { success: _success, ...result } = parsed.data
  return result
}

/**
 * GET /api/v1/recruiters/auth/me: who is this Google user, and where do they go?
 *
 * Sends only the Cognito ACCESS token (no email, id or query parameters).
 * A 503 is retried with bounded exponential backoff; everything else is thrown
 * as an {@link ApiError} carrying the HTTP status and the backend code.
 */
export async function lookupRecruiterAccount(
  options: { retryDelaysMs?: readonly number[] } = {}
): Promise<RecruiterAccountLookup> {
  const delays = options.retryDelaysMs ?? LOOKUP_RETRY_DELAYS_MS
  for (let attempt = 0; ; attempt++) {
    try {
      return await lookupOnce()
    } catch (error) {
      const retryable = error instanceof ApiError && error.code === 'SERVICE_UNAVAILABLE'
      if (!retryable || attempt >= delays.length) throw error
      await sleep(delays[attempt])
    }
  }
}

/**
 * POST /api/v1/recruiters/register. Never retried here: a failed POST may
 * still have created the account, so the caller resolves the outcome with
 * {@link lookupRecruiterAccount} instead.
 */
export async function registerRecruiter(
  payload: RegisterRecruiterRequest
): Promise<RegisterRecruiterResult> {
  const headers = await getAuthHeaders()
  // Rebuilt field by field: nothing but these four fields can be sent.
  const body: RegisterRecruiterRequest = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    phoneNumber: payload.phoneNumber,
    acceptedTerms: true,
  }
  const response = await apiClient.post<unknown>(RECRUITER_REGISTER_PATH, body, {
    headers,
    skipUnauthorizedHandler: true,
    validateStatus: (status) => status === 201,
  })
  const parsed = registerSchema.safeParse(response.data)
  if (!parsed.success) {
    throw unexpectedResponse('registration', response.status, response.data)
  }
  return { ...parsed.data.data, message: parsed.data.message }
}
