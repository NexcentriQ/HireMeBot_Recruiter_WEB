import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
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

import {
  ACTIVE_LOOKUP,
  cognito,
  envState,
  PENDING_LOOKUP,
  resetAuthMocks,
  service,
} from './authMocks'
import { renderApp } from './renderApp'
import { setSessionNotice } from '../sessionNotice'

const lookup = service.lookupRecruiterAccount

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const googleButton = () => screen.findByRole('button', { name: /continue with google/i })

beforeEach(() => {
  resetAuthMocks()
  sessionStorage.clear()
  cognito.getSessionIdentity.mockResolvedValue(null) // signed out unless a test says otherwise
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('Continue with Google', () => {
  it('starts the Cognito/Google flow, once, and stays disabled while the browser redirects', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    const button = await googleButton()

    await user.dblClick(button)

    expect(cognito.continueWithGoogle).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    // Nothing is looked up before Google has answered.
    expect(lookup).not.toHaveBeenCalled()
  })

  it('is the only sign-in control: no separate signup, no password form', async () => {
    renderApp('/login')
    await googleButton()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText(/sign up|create account|register now/i)).toBeNull()
    expect(document.querySelector('input')).toBeNull()
  })

  it('explains how new recruiters get access', async () => {
    renderApp('/login')
    await googleButton()
    expect(screen.getByText(/new recruiters register after signing in/i)).toBeInTheDocument()
    expect(screen.queryByText(/only authorized recruiter accounts can sign in/i)).toBeNull()
  })

  it('a start failure shows a message and allows another attempt', async () => {
    const user = userEvent.setup()
    cognito.continueWithGoogle
      .mockRejectedValueOnce(new Error('We could not start Google sign-in. Please try again.'))
      .mockResolvedValueOnce('redirecting')
    renderApp('/login')
    const button = await googleButton()

    await user.click(button)
    expect(await screen.findByText(/could not start sign-in/i)).toBeInTheDocument()
    expect(screen.getByText(/could not start google sign-in/i)).toBeInTheDocument()
    expect(button).toBeEnabled()

    await user.click(button)
    expect(cognito.continueWithGoogle).toHaveBeenCalledTimes(2)
    expect(button).toBeDisabled()
  })

  it('an Amplify session that is still present is resolved through the backend, not a second redirect', async () => {
    const user = userEvent.setup()
    cognito.continueWithGoogle.mockResolvedValue('already-signed-in')
    lookup.mockResolvedValue(PENDING_LOOKUP)
    const app = renderApp('/login')

    await user.click(await googleButton())

    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/pending')
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('re-enables the button when the page comes back from the browser back-forward cache', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    const button = await googleButton()
    await user.click(button)
    expect(button).toBeDisabled()

    const event = new Event('pageshow') as Event & { persisted: boolean }
    Object.defineProperty(event, 'persisted', { value: true })
    act(() => {
      window.dispatchEvent(event)
    })

    expect(button).toBeEnabled()
  })

  it('shows why the user is here again, exactly once', async () => {
    setSessionNotice('session-ended')
    const first = renderApp('/login')
    await googleButton()
    expect(screen.getByText(/your session has ended/i)).toBeInTheDocument()
    expect(first.state.location.pathname).toBe('/login')
    expect(sessionStorage.getItem('hmb.recruiter.notice')).toBeNull()
  })
})

describe('login page while a session exists', () => {
  it('waits for the backend, then routes by the answer', async () => {
    cognito.getSessionIdentity.mockResolvedValue({ sub: 's' })
    const answer = deferred<typeof ACTIVE_LOOKUP>()
    lookup.mockReturnValue(answer.promise)
    renderApp('/login')

    expect(await screen.findByText(/checking your account/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull()

    await act(async () => answer.resolve(ACTIVE_LOOKUP))
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
  })
})

describe('local development modes never touch Cognito or the account lookup', () => {
  it.each(['mock', 'dev-header'] as const)('%s mode opens the workspace directly', async (mode) => {
    envState.authMode = mode
    const app = renderApp('/login')

    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/applications/new')
    expect(cognito.getSessionIdentity).not.toHaveBeenCalled()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('cognito mode never falls back to a fake profile', async () => {
    envState.authMode = 'cognito'
    renderApp('/applications/new')
    expect(await googleButton()).toBeInTheDocument()
    expect(screen.queryByText('Create application workspace')).toBeNull()
  })
})
