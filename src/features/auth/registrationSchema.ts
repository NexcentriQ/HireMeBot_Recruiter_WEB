import { z } from 'zod'
import type { RegisterRecruiterRequest } from '@/types/recruiterAuth'

/**
 * Client-side mirror of the backend registration rules
 * (RECRUITER_AUTH_API.md section 4). The backend stays the authority: any
 * `fieldErrors` it returns are shown on the matching input.
 */

// Letters of any language (plus combining marks), spaces, ' ’ - . — and the
// first character must be a letter.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’.\- ]*$/u

const PHONE_FORMAT_MESSAGE =
  'Enter a valid phone number in international format, e.g. +17135550101.'

export type PhoneResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

/**
 * Normalize a typed phone number to E.164. Spaces, dashes, dots and
 * parentheses are removed; the country code (`+`) is required; at most 15
 * digits; +1 (US/Canada) needs exactly 10 digits with an area code that does
 * not start with 0 or 1.
 */
export function normalizePhone(raw: string): PhoneResult {
  const stripped = raw.trim().replace(/[\s\-.()]/g, '')
  if (!stripped) return { ok: false, message: 'Phone number is required.' }
  if (!/^\+\d+$/.test(stripped)) {
    return { ok: false, message: PHONE_FORMAT_MESSAGE }
  }
  const digits = stripped.slice(1)
  if (digits.startsWith('0') || digits.length < 7 || digits.length > 15) {
    return { ok: false, message: PHONE_FORMAT_MESSAGE }
  }
  if (digits.startsWith('1')) {
    if (digits.length !== 11 || !/^[2-9]/.test(digits.slice(1))) {
      return {
        ok: false,
        message:
          'US and Canadian numbers need 10 digits after +1, with a valid area code.',
      }
    }
  }
  return { ok: true, value: `+${digits}` }
}

function nameField(label: string) {
  return z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .max(100, `${label} must be 100 characters or fewer.`)
        .regex(
          NAME_PATTERN,
          `${label} must start with a letter and use only letters, spaces, apostrophes, hyphens or periods.`
        )
    )
}

export const registrationSchema = z.object({
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  phoneNumber: z.string().superRefine((value, ctx) => {
    const result = normalizePhone(value)
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.message })
  }),
  acceptedTerms: z
    .boolean()
    .refine((v) => v === true, 'You must accept the Terms and Conditions to continue.'),
})

export type RegistrationFormValues = z.infer<typeof registrationSchema>

/** The form fields a backend `fieldErrors[].field` can be mapped onto. */
export const REGISTRATION_FIELDS = [
  'firstName',
  'lastName',
  'phoneNumber',
  'acceptedTerms',
] as const

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number]

export function isRegistrationField(name: string): name is RegistrationField {
  return (REGISTRATION_FIELDS as readonly string[]).includes(name)
}

/**
 * Build the POST body from validated form values. Listing the four fields
 * explicitly guarantees nothing else (email, ids, status, OTP …) is ever sent.
 */
export function buildRegistrationPayload(
  values: RegistrationFormValues
): RegisterRecruiterRequest {
  const phone = normalizePhone(values.phoneNumber)
  if (!phone.ok || values.acceptedTerms !== true) {
    throw new Error('The registration form is not valid.')
  }
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    phoneNumber: phone.value,
    acceptedTerms: true,
  }
}
