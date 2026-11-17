import { beforeEach, describe, expect, it, vi } from 'vitest'

const amplify = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  hubCallback: null as null | ((msg: { payload: { event: string; data?: unknown } }) => void),
  configure: vi.fn(),
}))

vi.mock('aws-amplify', () => ({ Amplify: { configure: amplify.configure } }))
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: amplify.fetchAuthSession,
  signInWithRedirect: amplify.signInWithRedirect,
  signOut: amplify.signOut,
}))
vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: (_channel: string, cb: typeof amplify.hubCallback) => {
      amplify.hubCallback = cb
    },
  },
}))

const envState = vi.hoisted(() => ({ configured: true }))
vi.mock('@/lib/env', () => ({
  env: {
    cognito: {
      userPoolId: 'us-east-2_F582IgoSY',
      clientId: '5rgjoisv64qhe70oulfla17id9',
      domain: 'us-east-2f582igosy.auth.us-east-2.amazoncognito.com',
      redirectUri: 'http://localhost:5173/auth/callback',
      logoutUri: 'http://localhost:5173/',
    },
  },
  cognitoIsConfigured: () => envState.configured,
}))

import {
  continueWithGoogle,
  describeOAuthFailure,
  getAccessToken,
  getAuthHeaders,
  getRecordedOAuthFailure,
  getSessionIdentity,
  signOutOfCognito,
  subscribeToAuthEvents,
  type AuthEvent,
} from '../cognitoAuth'

function hub(event: string, data?: unknown) {
  amplify.hubCallback!({ payload: { event, data } })
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    userSub: 'sub-1',
    tokens: {
      accessToken: { toString: () => 'ACCESS.JWT', payload: { sub: 'sub-1' } },
      idToken: { toString: () => 'ID.JWT', payload: { email: 'me@gmail.com' } },
    },
    ...overrides,
  }
}

beforeEach(() => {
  amplify.fetchAuthSession.mockReset()
  amplify.signInWithRedirect.mockReset().mockResolvedValue(undefined)
  amplify.signOut.mockReset().mockResolvedValue(undefined)
  envState.configured = true
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('continueWithGoogle', () => {
  it('starts the Cognito Hosted UI flow for the Google provider', async () => {
    await expect(continueWithGoogle()).resolves.toBe('redirecting')
    expect(amplify.signInWithRedirect).toHaveBeenCalledTimes(1)
    expect(amplify.signInWithRedirect).toHaveBeenCalledWith({ provider: 'Google' })
  })

  it('reports an existing Amplify session instead of failing', async () => {
    amplify.signInWithRedirect.mockRejectedValue(
      Object.assign(new Error('There is already a signed in user.'), {
        name: 'UserAlreadyAuthenticatedException',
      })
    )
    await expect(continueWithGoogle()).resolves.toBe('already-signed-in')
  })

  it('explains an unregistered origin without leaking internals', async () => {
    amplify.signInWithRedirect.mockRejectedValue(
      Object.assign(new Error('internal detail'), { name: 'InvalidOriginException' })
    )
    const error = await continueWithGoogle().catch((e: Error) => e)
    expect((error as Error).message).toContain('http://localhost:5173')
    expect((error as Error).message).not.toContain('internal detail')
  })

  it('turns any other failure into a retryable message', async () => {
    amplify.signInWithRedirect.mockRejectedValue(new Error('boom'))
    await expect(continueWithGoogle()).rejects.toThrow(/could not start google sign-in/i)
  })
})

describe('getSessionIdentity / getAccessToken / getAuthHeaders', () => {
  it('returns the subject and (display-only) email, never a token', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session())
    const identity = await getSessionIdentity()
    expect(identity).toEqual({ sub: 'sub-1', email: 'me@gmail.com' })
    expect(JSON.stringify(identity)).not.toContain('JWT')
  })

  it('is null without tokens', async () => {
    amplify.fetchAuthSession.mockResolvedValue({})
    await expect(getSessionIdentity()).resolves.toBeNull()
    await expect(getAccessToken()).resolves.toBeNull()
  })

  it('is null (and does not call Amplify) when Cognito is not configured', async () => {
    envState.configured = false
    await expect(getSessionIdentity()).resolves.toBeNull()
    await expect(getAccessToken()).resolves.toBeNull()
    expect(amplify.fetchAuthSession).not.toHaveBeenCalled()
  })

  it('lets an unexpected failure (for example a network error) propagate as retryable', async () => {
    amplify.fetchAuthSession.mockRejectedValue(new Error('NetworkError'))
    await expect(getSessionIdentity()).rejects.toThrow('NetworkError')
    await expect(getAccessToken()).rejects.toThrow('NetworkError')
  })

  it('uses the ACCESS token (not the ID token) as the Bearer credential', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session())
    await expect(getAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer ACCESS.JWT' })
  })

  it('fetches the session on every call so Amplify can refresh it', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session())
    await getAuthHeaders()
    await getAuthHeaders()
    expect(amplify.fetchAuthSession).toHaveBeenCalledTimes(2)
  })

  it('throws NO_SESSION when there is nothing to send', async () => {
    amplify.fetchAuthSession.mockResolvedValue({ tokens: undefined })
    await expect(getAuthHeaders()).rejects.toThrow('NO_SESSION')
  })
})

describe('signOutOfCognito', () => {
  it('delegates to Amplify signOut (which clears tokens, then redirects through Cognito)', async () => {
    await signOutOfCognito()
    expect(amplify.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('Hub events', () => {
  it('records and emits a friendly message when the OAuth flow fails', () => {
    const events: AuthEvent[] = []
    const unsubscribe = subscribeToAuthEvents((e) => events.push(e))
    hub('signInWithRedirect_failure', {
      error: { name: 'OAuthSignInException', message: 'invalid_grant' },
    })
    expect(events).toEqual([
      { type: 'oauthFailure', message: 'We could not complete Google sign-in. Please try again.' },
    ])
    expect(getRecordedOAuthFailure()).toBe('We could not complete Google sign-in. Please try again.')
    unsubscribe()
  })

  it('shows a cancellation as a cancellation and hides the raw text', () => {
    hub('signInWithRedirect_failure', {
      error: { name: 'OAuthSignInException', message: 'User cancelled OAuth flow.' },
    })
    expect(getRecordedOAuthFailure()).toMatch(/cancelled/i)
    expect(getRecordedOAuthFailure()).not.toMatch(/OAuthSignInException|OAuth flow/)
  })

  it('remembers a failure that happened before anyone subscribed', () => {
    hub('signInWithRedirect_failure', { error: { name: 'X', message: 'access_denied' } })
    expect(getRecordedOAuthFailure()).toMatch(/cancelled/i)
  })

  it('a new sign-in attempt clears the recorded failure', async () => {
    hub('signInWithRedirect_failure', { error: { name: 'X', message: 'access_denied' } })
    await continueWithGoogle()
    expect(getRecordedOAuthFailure()).toBeNull()
  })

  it('emits signedOut', () => {
    const events: AuthEvent[] = []
    const unsubscribe = subscribeToAuthEvents((e) => events.push(e))
    hub('signedOut')
    expect(events).toEqual([{ type: 'signedOut' }])
    unsubscribe()
  })

  it.each(['NotAuthorizedException', 'TokenRevokedException', 'RefreshTokenReuseException'])(
    'a %s refresh failure ends the session',
    (name) => {
      const events: AuthEvent[] = []
      const unsubscribe = subscribeToAuthEvents((e) => events.push(e))
      hub('tokenRefresh_failure', { error: { name, message: 'x' } })
      expect(events).toEqual([{ type: 'sessionExpired' }])
      unsubscribe()
    }
  )

  it('a transient refresh failure (network, throttling) does NOT sign the user out', () => {
    const events: AuthEvent[] = []
    const unsubscribe = subscribeToAuthEvents((e) => events.push(e))
    hub('tokenRefresh_failure', { error: { name: 'NetworkError', message: 'offline' } })
    hub('tokenRefresh_failure', { error: { name: 'TooManyRequestsException', message: 'slow down' } })
    expect(events).toEqual([])
    unsubscribe()
  })

  it('stops delivering after unsubscribe', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeToAuthEvents(handler)
    unsubscribe()
    hub('signedOut')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('describeOAuthFailure', () => {
  it.each(['access_denied', 'User cancelled OAuth flow.', 'Permission denied'])(
    'treats "%s" as a cancellation',
    (text) => {
      expect(describeOAuthFailure(text)).toMatch(/cancelled/i)
    }
  )
  it('uses a generic message for anything else', () => {
    expect(describeOAuthFailure('invalid_grant')).toBe(
      'We could not complete Google sign-in. Please try again.'
    )
  })
})
