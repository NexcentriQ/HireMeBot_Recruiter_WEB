export type RecruiterRole = 'RECRUITER' | 'ADMIN'

export interface RecruiterProfile {
  id: string
  email: string
  fullName: string
  role: RecruiterRole
  isActive: boolean
}

/**
 * The backend uses numeric 64-bit IDs. We model student IDs as `number`
 * because the Java API returns them as JSON numbers. Values that exceed
 * JavaScript's safe-integer range (> 2^53 - 1) will lose precision and
 * must be caught at the service boundary.
 */
export interface AssignedStudent {
  id: number
  fullName: string
  email: string
  isActive: boolean
}

// --- Backend request / response contract --------------------------------

/**
 * POST /api/v1/recruiter/applications request body.
 * Mirrors the exact JSON shape documented by the HireMeBot RecruiterLambda.
 * The server rejects unknown fields; do not add properties here without a
 * matching backend change.
 */
export interface CreateApplicationRequest {
  studentId: number
  application: {
    jobTitle: string
    companyName: string
    jobLocation: string
    jobLink: string
    jobSource: string
  }
  documents: {
    resumeObjectId: number
    coverLetterObjectId?: number
  }
  questions?: Array<{
    question: string
    answer: string
  }>
}

export interface CreateApplicationResponse {
  success: true
  message: string
  applicationId: number
}
