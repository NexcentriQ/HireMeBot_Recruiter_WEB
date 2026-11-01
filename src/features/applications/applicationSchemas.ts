import { z } from 'zod'

/** Max value we trust in both JS and 64-bit int: 2^53 - 1. */
export const MAX_SAFE_ID = Number.MAX_SAFE_INTEGER

const requiredString = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)

const optionalMaxString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))

/** A positive, safe JavaScript integer stored as a string in the form. */
const positiveIdFromString = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (v) => /^[0-9]+$/.test(v),
      `${label} must be a whole number.`
    )
    .refine(
      (v) => {
        const n = Number(v)
        return Number.isSafeInteger(n) && n > 0
      },
      `${label} is out of the supported range.`
    )

const optionalIdFromString = (label: string) =>
  z
    .union([z.literal(''), positiveIdFromString(label)])
    .optional()

const jobLinkSchema = z
  .string()
  .trim()
  .min(1, 'Job Posting URL is required.')
  .max(1000, 'Job Posting URL must be at most 1000 characters.')
  .refine(
    (v) => {
      try {
        const u = new URL(v)
        return (
          (u.protocol === 'http:' || u.protocol === 'https:') &&
          Boolean(u.hostname)
        )
      } catch {
        return false
      }
    },
    { message: 'Enter a full http(s) URL (including the host).' }
  )

export const JOB_SOURCE_PRESETS = [
  'LinkedIn',
  'Indeed',
  'Company Careers',
  'Glassdoor',
  'Handshake',
  'Other',
] as const

export const questionEntrySchema = z.object({
  question: requiredString('Question', 5000),
  answer: requiredString('Answer', 5000),
})

export const createApplicationFormSchema = z
  .object({
    studentId: z
      .string()
      .trim()
      .min(1, 'Please select an assigned student.'),
    companyName: requiredString('Company name', 255),
    jobTitle: requiredString('Job title', 255),
    jobLink: jobLinkSchema,
    jobLocation: requiredString('Job location', 255),
    jobSourceOption: z.enum(JOB_SOURCE_PRESETS, {
      errorMap: () => ({ message: 'Please select a job source.' }),
    }),
    jobSourceCustom: optionalMaxString(100),
    resumeObjectId: positiveIdFromString('Resume ID'),
    coverLetterObjectId: optionalIdFromString('Cover letter ID'),
    questions: z
      .array(questionEntrySchema)
      .max(50, 'You can add up to 50 questions.')
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.jobSourceOption === 'Other') {
      const custom = (val.jobSourceCustom ?? '').trim()
      if (!custom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jobSourceCustom'],
          message: 'Enter a job source.',
        })
      } else if (custom.length > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jobSourceCustom'],
          message: 'Job source must be at most 100 characters.',
        })
      }
    }
  })

export type CreateApplicationFormValues = z.input<
  typeof createApplicationFormSchema
>
export type ParsedCreateApplicationFormValues = z.output<
  typeof createApplicationFormSchema
>
