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

export type ApplicationStatus =
  | 'APPLIED'
  | 'IN_REVIEW'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'

/** Shape used by the list/dashboard UI — flattened for table rendering. */
export interface JobApplication {
  id: number | string
  studentId: number
  studentName: string
  companyName: string
  jobTitle: string
  jobLink?: string
  jobLocation?: string
  jobSource?: string
  status: ApplicationStatus
  appliedDate: string
  createdByRecruiterId: string
}

export interface DashboardStats {
  totalApplications: number
  todayApplications: number
  assignedStudents: number
}

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface ApplicationQuery {
  search?: string
  studentId?: string
  dateRange?: 'all' | 'today' | 'last7' | 'last30'
  sortBy?: 'appliedDate'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
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

export interface ApiErrorBody {
  success: false
  error: string
  message: string
  details?: string[]
}
