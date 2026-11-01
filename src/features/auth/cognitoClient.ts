import { env } from '@/lib/env'

const STORAGE_KEYS = {
  pkceVerifier: 'hmb.pkce.verifier',
  pkceState: 'hmb.pkce.state',
  session: 'hmb.session',
} as const

export interface CognitoTokens {
  accessToken: string
  idToken: string
  refreshToken?: string
  expiresAt: number
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return base64UrlEncode(arr)
}

/**
 * Build the Cognito Hosted UI /oauth2/authorize URL with PKCE,
 * forcing Google as the identity provider.
 */
export async function buildGoogleLoginUrl(): Promise<string> {
  const { domain, clientId, redirectUri } = env.cognito
  if (!domain || !clientId) {
    throw new Error('Cognito is not configured.')
  }

  const verifier = randomString(32)
  const challenge = base64UrlEncode(await sha256(verifier))
  const state = randomString(16)

  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier)
  sessionStorage.setItem(STORAGE_KEYS.pkceState, state)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    identity_provider: 'Google',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })

  return `https://${domain}/oauth2/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<CognitoTokens> {
  const { domain, clientId, redirectUri } = env.cognito
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.pkceState)
  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier)
  if (!expectedState || expectedState !== state) {
    throw new Error('Invalid OAuth state. Please sign in again.')
  }
  if (!verifier) {
    throw new Error('Missing PKCE verifier. Please sign in again.')
  }
  sessionStorage.removeItem(STORAGE_KEYS.pkceState)
  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  const res = await fetch(`https://${domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}).`)
  }
  const data = (await res.json()) as {
    access_token: string
    id_token: string
    refresh_token?: string
    expires_in: number
  }

  const tokens: CognitoTokens = {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  persistSession(tokens)
  return tokens
}

export function persistSession(tokens: CognitoTokens) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(tokens))
}

export function readSession(): CognitoTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CognitoTokens
    if (!parsed.accessToken || !parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session)
}

export function buildLogoutUrl(): string | null {
  const { domain, clientId, logoutUri } = env.cognito
  if (!domain || !clientId) return null
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  })
  return `https://${domain}/logout?${params.toString()}`
}

/**
 * Decode the JWT payload — used only for display claims (name/email).
 * The backend remains responsible for authoritative token verification.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(
  jwt: string
): T | null {
  try {
    const [, payload] = jwt.split('.')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return JSON.parse(atob(padded)) as T
  } catch {
    return null
  }
}
