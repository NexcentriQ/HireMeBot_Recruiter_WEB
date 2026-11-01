import { describe, expect, it } from 'vitest'
import { toCreateApplicationRequest } from '../applicationMapper'
import type { ParsedCreateApplicationFormValues } from '../applicationSchemas'

function base(): ParsedCreateApplicationFormValues {
  return {
    studentId: '1000000002',
    companyName: '  Amazon  ',
    jobTitle: '  Software Engineer ',
    jobLink: ' https://amazon.jobs/en/jobs/123 ',
    jobLocation: '  Austin, TX ',
    jobSourceOption: 'LinkedIn',
    jobSourceCustom: '',
    resumeObjectId: '1000000003',
    coverLetterObjectId: '',
    questions: [],
  }
}

describe('toCreateApplicationRequest', () => {
  it('maps required fields and trims strings', () => {
    const payload = toCreateApplicationRequest(base())
    expect(payload).toEqual({
      studentId: 1000000002,
      application: {
        jobTitle: 'Software Engineer',
        companyName: 'Amazon',
        jobLocation: 'Austin, TX',
        jobLink: 'https://amazon.jobs/en/jobs/123',
        jobSource: 'LinkedIn',
      },
      documents: {
        resumeObjectId: 1000000003,
      },
    })
  })

  it('omits coverLetterObjectId when blank', () => {
    const payload = toCreateApplicationRequest(base())
    expect(payload.documents).not.toHaveProperty('coverLetterObjectId')
  })

  it('includes coverLetterObjectId when provided', () => {
    const payload = toCreateApplicationRequest({
      ...base(),
      coverLetterObjectId: '1000000004',
    })
    expect(payload.documents.coverLetterObjectId).toBe(1000000004)
  })

  it('uses the custom job source value when "Other" is selected', () => {
    const payload = toCreateApplicationRequest({
      ...base(),
      jobSourceOption: 'Other',
      jobSourceCustom: '  Campus Career Fair ',
    })
    expect(payload.application.jobSource).toBe('Campus Career Fair')
  })

  it('omits questions when the array is empty', () => {
    const payload = toCreateApplicationRequest(base())
    expect(payload).not.toHaveProperty('questions')
  })

  it('includes trimmed questions when present', () => {
    const payload = toCreateApplicationRequest({
      ...base(),
      questions: [
        { question: '  Relocation?  ', answer: '  Yes ' },
        { question: 'Sponsorship?', answer: 'No' },
      ],
    })
    expect(payload.questions).toEqual([
      { question: 'Relocation?', answer: 'Yes' },
      { question: 'Sponsorship?', answer: 'No' },
    ])
  })

  it('never adds unsupported fields (notes, status, recruiterId, …)', () => {
    const payload = toCreateApplicationRequest(base())
    const topLevel = Object.keys(payload).sort()
    expect(topLevel).toEqual(
      ['application', 'documents', 'studentId'].sort()
    )
    for (const bad of [
      'notes',
      'status',
      'recruiterId',
      'appliedAt',
      'isViewed',
      'createdAt',
    ]) {
      expect(payload).not.toHaveProperty(bad)
    }
  })
})
