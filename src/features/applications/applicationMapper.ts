import type { CreateApplicationRequest } from '@/types/domain'
import type { ParsedCreateApplicationFormValues } from './applicationSchemas'

/**
 * Transform the validated React Hook Form values into the exact JSON
 * payload accepted by POST /api/v1/recruiter/applications.
 *
 * - Trims string values.
 * - Resolves `jobSourceOption` + optional `jobSourceCustom` into the
 *   single `application.jobSource` field.
 * - Converts the string-form IDs to numbers (safe-integer-validated by
 *   the schema upstream).
 * - Omits the optional `documents.coverLetterObjectId` when blank.
 * - Omits `questions` entirely when empty.
 */
export function toCreateApplicationRequest(
  values: ParsedCreateApplicationFormValues
): CreateApplicationRequest {
  const jobSource =
    values.jobSourceOption === 'Other'
      ? (values.jobSourceCustom ?? '').trim()
      : values.jobSourceOption

  const payload: CreateApplicationRequest = {
    studentId: Number(values.studentId),
    application: {
      jobTitle: values.jobTitle.trim(),
      companyName: values.companyName.trim(),
      jobLocation: values.jobLocation.trim(),
      jobLink: values.jobLink.trim(),
      jobSource,
    },
    documents: {
      resumeObjectId: Number(values.resumeObjectId),
    },
  }

  const coverLetter = (values.coverLetterObjectId ?? '').trim()
  if (coverLetter) {
    payload.documents.coverLetterObjectId = Number(coverLetter)
  }

  const questions = (values.questions ?? [])
    .map((q) => ({
      question: q.question.trim(),
      answer: q.answer.trim(),
    }))
    .filter((q) => q.question.length > 0 && q.answer.length > 0)

  if (questions.length > 0) {
    payload.questions = questions
  }

  return payload
}
