import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'

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
  envModule,
  PENDING_LOOKUP,
  resetAuthMocks,
  service,
  SIGNUP_LOOKUP,
  SUB,
} from './authMocks'
import { renderApp } from './renderApp'
import { loadDraft } from '../registrationDraft'

const lookup = service.lookupRecruiterAccount
const register = service.registerRecruiter

const CREATED = { userId: 1000000001, recruiterId: 1000000001, nextStep: 'APPROVAL_PENDING' as const }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const submitButton = () => screen.getByRole('button', { name: /submit registration|submitting/i })

async function openForm(options: { strictMode?: boolean } = {}) {
  lookup.mockResolvedValue(SIGNUP_LOOKUP)
  const app = renderApp('/register', options)
  await screen.findByLabelText(/first name/i)
  return app
}

async function fillForm(
  user: UserEvent,
  values: { first?: string; last?: string; phone?: string; terms?: boolean } = {}
) {
  await user.type(screen.getByLabelText(/first name/i), values.first ?? 'Alex')
  await user.type(screen.getByLabelText(/last name/i), values.last ?? 'Smith')
  await user.type(screen.getByLabelText(/phone number/i), values.phone ?? '+17135550101')
  if (values.terms !== false) {
    await user.click(screen.getByRole('checkbox', { name: /terms and conditions/i }))
  }
}

/** The wrapper div of one field, for asserting a message sits beside the right input. */
function fieldBlock(label: RegExp) {
  return screen.getByLabelText(label).closest('div.space-y-1\\.5') as HTMLElement
}

beforeEach(() => {
  resetAuthMocks()
  sessionStorage.clear()
  envModule.env.termsUrl = ''
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('registration form: validation (nothing is sent until it is valid)', () => {
  it('requires names, phone and the Terms checkbox', async () => {
    const user = userEvent.setup()
    await openForm()
    await user.click(submitButton())

    expect(await screen.findByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Last name is required.')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required.')).toBeInTheDocument()
    expect(screen.getByText(/accept the terms and conditions/i)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('validates names beside the right field', async () => {
    const user = userEvent.setup()
    await openForm()
    await fillForm(user, { first: '1Alex', last: 'x'.repeat(101) })
    await user.click(submitButton())

    expect(within(fieldBlock(/first name/i)).getByText(/must start with a letter/i)).toBeInTheDocument()
    expect(within(fieldBlock(/last name/i)).getByText(/100 characters/i)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects a phone number without a country code', async () => {
    const user = userEvent.setup()
    await openForm()
    await fillForm(user, { phone: '7135550101' })
    await user.click(submitButton())

    expect(within(fieldBlock(/phone number/i)).getByText(/international format/i)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('does not submit when only the Terms checkbox is missing', async () => {
    const user = userEvent.setup()
    await openForm()
    await fillForm(user, { terms: false })
    await user.click(submitButton())

    expect(await screen.findByText(/accept the terms and conditions/i)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('shows the Terms link only when one is configured, in a safe new tab', async () => {
    await openForm()
    expect(screen.queryByRole('link', { name: /terms and conditions/i })).toBeNull()
    cleanup()

    envModule.env.termsUrl = 'https://example.com/recruiter-terms'
    await openForm()
    const link = screen.getByRole('link', { name: /terms and conditions/i })
    expect(link).toHaveAttribute('href', 'https://example.com/recruiter-terms')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})

describe('registration form: submitting', () => {
  it('POSTs exactly the allowed fields and then waits for approval (never the dashboard)', async () => {
    const user = userEvent.setup()
    register.mockResolvedValue(CREATED)
    const app = await openForm()
    await fillForm(user, { first: ' Alex ', phone: '+1 (713) 555-0101' })

    await user.click(submitButton())

    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith({
      firstName: 'Alex',
      lastName: 'Smith',
      phoneNumber: '+17135550101',
      acceptedTerms: true,
    })
    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/pending')
    expect(screen.queryByText('Create application workspace')).toBeNull()
    expect(lookup).toHaveBeenCalledTimes(1) // no extra lookup: the 201 already said APPROVAL_PENDING
    expect(loadDraft(SUB)).toBeNull() // draft cleared on success
  })

  it('a double click sends one request and locks the form while it is in flight', async () => {
    const user = userEvent.setup()
    const pending = deferred<typeof CREATED>()
    register.mockReturnValue(pending.promise)
    await openForm()
    await fillForm(user)

    await user.dblClick(submitButton())

    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled()
    expect(screen.getByLabelText(/first name/i)).toBeDisabled()
    expect(register).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve(CREATED))
    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('repeated Enter presses send one request', async () => {
    const user = userEvent.setup()
    const pending = deferred<typeof CREATED>()
    register.mockReturnValue(pending.promise)
    await openForm()
    await fillForm(user)

    await user.type(screen.getByLabelText(/last name/i), '{Enter}{Enter}{Enter}')
    expect(register).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(CREATED))
  })

  it('React Strict Mode does not cause a second submission', async () => {
    const user = userEvent.setup()
    register.mockResolvedValue(CREATED)
    await openForm({ strictMode: true })
    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('never navigates away or resubmits when the user presses back/forward after success', async () => {
    const user = userEvent.setup()
    register.mockResolvedValue(CREATED)
    const app = await openForm()
    await fillForm(user)
    await user.click(submitButton())
    await screen.findByRole('heading', { name: /registration submitted/i })

    await app.navigate('/register') // like pressing Back
    expect(app.state.location.pathname).toBe('/pending')
    expect(register).toHaveBeenCalledTimes(1)
  })
})

describe('registration form: backend validation errors', () => {
  it('maps fieldErrors onto the matching inputs', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(
      apiError('VALIDATION_FAILED', 400, {
        message: 'Please provide valid registration details.',
        fieldErrors: [
          { field: 'phoneNumber', message: 'Server: that phone number is not valid.' },
          { field: 'firstName', message: 'Server: first name not allowed.' },
        ],
        requestId: 'req-val',
      })
    )
    await openForm()
    await fillForm(user)
    await user.click(submitButton())

    expect(await within(fieldBlock(/phone number/i)).findByText('Server: that phone number is not valid.')).toBeInTheDocument()
    expect(within(fieldBlock(/first name/i)).getByText('Server: first name not allowed.')).toBeInTheDocument()
    expect(within(fieldBlock(/last name/i)).queryByText(/server/i)).toBeNull()
    expect(screen.getByRole('button', { name: /submit registration/i })).toBeEnabled()
  })

  it('shows a field error the form does not own as a form-level message', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(
      apiError('VALIDATION_FAILED', 400, {
        fieldErrors: [{ field: 'email', message: 'Server: email problem.' }],
      })
    )
    await openForm()
    await fillForm(user)
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Server: email problem.')
  })

  it('VALIDATION_FAILED without field details still explains itself', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('VALIDATION_FAILED', 400))
    await openForm()
    await fillForm(user)
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(/check your details/i)
  })

  it.each(['INVALID_REQUEST', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE'])(
    '%s is a request problem with the reference id, and the form stays usable',
    async (code) => {
      const user = userEvent.setup()
      register.mockRejectedValue(apiError(code, code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { requestId: 'req-bad' }))
      await openForm()
      await fillForm(user)
      await user.click(submitButton())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/problem with the request/i)
      expect(alert).toHaveTextContent('req-bad')
      expect(screen.getByRole('button', { name: /submit registration/i })).toBeEnabled()
      expect(lookup).toHaveBeenCalledTimes(1)
    }
  )

  it('NAME_ALREADY_REGISTERED shows the server message and does nothing else', async () => {
    const user = userEvent.setup()
    const message = 'An account with this name already exists. Please contact support.'
    register.mockRejectedValue(apiError('NAME_ALREADY_REGISTERED', 409, { message }))
    const app = await openForm()
    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(app.state.location.pathname).toBe('/register')
    expect(register).toHaveBeenCalledTimes(1) // not retried automatically
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(cognito.signOutOfCognito).not.toHaveBeenCalled()
  })
})

describe('registration form: recovering through the account lookup', () => {
  it('ACCOUNT_ALREADY_REGISTERED re-runs the lookup and follows it to the waiting screen', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('ACCOUNT_ALREADY_REGISTERED', 409))
    const app = await openForm()
    await fillForm(user)
    lookup.mockResolvedValue(PENDING_LOOKUP)

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/pending')
    expect(register).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(loadDraft(SUB)).toBeNull()
  })

  it('ACCOUNT_ALREADY_REGISTERED for an already-approved account opens the workspace', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('ACCOUNT_ALREADY_REGISTERED', 409))
    await openForm()
    await fillForm(user)
    lookup.mockResolvedValue(ACTIVE_LOOKUP)

    await user.click(submitButton())
    expect(await screen.findByText('Create application workspace')).toBeInTheDocument()
  })

  it('says so if the recovery lookup itself fails, without repeating the POST', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('ACCOUNT_ALREADY_REGISTERED', 409))
    await openForm()
    await fillForm(user)
    lookup.mockRejectedValue(apiError('SERVICE_UNAVAILABLE', 503))

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm whether your registration was received/i)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a lost response', () => apiError('NETWORK_ERROR', 0, { backendCode: null })],
    ['a 500', () => apiError('INTERNAL_ERROR', 500)],
    ['a 503', () => apiError('SERVICE_UNAVAILABLE', 503)],
    ['a malformed 201', () => apiError('UNEXPECTED_RESPONSE', 201, { backendCode: null })],
  ])('after %s the outcome is resolved by lookup, never by POSTing again', async (_label, makeError) => {
    const user = userEvent.setup()
    register.mockRejectedValue(makeError())
    const app = await openForm()
    await fillForm(user)
    // The registration did go through on the server even though the reply was lost.
    lookup.mockResolvedValue(PENDING_LOOKUP)

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/pending')
    expect(register).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('when the lookup shows nothing was created, the form stays for a deliberate retry', async () => {
    const user = userEvent.setup()
    register.mockRejectedValueOnce(apiError('INTERNAL_ERROR', 500, { requestId: 'req-500' }))
    const app = await openForm()
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not received/i)
    expect(app.state.location.pathname).toBe('/register')
    expect(register).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Alex') // input kept

    register.mockResolvedValueOnce(CREATED)
    await user.click(submitButton())
    expect(await screen.findByRole('heading', { name: /registration submitted/i })).toBeInTheDocument()
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('an unlisted 4xx is a definitive rejection: no lookup, form kept', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('NOT_FOUND', 404, { requestId: 'req-404' }))
    await openForm()
    await fillForm(user)
    await user.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not submit your registration/i)
    expect(alert).toHaveTextContent('req-404')
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

describe('registration form: session and account problems', () => {
  it('an expired session returns to Continue with Google and keeps the draft', async () => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError('UNAUTHORIZED', 401))
    await openForm()
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByText(/your session has ended/i)).toBeInTheDocument()
    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
    expect(loadDraft(SUB)).toMatchObject({
      firstName: 'Alex',
      lastName: 'Smith',
      phoneNumber: '+17135550101',
      acceptedTerms: true,
    })
  })

  it.each([
    ['ACCOUNT_TYPE_MISMATCH', 403, /different account type/i],
    ['ACCOUNT_SUSPENDED', 403, /account suspended/i],
    ['ACCOUNT_DELETED', 403, /account unavailable/i],
    ['ACCOUNT_IDENTITY_CONFLICT', 409, /email already in use/i],
    ['EMAIL_NOT_VERIFIED', 403, /verified email required/i],
  ])('%s moves to the restricted screen and clears the draft', async (code, status, heading) => {
    const user = userEvent.setup()
    register.mockRejectedValue(apiError(code, status))
    const app = await openForm()
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(app.state.location.pathname).toBe('/restricted')
    expect(loadDraft(SUB)).toBeNull()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('"Use a different account" signs out', async () => {
    const user = userEvent.setup()
    await openForm()
    await user.click(await screen.findByRole('button', { name: /use a different account/i }))
    expect(cognito.signOutOfCognito).toHaveBeenCalledTimes(1)
  })
})

describe('registration draft', () => {
  it('is saved as the user types: names, phone and Terms only, tied to the Cognito subject', async () => {
    const user = userEvent.setup()
    await openForm()
    await fillForm(user)

    expect(loadDraft(SUB)).toEqual({
      firstName: 'Alex',
      lastName: 'Smith',
      phoneNumber: '+17135550101',
      acceptedTerms: true,
    })
    const raw = JSON.stringify(Object.entries(sessionStorage))
    expect(raw).not.toMatch(/access-token|Bearer|jwt/i)
    expect(localStorage.length).toBe(0)
  })

  it('is restored after a reload for the same Google account', async () => {
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText(/first name/i), 'Alex')
    await user.type(screen.getByLabelText(/phone number/i), '+17135550101')
    cleanup() // "reload"

    await openForm()
    expect(await screen.findByDisplayValue('Alex')).toBeInTheDocument()
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('+17135550101')
  })

  it('is discarded when a different Google account signs in', async () => {
    const user = userEvent.setup()
    await openForm()
    await user.type(screen.getByLabelText(/first name/i), 'Alex')
    cleanup()

    cognito.getSessionIdentity.mockResolvedValue({ sub: 'someone-else', email: 'other@gmail.com' })
    await openForm()
    expect(await screen.findByText('other@gmail.com')).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('')
    expect(loadDraft(SUB)).toBeNull() // gone for good, not just hidden
  })
})

describe('registration form: Terms link safety', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', '//evil.example/terms', 'ftp://example.com/t'])(
    'does not turn %s into a link',
    async (url) => {
      envModule.env.termsUrl = url
      await openForm()
      expect(screen.queryByRole('link', { name: /terms and conditions/i })).toBeNull()
      expect(screen.getByRole('checkbox', { name: /terms and conditions/i })).toBeInTheDocument()
    }
  )
})
