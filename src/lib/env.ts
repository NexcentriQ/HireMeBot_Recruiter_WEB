/**
 * Mock mode is a local-development convenience that auto-authenticates a
 * fake recruiter. It must never switch itself on in a production build, so an
 * UNSET `VITE_USE_MOCK_API` means "off" there (and "on" in dev/test, as before).
 * An explicit `VITE_USE_MOCK_API=true` is still honoured everywhere.
 */
function resolveUseMockApi(): boolean {
  const raw = import.meta.env.VITE_USE_MOCK_API
  if (raw === undefined || raw === '') return !import.meta.env.PROD
  return String(raw).toLowerCase() === 'true'
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  useMockApi: resolveUseMockApi(),
  /**
   * Local-dev-only numeric recruiter identity used by the backend when
   * ALLOW_DEV_RECRUITER_HEADER=true. Sent as the X-Dev-Recruiter-Id header
   * ONLY when:
   *   - VITE_USE_MOCK_API is false (real backend mode), AND
   *   - Vite is running in dev mode (import.meta.env.DEV), AND
   *   - this value is a positive safe integer string.
   * It is NEVER sent in production builds.
   */
  devRecruiterId: import.meta.env.VITE_DEV_RECRUITER_ID ?? '',
  cognito: {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
    domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
    /** Must be registered as an allowed callback URL on the Cognito app client. */
    redirectUri:
      import.meta.env.VITE_COGNITO_REDIRECT_URL ??
      import.meta.env.VITE_COGNITO_REDIRECT_URI ??
      `${window.location.origin}/auth/callback`,
    /** Must be registered as an allowed sign-out URL on the Cognito app client. */
    logoutUri:
      import.meta.env.VITE_COGNITO_SIGNOUT_URL ??
      import.meta.env.VITE_COGNITO_LOGOUT_URI ??
      `${window.location.origin}/`,
  },
  /**
   * Optional link to the recruiter Terms and Conditions shown on the
   * registration form. When unset the form shows the label without a link.
   */
  termsUrl: import.meta.env.VITE_TERMS_URL ?? '',
} as const

export function cognitoIsConfigured(): boolean {
  const c = env.cognito
  return Boolean(c.userPoolId && c.clientId && c.domain)
}

/**
 * True when the frontend is wired to the real backend using the local
 * ALLOW_DEV_RECRUITER_HEADER mechanism, instead of real Cognito auth.
 */
export function isDevRecruiterMode(): boolean {
  if (env.useMockApi) return false
  if (!import.meta.env.DEV) return false
  const raw = env.devRecruiterId
  if (!raw) return false
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0
}

/**
 * How the app establishes who the recruiter is:
 *  - `mock`       in-memory demo data, no auth at all (local only)
 *  - `dev-header` real local backend via X-Dev-Recruiter-Id (local only)
 *  - `cognito`    Google sign-in through Cognito; the backend account lookup
 *                 decides what the user may see
 */
export type AuthMode = 'mock' | 'dev-header' | 'cognito'

export function getAuthMode(): AuthMode {
  if (env.useMockApi) return 'mock'
  if (isDevRecruiterMode()) return 'dev-header'
  return 'cognito'
}
