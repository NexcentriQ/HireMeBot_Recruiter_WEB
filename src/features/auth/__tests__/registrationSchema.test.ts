import { describe, expect, it } from 'vitest'
import {
  buildRegistrationPayload,
  isRegistrationField,
  normalizePhone,
  registrationSchema,
} from '../registrationSchema'

const valid = {
  firstName: 'Alex',
  lastName: 'Smith',
  phoneNumber: '+17135550101',
  acceptedTerms: true,
}

/** The first message per field: what the form shows (react-hook-form's zodResolver keeps the first). */
function messages(input: unknown): Record<string, string> {
  const result = registrationSchema.safeParse(input)
  const out: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      if (!(key in out)) out[key] = issue.message
    }
  }
  return out
}

describe('registrationSchema: names', () => {
  it('accepts the documented example', () => {
    expect(registrationSchema.safeParse(valid).success).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    const r = registrationSchema.parse({ ...valid, firstName: '  Alex  ', lastName: ' Smith ' })
    expect(r.firstName).toBe('Alex')
    expect(r.lastName).toBe('Smith')
  })

  it.each([
    "O'Brien",
    'O’Brien',
    'Mary-Jane',
    'St. John',
    'José',
    'Zoë',
    'Müller',
    'García López',
    '李',
    'Владимир',
    'محمد',
  ])('accepts %s', (name) => {
    expect(registrationSchema.safeParse({ ...valid, firstName: name }).success).toBe(true)
  })

  it('requires both names', () => {
    const m = messages({ ...valid, firstName: '   ', lastName: '' })
    expect(m.firstName).toMatch(/required/i)
    expect(m.lastName).toMatch(/required/i)
  })

  it('rejects more than 100 characters but allows exactly 100', () => {
    expect(registrationSchema.safeParse({ ...valid, firstName: 'a'.repeat(100) }).success).toBe(true)
    expect(messages({ ...valid, firstName: 'a'.repeat(101) }).firstName).toMatch(/100/)
  })

  it.each(['-Alex', "'Alex", '.Alex', '1Alex', ' 1', 'Alex1', 'Alex_', 'Al@x', 'A<b>'])(
    'rejects %s',
    (name) => {
      expect(registrationSchema.safeParse({ ...valid, firstName: name }).success).toBe(false)
    }
  )
})

describe('normalizePhone', () => {
  it('keeps a valid E.164 number', () => {
    expect(normalizePhone('+17135550101')).toEqual({ ok: true, value: '+17135550101' })
  })

  it.each([
    ['+1 (713) 555-0101', '+17135550101'],
    ['+1 713 555 0101', '+17135550101'],
    ['+1-713-555-0101', '+17135550101'],
    ['+1.713.555.0101', '+17135550101'],
    ['  +17135550101  ', '+17135550101'],
    ['+44 20 7946 0958', '+442079460958'],
    ['+91 98765 43210', '+919876543210'],
  ])('strips separators: %s', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, value: expected })
  })

  it('requires a value', () => {
    expect(normalizePhone('  ')).toMatchObject({ ok: false, message: expect.stringMatching(/required/i) })
  })

  it.each(['7135550101', '(713) 555-0101', '0017135550101', '+', '+abc', '++17135550101', '+1713555010x'])(
    'rejects %s (no country code or not numeric)',
    (raw) => {
      expect(normalizePhone(raw).ok).toBe(false)
    }
  )

  it('allows at most 15 digits', () => {
    expect(normalizePhone('+' + '4'.repeat(15)).ok).toBe(true)
    expect(normalizePhone('+' + '4'.repeat(16)).ok).toBe(false)
  })

  it('rejects a country code that starts with 0', () => {
    expect(normalizePhone('+0123456789').ok).toBe(false)
  })

  it('needs exactly 10 digits after +1 and a valid area code', () => {
    expect(normalizePhone('+1713555010').ok).toBe(false) // 9 digits
    expect(normalizePhone('+171355501011').ok).toBe(false) // 11 digits
    expect(normalizePhone('+10135550101').ok).toBe(false) // area code starts with 0
    expect(normalizePhone('+11135550101').ok).toBe(false) // area code starts with 1
    expect(normalizePhone('+12135550101').ok).toBe(true)
  })
})

describe('registrationSchema: phone and terms', () => {
  it('reports the phone error on phoneNumber', () => {
    expect(messages({ ...valid, phoneNumber: '7135550101' }).phoneNumber).toMatch(/international format/i)
  })

  it('requires the Terms checkbox', () => {
    expect(messages({ ...valid, acceptedTerms: false }).acceptedTerms).toMatch(/terms/i)
  })
})

describe('buildRegistrationPayload', () => {
  it('returns exactly the four documented fields, normalized', () => {
    const payload = buildRegistrationPayload({
      firstName: '  Alex ',
      lastName: 'Smith',
      phoneNumber: '+1 (713) 555-0101',
      acceptedTerms: true,
    })
    expect(payload).toEqual({
      firstName: 'Alex',
      lastName: 'Smith',
      phoneNumber: '+17135550101',
      acceptedTerms: true,
    })
    expect(Object.keys(payload).sort()).toEqual(
      ['acceptedTerms', 'firstName', 'lastName', 'phoneNumber']
    )
  })

  it('never carries extra properties through, even if passed in', () => {
    const payload = buildRegistrationPayload({
      ...valid,
      email: 'x@example.com',
      accountStatus: 'ACTIVE',
      userId: 1,
    } as unknown as Parameters<typeof buildRegistrationPayload>[0])
    expect(Object.keys(payload).sort()).toEqual(
      ['acceptedTerms', 'firstName', 'lastName', 'phoneNumber']
    )
  })

  it('refuses to build from invalid values', () => {
    expect(() => buildRegistrationPayload({ ...valid, acceptedTerms: false })).toThrow()
    expect(() => buildRegistrationPayload({ ...valid, phoneNumber: '123' })).toThrow()
  })
})

describe('isRegistrationField', () => {
  it('recognises only the four form fields', () => {
    for (const f of ['firstName', 'lastName', 'phoneNumber', 'acceptedTerms']) {
      expect(isRegistrationField(f)).toBe(true)
    }
    expect(isRegistrationField('email')).toBe(false)
    expect(isRegistrationField('')).toBe(false)
  })
})
