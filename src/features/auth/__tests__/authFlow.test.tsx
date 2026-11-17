import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/env', async () => (await import('./authMocks')).envModule)
vi.mock('../cognitoAuth', async () => (await import('./authMocks')).cognitoModule)
vi.mock('../recruiterService', async () => (await import('./authMocks')).service)
vi.mock('@/features/applications/CreateApplicationPage', async () => {
  const { createElement } = await import('react')
  return {
    CreateApplicationPage: () => createElement('div', null, 'Create application workspace'),
  }
})

import { apiError } from './apiErrors'
import {
  ACTIVE_LOOKUP,
  cognito,
  emitAuthEvent,
  PENDING_LOOKUP,
  resetAuthMocks,
  service,
  SIGNUP_LOOKUP,
  SUB,
} from './authMocks'
import { renderApp } from './renderApp'
import { loadDraft, saveDraft } from '../registrationDraft'

const lookup = service.lookupRecruiterAccount

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const workspace = () => screen.queryByText('Create application workspace')
const signInButton = () => screen.findByRole('button', { name: /continue with google/i })

beforeEach(() => {
  resetAuthMocks()
  sessionStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('Scenario C: approved recruiter', () => {
  it('opens the existing workspace, with the profile taken from the backend lookup', async () => {
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    const router = renderApp('/auth/callback')

    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/applications/new')
    expect((await screen.findAllByText('Alex Smith')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('recruiter@gmail.com').length).toBeGreaterThan(0)
  })

  it('waits for the Cognito session (OAuth exchange) before running the lookup', async () => {
    const session = deferred<{ sub: string }>()
    cognito.getSessionIdentity.mockReturnValue(session.promise)
    lookup.mockResolvedValue(ACTIVE_LOOKUP)

    renderApp('/auth/callback')
    expect(await screen.findByText(/completing sign-in/i)).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
    expect(workspace()).not.toBeInTheDocument()

    await act(async () => session.resolve({ sub: SUB }))
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(cognito.getSessionIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      lookup.mock.invocationCallOrder[0]
    )
  })

  it('a browser refresh on the workspace re-asks the backend and restores access', async () => {
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it.each(['/register', '/pending', '/restricted', '/access-denied', '/login', '/auth/callback'])(
    'direct navigation to %s sends an approved recruiter to the workspace',
    async (path) => {
      lookup.mockResolvedValue(ACTIVE_LOOKUP)
      const router = renderApp(path)
      expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/applications/new')
    }
  )

  it('is checked by the backend on every start, not by a stored flag', async () => {
    localStorage.setItem('isApproved', 'true')
    sessionStorage.setItem('isApproved', 'true')
    lookup.mockResolvedValue(PENDING_LOOKUP)
    renderApp('/applications/new')
    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
  })
})

describe('Scenario A: new recruiter', () => {
  it('shows the registration form and nothing else happens automatically', async () => {
    lookup.mockResolvedValue(SIGNUP_LOOKUP)
    const router = renderApp('/auth/callback')

    expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/register')
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /terms and conditions/i })).toBeInTheDocument()

    // Never asks for Gmail; the Google address is shown read-only.
    expect(document.querySelector('input[type="email"]')).toBeNull()
    expect(screen.queryByLabelText(/e-?mail|gmail/i)).toBeNull()
    expect(screen.getByText('recruiter@gmail.com')).toBeInTheDocument()

    // The session is kept: no second trip to Google, no automatic registration.
    expect(cognito.continueWithGoogle).not.toHaveBeenCalled()
    expect(service.registerRecruiter).not.toHaveBeenCalled()
    expect(workspace()).not.toBeInTheDocument()
  })

  it('cannot reach the workspace without registering and being approved', async () => {
    lookup.mockResolvedValue(SIGNUP_LOOKUP)
    const router = renderApp('/applications/new')
    expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/register')
    expect(workspace()).not.toBeInTheDocument()

    await router.navigate('/pending')
    expect(router.state.location.pathname).toBe('/register')
  })
})

describe('Scenario B: returning pending recruiter', () => {
  it('lands on the waiting screen, never the signup form or the workspace', async () => {
    lookup.mockResolvedValue(PENDING_LOOKUP)
    const router = renderApp('/auth/callback')

    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pending')
    expect(screen.getByText(/waiting\s+for approval/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
    expect(workspace()).not.toBeInTheDocument()
    expect(service.registerRecruiter).not.toHaveBeenCalled()
  })

  it.each(['/applications/new', '/', '/register', '/some/unknown/path'])(
    'direct navigation to %s is sent back to the waiting screen',
    async (path) => {
      lookup.mockResolvedValue(PENDING_LOOKUP)
      const router = renderApp(path)
      expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/pending')
      expect(workspace()).not.toBeInTheDocument()
    }
  )

  it('offers only Check again and Sign out: no approve control', async () => {
    lookup.mockResolvedValue(PENDING_LOOKUP)
    renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })
    expect(screen.getByRole('button', { name: /check again/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

describe('Scenario D: Check again', () => {
  it('moves to the workspace once the owner has approved the account', async () => {
    const user = userEvent.setup()
    lookup.mockResolvedValueOnce(PENDING_LOOKUP).mockResolvedValueOnce(ACTIVE_LOOKUP)
    const router = renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    await user.click(screen.getByRole('button', { name: /check again/i }))

    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/applications/new')
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('stays put, says so, and does not poll when still pending', async () => {
    const user = userEvent.setup()
    lookup.mockResolvedValue(PENDING_LOOKUP)
    renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    await user.click(screen.getByRole('button', { name: /check again/i }))

    expect(await screen.findByText(/still waiting for approval/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check again/i })).toBeEnabled()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(lookup).toHaveBeenCalledTimes(2) // boot + the one click
  })

  it('is disabled while checking, so a double click makes one request', async () => {
    const user = userEvent.setup()
    lookup.mockResolvedValueOnce(PENDING_LOOKUP)
    renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    const second = deferred<typeof PENDING_LOOKUP>()
    lookup.mockReturnValueOnce(second.promise)
    await user.dblClick(screen.getByRole('button', { name: /check again/i }))

    expect(await screen.findByRole('button', { name: /checking/i })).toBeDisabled()
    expect(lookup).toHaveBeenCalledTimes(2)
    await act(async () => second.resolve(PENDING_LOOKUP))
    expect(await screen.findByRole('button', { name: /check again/i })).toBeEnabled()
  })

  it('shows a failed check on the page without discarding the pending state', async () => {
    const user = userEvent.setup()
    lookup
      .mockResolvedValueOnce(PENDING_LOOKUP)
      .mockRejectedValueOnce(apiError('SERVICE_UNAVAILABLE', 503, { requestId: 'req-503' }))
    const router = renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    await user.click(screen.getByRole('button', { name: /check again/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/temporarily unavailable/i)
    expect(alert).toHaveTextContent('req-503')
    expect(router.state.location.pathname).toBe('/pending')
    expect(screen.getByRole('button', { name: /check again/i })).toBeEnabled()
  })

  it('goes to the restricted screen if the account was suspended meanwhile', async () => {
    const user = userEvent.setup()
    lookup
      .mockResolvedValueOnce(PENDING_LOOKUP)
      .mockRejectedValueOnce(apiError('ACCOUNT_SUSPENDED', 403, { message: 'Your recruiter account has been suspended.' }))
    const router = renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    await user.click(screen.getByRole('button', { name: /check again/i }))

    expect(await screen.findByRole('heading', { name: /account suspended/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/restricted')
  })

  it('Sign out signs out of Cognito and returns to the login page', async () => {
    const user = userEvent.setup()
    lookup.mockResolvedValue(PENDING_LOOKUP)
    const router = renderApp('/pending')
    await screen.findByRole('heading', { name: /registration submitted/i })

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})

describe('Scenarios E and F: restricted accounts', () => {
  it.each([
    ['ACCOUNT_SUSPENDED', 403, /account suspended/i, 'Your recruiter account has been suspended.'],
    ['ACCOUNT_DELETED', 403, /account unavailable/i, 'This account is unavailable.'],
    [
      'ACCOUNT_TYPE_MISMATCH',
      403,
      /different account type/i,
      'This Google account is already associated with another HireMeBot account type.',
    ],
    [
      'ACCOUNT_IDENTITY_CONFLICT',
      409,
      /email already in use/i,
      'This email is already associated with another HireMeBot account.',
    ],
    ['EMAIL_NOT_VERIFIED', 403, /verified email required/i, 'Google did not provide a verified email.'],
  ])('%s shows the restricted screen with the server message', async (code, status, heading, message) => {
    lookup.mockRejectedValue(apiError(code, status, { message, requestId: 'req-77' }))
    const router = renderApp('/auth/callback')

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/restricted')
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByText(/req-77/)).toBeInTheDocument()

    // Never the registration form or the dashboard.
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
    expect(workspace()).not.toBeInTheDocument()
    expect(service.registerRecruiter).not.toHaveBeenCalled()

    await router.navigate('/register')
    expect(router.state.location.pathname).toBe('/restricted')
    await router.navigate('/applications/new')
    expect(router.state.location.pathname).toBe('/restricted')
  })

  it('the legacy /access-denied route lands on /restricted', async () => {
    lookup.mockRejectedValue(apiError('ACCOUNT_SUSPENDED', 403))
    const router = renderApp('/access-denied')
    expect(await screen.findByRole('heading', { name: /account suspended/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/restricted')
  })

  it('Sign out is the way to try another Google account', async () => {
    const user = userEvent.setup()
    lookup.mockRejectedValue(apiError('ACCOUNT_TYPE_MISMATCH', 403))
    renderApp('/auth/callback')
    await screen.findByRole('heading', { name: /different account type/i })

    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
    expect(await signInButton()).toBeInTheDocument()
  })

  it('clears a registration draft when the account turns out to be restricted', async () => {
    saveDraft(SUB, { firstName: 'A', lastName: 'B', phoneNumber: '+1', acceptedTerms: false })
    lookup.mockRejectedValue(apiError('ACCOUNT_IDENTITY_CONFLICT', 409))
    renderApp('/auth/callback')
    await screen.findByRole('heading', { name: /email already in use/i })
    expect(loadDraft(SUB)).toBeNull()
  })
})

describe('session problems (401 / 403 without a code / non-Google sign-in)', () => {
  it('UNAUTHORIZED signs out and explains why on the login page', async () => {
    lookup.mockRejectedValue(apiError('UNAUTHORIZED', 401))
    const router = renderApp('/auth/callback')

    expect(await signInButton()).toBeInTheDocument()
    expect(screen.getByText(/your session has ended/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
    // No automatic bounce to Google: only an explicit click starts sign-in.
    expect(cognito.continueWithGoogle).not.toHaveBeenCalled()
  })

  it.each([401, 403])("API Gateway's code-less %i is handled like UNAUTHORIZED, without looping", async (status) => {
    lookup.mockRejectedValue(
      apiError(status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', status, { backendCode: null })
    )
    renderApp('/auth/callback')
    expect(await signInButton()).toBeInTheDocument()
    expect(screen.getByText(/your session has ended/i)).toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(cognito.continueWithGoogle).not.toHaveBeenCalled()
  })

  it('GOOGLE_ACCOUNT_REQUIRED signs out and asks for Continue with Google', async () => {
    lookup.mockRejectedValue(apiError('GOOGLE_ACCOUNT_REQUIRED', 403))
    renderApp('/auth/callback')
    expect(await signInButton()).toBeInTheDocument()
    expect(screen.getByText(/recruiters sign in with google/i)).toBeInTheDocument()
    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
  })

  it('keeps a registration draft across an expired session (restored for the same account)', async () => {
    saveDraft(SUB, { firstName: 'Alex', lastName: 'Smith', phoneNumber: '+17135550101', acceptedTerms: true })
    lookup.mockRejectedValue(apiError('UNAUTHORIZED', 401))
    renderApp('/auth/callback')
    await signInButton()
    expect(loadDraft(SUB)).toMatchObject({ firstName: 'Alex' })
  })

  it('Scenario H: a session that expires while the app is open returns to Continue with Google', async () => {
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    await screen.findByText('Create application workspace')

    act(() => emitAuthEvent({ type: 'sessionExpired' }))

    expect(await signInButton()).toBeInTheDocument()
    expect(screen.getByText(/your session has ended/i)).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
  })

  it('a session that expires on the registration form keeps the draft', async () => {
    lookup.mockResolvedValue(SIGNUP_LOOKUP)
    renderApp('/register')
    await screen.findByLabelText(/first name/i)
    saveDraft(SUB, { firstName: 'Alex', lastName: '', phoneNumber: '', acceptedTerms: false })

    act(() => emitAuthEvent({ type: 'sessionExpired' }))
    await signInButton()
    expect(loadDraft(SUB)).toMatchObject({ firstName: 'Alex' })
  })

  it('an unrelated session event on the login page changes nothing', async () => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    renderApp('/login')
    await signInButton()
    act(() => emitAuthEvent({ type: 'sessionExpired' }))
    expect(await signInButton()).toBeInTheDocument()
  })
})

describe('transient failures never decide access', () => {
  it('a 503 that outlives the retries shows an in-place error, not the workspace', async () => {
    lookup.mockRejectedValue(apiError('SERVICE_UNAVAILABLE', 503, { requestId: 'req-503' }))
    const router = renderApp('/applications/new')

    expect(await screen.findByText(/we couldn't check your account/i)).toBeInTheDocument()
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/req-503/)).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/applications/new') // rendered in place: no redirect loop
    expect(lookup).toHaveBeenCalledTimes(1) // the service owns retrying; the UI does not spin
  })

  it('Try again re-runs the lookup and recovers', async () => {
    const user = userEvent.setup()
    lookup.mockRejectedValueOnce(apiError('SERVICE_UNAVAILABLE', 503)).mockResolvedValueOnce(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    await screen.findByText(/we couldn't check your account/i)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('Try again that fails again stays on the error screen', async () => {
    const user = userEvent.setup()
    lookup.mockRejectedValue(apiError('INTERNAL_ERROR', 500, { requestId: 'req-500' }))
    renderApp('/applications/new')
    await screen.findByText(/we couldn't check your account/i)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/we couldn't check your account/i)).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
  })

  it('Scenario "unknown nextStep": a malformed answer is a controlled error, never access', async () => {
    lookup.mockRejectedValue(apiError('UNEXPECTED_RESPONSE', 200, { backendCode: null }))
    renderApp('/auth/callback')
    expect(await screen.findByText(/unexpected response/i)).toBeInTheDocument()
    expect(workspace()).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
  })

  it('a network failure shows the connection message and a way out', async () => {
    lookup.mockRejectedValue(apiError('NETWORK_ERROR', 0, { message: 'Unable to connect to the application service.', backendCode: null }))
    renderApp('/applications/new')
    expect(await screen.findByText(/unable to connect/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('a failure while restoring the session is also retryable, not a sign-out', async () => {
    const user = userEvent.setup()
    cognito.getSessionIdentity.mockRejectedValueOnce(new Error('NetworkError'))
    cognito.getSessionIdentity.mockResolvedValue({ sub: SUB })
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')

    await screen.findByText(/we couldn't check your account/i)
    expect(cognito.signOutOfCognito).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
  })
})

describe('no session', () => {
  it('shows the login page without asking the backend anything', async () => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    const router = renderApp('/applications/new')
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each(['/register', '/pending', '/restricted'])('%s requires a session', async (path) => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    const router = renderApp(path)
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('has exactly one Google button (no separate signup button)', async () => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    renderApp('/login')
    await signInButton()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText(/sign up/i)).toBeNull()
    expect(document.querySelector('input[type="password"]')).toBeNull()
  })
})

describe('OAuth callback outcomes', () => {
  it('a failed code exchange shows a recoverable error and never calls the lookup', async () => {
    const user = userEvent.setup()
    cognito.getSessionIdentity.mockResolvedValue(null)
    cognito.getRecordedOAuthFailure.mockReturnValue('We could not complete Google sign-in. Please try again.')
    const router = renderApp('/auth/callback?code=abc&state=xyz')

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument()
    expect(screen.getByText(/could not complete google sign-in/i)).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('a cancelled Google sign-in is described as a cancellation', async () => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    renderApp('/auth/callback?error=access_denied&error_description=Permission+denied')
    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument()
    expect(screen.getByText(/sign-in was cancelled/i)).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('an OAuth failure reported while the session wait is pending still reaches the page', async () => {
    // Amplify releases the session wait and reports the failure through Hub in
    // that order, so the provider must read the recorded failure afterwards.
    const session = deferred<null>()
    cognito.getSessionIdentity.mockReturnValue(session.promise)
    renderApp('/auth/callback?code=abc&state=xyz')
    await screen.findByText(/completing sign-in/i)

    const message = 'Sign-in was cancelled. You can try again whenever you are ready.'
    cognito.getRecordedOAuthFailure.mockReturnValue(message)
    act(() => emitAuthEvent({ type: 'oauthFailure', message }))
    await act(async () => session.resolve(null))

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument()
    expect(screen.getByText(/sign-in was cancelled/i)).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('opening /auth/callback directly without a session goes to the login page, not Google', async () => {
    cognito.getSessionIdentity.mockResolvedValue(null)
    const router = renderApp('/auth/callback')
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(cognito.continueWithGoogle).not.toHaveBeenCalled()
  })

  it('an already-established session on the callback page just continues', async () => {
    lookup.mockResolvedValue(PENDING_LOOKUP)
    const router = renderApp('/auth/callback')
    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pending')
  })
})

describe('deduplicated lookups and React Strict Mode', () => {
  it('Strict Mode (double effects) still makes exactly one lookup', async () => {
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/auth/callback', { strictMode: true })
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(cognito.getSessionIdentity).toHaveBeenCalledTimes(1)
  })

  it('several guards and redirects do not multiply lookups', async () => {
    lookup.mockResolvedValue(PENDING_LOOKUP)
    renderApp('/applications/new', { strictMode: true })
    await screen.findByRole('heading', { name: /registration submitted/i })
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

describe('Scenario G: logout', () => {
  it('signs out of Cognito, clears the registration draft and returns to login', async () => {
    const user = userEvent.setup()
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    const router = renderApp('/applications/new')
    await screen.findByText('Create application workspace')
    saveDraft(SUB, { firstName: 'Alex', lastName: 'Smith', phoneNumber: '+1', acceptedTerms: true })

    await user.click(screen.getByRole('button', { name: /logout/i }))

    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
    expect(await signInButton()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(workspace()).not.toBeInTheDocument()
    expect(loadDraft(SUB)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('a sign-out in another tab signs this one out too', async () => {
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    await screen.findByText('Create application workspace')
    saveDraft(SUB, { firstName: 'Alex', lastName: '', phoneNumber: '', acceptedTerms: false })

    act(() => emitAuthEvent({ type: 'signedOut' }))

    expect(await signInButton()).toBeInTheDocument()
    expect(loadDraft(SUB)).toBeNull()
  })

  it('still signs the user out of the app if the Cognito logout redirect fails', async () => {
    const user = userEvent.setup()
    cognito.signOutOfCognito.mockRejectedValue(new Error('OAuthSignOutException'))
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    await screen.findByText('Create application workspace')

    await user.click(screen.getByRole('button', { name: /logout/i }))
    expect(await signInButton()).toBeInTheDocument()
  })
})

describe('401 from any other API', () => {
  it('re-asks the backend instead of blindly signing out', async () => {
    const { apiClient } = await import('@/lib/apiClient')
    lookup.mockResolvedValue(ACTIVE_LOOKUP)
    renderApp('/applications/new')
    await screen.findByText('Create application workspace')
    expect(lookup).toHaveBeenCalledTimes(1)

    apiClient.defaults.adapter = async (config) => {
      const { AxiosError } = await import('axios')
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: '',
        headers: {},
        config,
        data: { success: false, error: 'UNAUTHORIZED' },
      })
    }
    await expect(apiClient.get('/api/v1/recruiter/students')).rejects.toBeTruthy()

    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2))
    // The backend still says approved, so the user stays in the workspace.
    expect(workspace()).toBeInTheDocument()
    expect(cognito.signOutOfCognito).not.toHaveBeenCalled()
  })
})
