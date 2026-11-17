import axios, { AxiosError, type AxiosInstance } from 'axios'
import { env, isDevRecruiterMode } from './env'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'
  // Recruiter sign-in / registration contract (RECRUITER_AUTH_API.md).
  | 'VALIDATION_FAILED'
  | 'INVALID_REQUEST'
  | 'EMAIL_NOT_VERIFIED'
  | 'GOOGLE_ACCOUNT_REQUIRED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'ACCOUNT_TYPE_MISMATCH'
  | 'ACCOUNT_ALREADY_REGISTERED'
  | 'ACCOUNT_IDENTITY_CONFLICT'
  | 'NAME_ALREADY_REGISTERED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  // A 2xx response whose body did not match the documented shape.
  | 'UNEXPECTED_RESPONSE'

export interface ApiFieldError {
  field: string
  message: string
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Set by callers that resolve a 401 themselves (the recruiter account
     * lookup and registration). Skips the global `onUnauthorized` callback so
     * a 401 is not handled twice.
     */
    skipUnauthorizedHandler?: boolean
  }
}

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  details?: string[]
  /** True when the request may have reached the server even though no response was received. */
  possiblySent?: boolean
  /** Correlation id from the backend error envelope, safe to show to the user. */
  requestId?: string
  /** Per-field validation messages (`VALIDATION_FAILED`). */
  fieldErrors?: ApiFieldError[]
  /**
   * The error code the backend actually sent in the body. Unset when `code`
   * was derived from the HTTP status, e.g. API Gateway's `{"message":"Forbidden"}`.
   */
  backendCode?: string

  constructor(opts: {
    message: string
    status: number
    code: ApiErrorCode
    details?: string[]
    possiblySent?: boolean
    requestId?: string
    fieldErrors?: ApiFieldError[]
    backendCode?: string
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.details = opts.details
    this.possiblySent = opts.possiblySent
    this.requestId = opts.requestId
    this.fieldErrors = opts.fieldErrors
    this.backendCode = opts.backendCode
  }
}

type TokenResult = string | null | Promise<string | null>

let tokenProvider: () => TokenResult = () => null
let onUnauthorized: () => void = () => {}

export function configureAuth(opts: {
  /** May be async: Amplify refreshes an expiring access token on demand. */
  getToken: () => TokenResult
  onUnauthorized?: () => void
}) {
  tokenProvider = opts.getToken
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl || undefined,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

function hasHeader(headers: unknown, name: string): boolean {
  if (!headers || typeof headers !== 'object') return false
  return Object.keys(headers).some((k) => k.toLowerCase() === name)
}

apiClient.interceptors.request.use(async (config) => {
  // An explicit Authorization header (the recruiter account lookup and
  // registration attach their own Cognito access token) always wins and is
  // never combined with the dev header.
  if (hasHeader(config.headers, 'authorization')) return config

  const devMode = isDevRecruiterMode()

  if (devMode) {
    // Local-dev-only identity. We intentionally do NOT also attach a
    // Bearer token in this mode — the backend's dev auth is header-based.
    config.headers = config.headers ?? {}
    config.headers['X-Dev-Recruiter-Id'] = String(env.devRecruiterId)
  } else {
    const token = await tokenProvider()
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

function mapCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 500:
      return 'INTERNAL_ERROR'
    case 503:
      return 'SERVICE_UNAVAILABLE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Two backend error envelopes exist (RECRUITER_AUTH_API.md section 11):
 *  - recruiter auth endpoints: { success:false, code, message, requestId, fieldErrors? }
 *  - older recruiter/student/document APIs: { success:false, error, message?, details? }
 * API Gateway's own 401/403 are just { message } with no code at all.
 */
interface BackendErrorBody {
  success?: boolean
  code?: string
  error?: string
  message?: string
  details?: string[]
  requestId?: string
  fieldErrors?: unknown
}

function parseFieldErrors(value: unknown): ApiFieldError[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: ApiFieldError[] = []
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as ApiFieldError).field === 'string' &&
      typeof (item as ApiFieldError).message === 'string'
    ) {
      out.push({
        field: (item as ApiFieldError).field,
        message: (item as ApiFieldError).message,
      })
    }
  }
  return out.length > 0 ? out : undefined
}

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<BackendErrorBody>) => {
    // No response: network failure, CORS, DNS, or server unreachable.
    if (!error.response) {
      const possiblySent =
        error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED'
          ? false
          : // POST timeouts/connection resets may have reached the server.
            ['post', 'put', 'patch', 'delete'].includes(
              String(error.config?.method ?? '').toLowerCase()
            )
      return Promise.reject(
        new ApiError({
          message:
            'Unable to connect to the application service. Check your connection and try again.',
          status: 0,
          code: 'NETWORK_ERROR',
          possiblySent,
        })
      )
    }

    const status = error.response.status
    const raw = error.response.data
    const body: BackendErrorBody | undefined =
      raw && typeof raw === 'object' ? raw : undefined
    const backendCode =
      typeof body?.code === 'string' && body.code
        ? body.code
        : typeof body?.error === 'string' && body.error
          ? body.error
          : undefined
    const code: ApiErrorCode =
      (backendCode as ApiErrorCode | undefined) ?? mapCodeFromStatus(status)

    if (status === 401 && !error.config?.skipUnauthorizedHandler) {
      // Only trigger session invalidation outside of dev-recruiter header mode.
      // In dev mode a 401 means the dev header was rejected, not that a user session expired.
      if (!isDevRecruiterMode()) onUnauthorized()
    }

    return Promise.reject(
      new ApiError({
        message:
          body?.message ||
          body?.error ||
          error.message ||
          'Unexpected API error',
        status,
        code,
        details: Array.isArray(body?.details) ? body?.details : undefined,
        requestId:
          typeof body?.requestId === 'string' ? body.requestId : undefined,
        fieldErrors: parseFieldErrors(body?.fieldErrors),
        backendCode,
      })
    )
  }
)
