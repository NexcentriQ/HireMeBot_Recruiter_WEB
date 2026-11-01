import { apiClient } from '@/lib/apiClient'
import { env } from '@/lib/env'
import type { RecruiterProfile } from '@/types/domain'
import { mockApi } from '@/mocks/mockApi'

export async function fetchRecruiterProfile(): Promise<RecruiterProfile> {
  if (env.useMockApi) {
    return mockApi.getRecruiterProfile()
  }
  const { data } = await apiClient.get<RecruiterProfile>('/recruiter/me')
  return data
}
