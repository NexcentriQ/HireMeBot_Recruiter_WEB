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

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  details?: string[]
  /** True when the request may have reached the server even though no response was received. */
  possiblySent?: boolean

  constructor(opts: {
    message: string
    status: number
    code: ApiErrorCode
    details?: string[]
    possiblySent?: boolean
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.details = opts.details
    this.possiblySent = opts.possiblySent
  }
}

let tokenProvider: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function configureAuth(opts: {
  getToken: () => string | null
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

apiClient.interceptors.request.use((config) => {
  const devMode = isDevRecruiterMode()

  if (devMode) {
    // Local-dev-only identity. We intentionally do NOT also attach a
    // Bearer token in this mode — the backend's dev auth is header-based.
    config.headers = config.headers ?? {}
    config.headers['X-Dev-Recruiter-Id'] = String(env.devRecruiterId)
  } else {
    const token = tokenProvider()
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

interface BackendErrorBody {
  success?: boolean
  error?: string
  message?: string
  details?: string[]
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
    const body = error.response.data
    const code: ApiErrorCode =
      (body?.error as ApiErrorCode | undefined) ?? mapCodeFromStatus(status)

    if (status === 401) {
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
      })
    )
  }
)
