import { describe, expect, it } from 'vitest'
import { createApplicationFormSchema } from '../applicationSchemas'

describe('createApplicationFormSchema', () => {
  const base = {
    studentId: '1000000002',
    companyName: 'Amazon',
    jobTitle: 'Software Engineer',
    jobLink: 'https://amazon.jobs/en/jobs/123',
    jobLocation: 'Austin, TX',
    jobSourceOption: 'LinkedIn' as const,
    jobSourceCustom: '',
    resumeObjectId: '1000000003',
    coverLetterObjectId: '',
    questions: [],
  }

  it('accepts a minimum valid payload', () => {
    const r = createApplicationFormSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('rejects an empty student', () => {
    const r = createApplicationFormSchema.safeParse({ ...base, studentId: '' })
    expect(r.success).toBe(false)
  })

  it('rejects a company name over 255 chars', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      companyName: 'a'.repeat(256),
    })
    expect(r.success).toBe(false)
  })

  it('rejects an invalid or non-absolute job link', () => {
    expect(
      createApplicationFormSchema.safeParse({ ...base, jobLink: 'not-a-url' })
        .success
    ).toBe(false)
    expect(
      createApplicationFormSchema.safeParse({ ...base, jobLink: '/relative' })
        .success
    ).toBe(false)
    expect(
      createApplicationFormSchema.safeParse({
        ...base,
        jobLink: 'ftp://example.com/file',
      }).success
    ).toBe(false)
  })

  it('requires a job location', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      jobLocation: '',
    })
    expect(r.success).toBe(false)
  })

  it('requires a custom job source when "Other" is selected', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      jobSourceOption: 'Other',
      jobSourceCustom: '',
    })
    expect(r.success).toBe(false)
  })

  it('accepts "Other" with a custom value', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      jobSourceOption: 'Other',
      jobSourceCustom: 'University Career Fair',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-numeric resume object id', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      resumeObjectId: 'abc',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an unsafe resume object id (> 2^53-1)', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      resumeObjectId: '99999999999999999999',
    })
    expect(r.success).toBe(false)
  })

  it('allows a blank optional cover letter', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      coverLetterObjectId: '',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid optional cover letter', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      coverLetterObjectId: 'xx',
    })
    expect(r.success).toBe(false)
  })

  it('caps questions at 50', () => {
    const many = Array.from({ length: 51 }, () => ({
      question: 'q',
      answer: 'a',
    }))
    const r = createApplicationFormSchema.safeParse({
      ...base,
      questions: many,
    })
    expect(r.success).toBe(false)
  })

  it('requires both question and answer when a row exists', () => {
    const r = createApplicationFormSchema.safeParse({
      ...base,
      questions: [{ question: '', answer: 'yes' }],
    })
    expect(r.success).toBe(false)
  })
})
