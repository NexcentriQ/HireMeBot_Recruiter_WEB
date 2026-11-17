import { beforeEach, describe, expect, it, vi } from 'vitest'

const configure = vi.hoisted(() => vi.fn())
vi.mock('aws-amplify', () => ({ Amplify: { configure } }))

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

describe('configureAmplify', () => {
  beforeEach(() => {
    configure.mockReset()
    envState.configured = true
    vi.resetModules()
  })

  it('configures the existing user pool for Google OAuth: code grant, openid + email only', async () => {
    const { configureAmplify, COGNITO_SCOPES } = await import('../amplifyConfig')
    expect(configureAmplify()).toBe(true)
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-east-2_F582IgoSY',
          userPoolClientId: '5rgjoisv64qhe70oulfla17id9',
          loginWith: {
            oauth: {
              domain: 'us-east-2f582igosy.auth.us-east-2.amazoncognito.com',
              scopes: ['openid', 'email'],
              redirectSignIn: ['http://localhost:5173/auth/callback'],
              redirectSignOut: ['http://localhost:5173/'],
              responseType: 'code',
            },
          },
        },
      },
    })
    expect(COGNITO_SCOPES).not.toContain('profile')
  })

  it('does not hold a client secret', async () => {
    const { configureAmplify } = await import('../amplifyConfig')
    configureAmplify()
    expect(JSON.stringify(configure.mock.calls)).not.toMatch(/secret/i)
  })

  it('configures once even if called repeatedly', async () => {
    const { configureAmplify } = await import('../amplifyConfig')
    configureAmplify()
    configureAmplify()
    expect(configure).toHaveBeenCalledTimes(1)
  })

  it('configures nothing when the Cognito variables are missing', async () => {
    envState.configured = false
    const { configureAmplify } = await import('../amplifyConfig')
    expect(configureAmplify()).toBe(false)
    expect(configure).not.toHaveBeenCalled()
  })
})
