import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Runs the REAL aws-amplify (nothing about Amplify is mocked) in jsdom with only
 * Cognito's token endpoint faked, to check the assumptions the auth flow is
 * built on: the authorize request, that the session wait blocks until the code
 * exchange finishes, how failures and cancellations surface, and what sign-out
 * does. Google and Cognito themselves are not involved.
 */

const ORIGIN = window.location.origin
const REDIRECT = `${ORIGIN}/auth/callback`
const LOGOUT = `${ORIGIN}/`
const DOMAIN = 'us-east-2f582igosy.auth.us-east-2.amazoncognito.com'
const CLIENT_ID = '5rgjoisv64qhe70oulfla17id9'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload: Record<string, unknown>) =>
  `${b64({ alg: 'RS256', kid: 'k' })}.${b64(payload)}.signature`

const now = Math.floor(Date.now() / 1000)
const ACCESS = jwt({
  sub: 'google-sub-123',
  username: 'google_123',
  token_use: 'access',
  scope: 'openid email',
  iat: now,
  exp: now + 3600,
  client_id: CLIENT_ID,
})
const ID = jwt({
  sub: 'google-sub-123',
  'cognito:username': 'google_123',
  token_use: 'id',
  email: 'new.recruiter@gmail.com',
  email_verified: true,
  iat: now,
  exp: now + 3600,
  aud: CLIENT_ID,
})
const TOKEN_REPLY = {
  access_token: ACCESS,
  id_token: ID,
  refresh_token: 'refresh-token-value',
  expires_in: 3600,
  token_type: 'Bearer',
}

const sleep = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// The first import of aws-amplify in a worker is slow (module transform), not hung.
vi.setConfig({ testTimeout: 30_000 })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** A fresh JS context, as after a full page load: new Amplify singleton, same browser storage. */
async function freshPage() {
  vi.resetModules()
  vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-2_F582IgoSY')
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('VITE_COGNITO_DOMAIN', DOMAIN)
  vi.stubEnv('VITE_COGNITO_REDIRECT_URL', REDIRECT)
  vi.stubEnv('VITE_COGNITO_SIGNOUT_URL', LOGOUT)
  const { configureAmplify } = await import('../amplifyConfig')
  const cognito = await import('../cognitoAuth')
  const amplifyAuth = await import('aws-amplify/auth')

  /**
   * main.tsx configures Amplify, then React renders and AuthProvider's boot
   * effect asks for the session. React schedules that work in a LATER task, so
   * Amplify's all-microtask failure path (an ?error= redirect needs no network)
   * has finished before boot runs. Model that gap.
   */
  async function bootLikeTheApp() {
    configureAmplify()
    await sleep(0)
  }
  return { configureAmplify, bootLikeTheApp, cognito, amplifyAuth }
}

/** Start sign-in with the real Amplify and capture the authorize URL instead of navigating. */
async function startSignIn(amplifyAuth: typeof import('aws-amplify/auth')) {
  let authorizeUrl = ''
  await amplifyAuth.signInWithRedirect({
    provider: 'Google',
    options: {
      authSessionOpener: async (url: string) => {
        authorizeUrl = url
        return undefined as never
      },
    },
  })
  return new URL(authorizeUrl)
}

let tokenRequests: { url: string; body: URLSearchParams }[]

function fakeTokenEndpoint(reply: () => Promise<unknown> | unknown) {
  tokenRequests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      tokenRequests.push({ url, body: new URLSearchParams(init.body) })
      return { json: async () => reply() }
    })
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/login')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {}) // jsdom: "navigation not implemented"
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('real Amplify: the authorize request', () => {
  it('asks Cognito for Google with the code grant, PKCE and only the openid + email scopes', async () => {
    const { configureAmplify, amplifyAuth } = await freshPage()
    expect(configureAmplify()).toBe(true)

    const url = await startSignIn(amplifyAuth)

    expect(url.origin).toBe(`https://${DOMAIN}`)
    expect(url.pathname).toBe('/oauth2/authorize')
    const q = url.searchParams
    expect(q.get('identity_provider')).toBe('Google')
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe('openid email')
    expect(q.get('client_id')).toBe(CLIENT_ID)
    expect(q.get('redirect_uri')).toBe(REDIRECT)
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toBeTruthy()
    expect(q.get('state')).toBeTruthy() // Amplify owns state/PKCE: we never touch them
  })
})

describe('real Amplify: returning from Cognito', () => {
  /** Run the first half (leave the app), then "reload" onto the callback URL. */
  async function returnWith(search: (state: string) => string) {
    const first = await freshPage()
    first.configureAmplify()
    const url = await startSignIn(first.amplifyAuth)
    const state = url.searchParams.get('state')!
    const codeChallenge = url.searchParams.get('code_challenge')!
    window.history.pushState({}, '', `/auth/callback${search(state)}`)
    return { state, codeChallenge, page: await freshPage() }
  }

  it('the session wait blocks until the code exchange finishes, then yields the session', async () => {
    const exchange = deferred<typeof TOKEN_REPLY>()
    fakeTokenEndpoint(() => exchange.promise)
    const { page } = await returnWith((state) => `?code=abc123&state=${state}`)
    const events: string[] = []
    page.cognito.subscribeToAuthEvents((e) => events.push(e.type))

    await page.bootLikeTheApp() // main.tsx configures Amplify, which starts the exchange
    const identity = page.cognito.getSessionIdentity() // then AuthProvider's boot asks for the session

    let settled = false
    void identity.then(() => {
      settled = true
    })
    await sleep(60)
    expect(settled).toBe(false) // nothing is looked up while the exchange is in flight
    expect(tokenRequests).toHaveLength(1)

    exchange.resolve(TOKEN_REPLY)
    await expect(identity).resolves.toEqual({
      sub: 'google-sub-123',
      email: 'new.recruiter@gmail.com',
    })

    // Exactly one token request, the authorization-code grant with the PKCE verifier.
    expect(tokenRequests).toHaveLength(1)
    expect(tokenRequests[0].url).toBe(`https://${DOMAIN}/oauth2/token`)
    const body = tokenRequests[0].body
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc123')
    expect(body.get('client_id')).toBe(CLIENT_ID)
    expect(body.get('redirect_uri')).toBe(REDIRECT)
    expect(body.get('code_verifier')).toBeTruthy()
    expect(events).not.toContain('oauthFailure')

    // Amplify strips ?code=&state= from the address bar after a successful exchange.
    expect(window.location.search).toBe('')
  })

  it('calls the API with the ACCESS token, never the ID token', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith((state) => `?code=abc123&state=${state}`)
    await page.bootLikeTheApp()
    await page.cognito.getSessionIdentity()

    const headers = await page.cognito.getAuthHeaders()
    expect(headers).toEqual({ Authorization: `Bearer ${ACCESS}` })
    expect(headers.Authorization).not.toContain(ID)
    await expect(page.cognito.getAccessToken()).resolves.toBe(ACCESS)
  })

  it('keeps tokens only in Amplify storage: nothing token-like is written by this app', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith((state) => `?code=abc123&state=${state}`)
    await page.bootLikeTheApp()
    await page.cognito.getSessionIdentity()

    const keys = Object.keys(localStorage)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((k) => k.startsWith('CognitoIdentityServiceProvider.'))).toBe(true)
    expect(localStorage.getItem('hmb.session')).toBeNull()
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toMatch(/eyJ|refresh-token/)
  })

  it('a refused code exchange becomes no session plus a recoverable failure', async () => {
    fakeTokenEndpoint(() => ({ error: 'invalid_grant' }))
    const { page } = await returnWith((state) => `?code=used-already&state=${state}`)
    const events: { type: string; message?: string }[] = []
    page.cognito.subscribeToAuthEvents((e) => events.push(e))

    await page.bootLikeTheApp()
    await expect(page.cognito.getSessionIdentity()).resolves.toBeNull()
    await sleep(0) // AuthProvider's boot yields one macrotask here before reading the failure

    expect(events).toEqual([
      { type: 'oauthFailure', message: 'We could not complete Google sign-in. Please try again.' },
    ])
    expect(page.cognito.getRecordedOAuthFailure()).toBe(
      'We could not complete Google sign-in. Please try again.'
    )
  })

  it('a cancelled Google sign-in (?error=access_denied) is reported as a cancellation', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith(
      (state) => `?error=access_denied&error_description=Permission+denied&state=${state}`
    )
    await page.bootLikeTheApp()

    await expect(page.cognito.getSessionIdentity()).resolves.toBeNull()
    await sleep(0)
    expect(page.cognito.getRecordedOAuthFailure()).toMatch(/cancelled/i)
    expect(tokenRequests).toHaveLength(0) // no code, so nothing to exchange
  })

  it('a callback whose state does not match the one we started is rejected', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith(() => `?code=abc123&state=forged-state`)
    await page.bootLikeTheApp()

    await expect(page.cognito.getSessionIdentity()).resolves.toBeNull()
    await sleep(0)
    expect(page.cognito.getRecordedOAuthFailure()).toBeTruthy()
    expect(tokenRequests).toHaveLength(0) // the code is never exchanged
  })

  it('opening /auth/callback with no sign-in in progress is just "no session"', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    window.history.pushState({}, '', '/auth/callback')
    const page = await freshPage()
    await page.bootLikeTheApp()

    await expect(page.cognito.getSessionIdentity()).resolves.toBeNull()
    await sleep(0)
    expect(page.cognito.getRecordedOAuthFailure()).toBeNull()
    expect(tokenRequests).toHaveLength(0)
  })

  it('signing out clears the session locally and reports it', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith((state) => `?code=abc123&state=${state}`)
    await page.bootLikeTheApp()
    await page.cognito.getSessionIdentity()
    const events: string[] = []
    page.cognito.subscribeToAuthEvents((e) => events.push(e.type))

    await page.cognito.signOutOfCognito() // Amplify then navigates to Cognito's /logout (not implemented in jsdom)

    await expect(page.cognito.getSessionIdentity()).resolves.toBeNull()
    await expect(page.cognito.getAccessToken()).resolves.toBeNull()
    await expect(page.cognito.getAuthHeaders()).rejects.toThrow('NO_SESSION')
    expect(events).toContain('signedOut')
    expect(Object.keys(localStorage).filter((k) => k.endsWith('.accessToken'))).toEqual([])
  })

  it('a second sign-in attempt while a session exists is reported, not redirected', async () => {
    fakeTokenEndpoint(() => TOKEN_REPLY)
    const { page } = await returnWith((state) => `?code=abc123&state=${state}`)
    await page.bootLikeTheApp()
    await page.cognito.getSessionIdentity()

    await expect(page.cognito.continueWithGoogle()).resolves.toBe('already-signed-in')
  })
})
