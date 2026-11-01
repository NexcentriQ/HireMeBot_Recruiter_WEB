import type {
  ApplicationQuery,
  AssignedStudent,
  CreateApplicationRequest,
  CreateApplicationResponse,
  DashboardStats,
  JobApplication,
  Paginated,
  RecruiterProfile,
} from '@/types/domain'
import { isSameDay } from '@/lib/utils'
import { MOCK_RECRUITER, MOCK_STUDENTS, SEED_APPLICATIONS } from './mockData'

const LATENCY_MS = 350

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

const state = {
  profile: { ...MOCK_RECRUITER },
  students: [...MOCK_STUDENTS],
  applications: [...SEED_APPLICATIONS],
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function withinDateRange(appliedISO: string, range?: string): boolean {
  if (!range || range === 'all') return true
  const applied = new Date(appliedISO)
  const now = new Date()
  if (range === 'today') return isSameDay(applied, now)
  const days = range === 'last7' ? 7 : range === 'last30' ? 30 : 0
  if (!days) return true
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return applied >= cutoff
}

let nextApplicationId = 2_000_000_000

export const mockApi = {
  async getRecruiterProfile(): Promise<RecruiterProfile> {
    return delay({ ...state.profile })
  },

  async getAssignedStudents(): Promise<AssignedStudent[]> {
    return delay(state.students.filter((s) => s.isActive).map((s) => ({ ...s })))
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const today = startOfToday()
    const mine = state.applications.filter(
      (a) => a.createdByRecruiterId === state.profile.id
    )
    const todayCount = mine.filter(
      (a) => new Date(a.appliedDate) >= today
    ).length
    return delay({
      totalApplications: mine.length,
      todayApplications: todayCount,
      assignedStudents: state.students.filter((s) => s.isActive).length,
    })
  },

  async getRecentApplications(limit = 5): Promise<JobApplication[]> {
    const mine = state.applications
      .filter((a) => a.createdByRecruiterId === state.profile.id)
      .sort(
        (a, b) =>
          new Date(b.appliedDate).getTime() -
          new Date(a.appliedDate).getTime()
      )
    return delay(mine.slice(0, limit).map((a) => ({ ...a })))
  },

  async listApplications(
    q: ApplicationQuery = {}
  ): Promise<Paginated<JobApplication>> {
    const {
      search,
      studentId,
      dateRange,
      sortBy = 'appliedDate',
      sortDir = 'desc',
      page = 1,
      pageSize = 20,
    } = q

    let items = state.applications.filter(
      (a) => a.createdByRecruiterId === state.profile.id
    )

    if (studentId && studentId !== 'all') {
      const parsed = Number(studentId)
      if (Number.isFinite(parsed)) {
        items = items.filter((a) => a.studentId === parsed)
      }
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase()
      items = items.filter(
        (a) =>
          a.companyName.toLowerCase().includes(s) ||
          a.jobTitle.toLowerCase().includes(s) ||
          a.studentName.toLowerCase().includes(s)
      )
    }

    items = items.filter((a) => withinDateRange(a.appliedDate, dateRange))

    items.sort((a, b) => {
      if (sortBy === 'appliedDate') {
        const diff =
          new Date(a.appliedDate).getTime() -
          new Date(b.appliedDate).getTime()
        return sortDir === 'asc' ? diff : -diff
      }
      return 0
    })

    const totalItems = items.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * pageSize
    const paged = items.slice(start, start + pageSize).map((a) => ({ ...a }))

    return delay({
      items: paged,
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    })
  },

  /**
   * Mock submission that accepts the exact production request shape so
   * dev-mode UI testing exercises the real payload mapper.
   */
  async createApplication(
    input: CreateApplicationRequest
  ): Promise<CreateApplicationResponse> {
    const student = state.students.find(
      (s) => s.id === input.studentId && s.isActive
    )
    if (!student) {
      throw new Error('Selected student is not assigned to you.')
    }
    const applicationId = ++nextApplicationId
    const row: JobApplication = {
      id: applicationId,
      studentId: student.id,
      studentName: student.fullName,
      companyName: input.application.companyName,
      jobTitle: input.application.jobTitle,
      jobLink: input.application.jobLink,
      jobLocation: input.application.jobLocation,
      jobSource: input.application.jobSource,
      status: 'APPLIED',
      appliedDate: new Date().toISOString(),
      createdByRecruiterId: state.profile.id,
    }
    state.applications = [row, ...state.applications]
    return delay({
      success: true,
      message: 'Application recorded successfully',
      applicationId,
    })
  },
}
