export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  useMockApi:
    String(import.meta.env.VITE_USE_MOCK_API ?? 'true').toLowerCase() ===
    'true',
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
    region: import.meta.env.VITE_COGNITO_REGION ?? 'us-east-1',
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
    domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
    redirectUri:
      import.meta.env.VITE_COGNITO_REDIRECT_URI ??
      `${window.location.origin}/auth/callback`,
    logoutUri:
      import.meta.env.VITE_COGNITO_LOGOUT_URI ??
      `${window.location.origin}/login`,
  },
} as const

export function cognitoIsConfigured(): boolean {
  const c = env.cognito
  return Boolean(c.domain && c.clientId)
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

export function devRecruiterIdNumber(): number | null {
  const n = Number(env.devRecruiterId)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
