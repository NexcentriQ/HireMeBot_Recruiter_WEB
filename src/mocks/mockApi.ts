import type {
  AssignedStudent,
  CreateApplicationRequest,
  CreateApplicationResponse,
  RecruiterProfile,
} from '@/types/domain'
import { MOCK_RECRUITER, MOCK_STUDENTS } from './mockData'

const LATENCY_MS = 350

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

const state = {
  profile: { ...MOCK_RECRUITER },
  students: [...MOCK_STUDENTS],
}

let nextApplicationId = 2_000_000_000

export const mockApi = {
  async getRecruiterProfile(): Promise<RecruiterProfile> {
    return delay({ ...state.profile })
  },

  async getAssignedStudents(): Promise<AssignedStudent[]> {
    return delay(state.students.filter((s) => s.isActive).map((s) => ({ ...s })))
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
    return delay({
      success: true,
      message: 'Application recorded successfully',
      applicationId,
    })
  },
}
