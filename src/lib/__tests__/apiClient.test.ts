import { describe, expect, it, vi, beforeEach } from 'vitest'

// vi.mock is hoisted; use vi.hoisted so the mutable mock state is lifted too.
const envMock = vi.hoisted(() => ({
  state: {
    isDevRecruiterMode: true,
  },
}))

vi.mock('@/lib/env', () => ({
  env: {
    useMockApi: false,
    apiBaseUrl: 'http://127.0.0.1:3000',
    devRecruiterId: '1000000001',
    cognito: {
      region: 'us-east-1',
      userPoolId: '',
      clientId: '',
      domain: '',
      redirectUri: '',
      logoutUri: '',
    },
  },
  isDevRecruiterMode: () => envMock.state.isDevRecruiterMode,
  cognitoIsConfigured: () => false,
  devRecruiterIdNumber: () => 1000000001,
}))

import { apiClient, configureAuth } from '../apiClient'

type Handlers = {
  handlers: Array<{ fulfilled: (c: unknown) => unknown }>
}

async function runRequestInterceptor(initialHeaders: Record<string, string> = {}) {
  const chain = apiClient.interceptors.request as unknown as Handlers
  const fulfilled = chain.handlers[0].fulfilled
  const out = (await fulfilled({ headers: { ...initialHeaders } })) as {
    headers: Record<string, string>
  }
  return out.headers
}

describe('apiClient header injection', () => {
  beforeEach(() => {
    envMock.state.isDevRecruiterMode = true
  })

  it('attaches X-Dev-Recruiter-Id when dev-recruiter mode is on', async () => {
    const headers = await runRequestInterceptor()
    expect(headers['X-Dev-Recruiter-Id']).toBe('1000000001')
    expect(headers.Authorization).toBeUndefined()
  })

  it('attaches Authorization when NOT in dev-recruiter mode and a token is present', async () => {
    envMock.state.isDevRecruiterMode = false
    configureAuth({ getToken: () => 'abc.def.ghi' })
    const headers = await runRequestInterceptor()
    expect(headers.Authorization).toBe('Bearer abc.def.ghi')
    expect(headers['X-Dev-Recruiter-Id']).toBeUndefined()
  })

  it('attaches neither when NOT in dev mode and no token is set', async () => {
    envMock.state.isDevRecruiterMode = false
    configureAuth({ getToken: () => null })
    const headers = await runRequestInterceptor()
    expect(headers.Authorization).toBeUndefined()
    expect(headers['X-Dev-Recruiter-Id']).toBeUndefined()
  })
})
