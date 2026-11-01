import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/apiClient'
import { env } from '@/lib/env'
import type {
  ApplicationQuery,
  CreateApplicationRequest,
  CreateApplicationResponse,
  DashboardStats,
  JobApplication,
  Paginated,
} from '@/types/domain'
import { mockApi } from '@/mocks/mockApi'

export const CREATE_APPLICATION_PATH = '/api/v1/recruiter/applications'

export const applicationKeys = {
  all: ['applications'] as const,
  list: (q: ApplicationQuery) => ['applications', 'list', q] as const,
  recent: (limit: number) => ['applications', 'recent', limit] as const,
  stats: () => ['dashboard', 'stats'] as const,
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (env.useMockApi) return mockApi.getDashboardStats()
  const { data } = await apiClient.get<DashboardStats>('/recruiter/dashboard')
  return data
}

export async function fetchRecentApplications(
  limit = 5
): Promise<JobApplication[]> {
  if (env.useMockApi) return mockApi.getRecentApplications(limit)
  const { data } = await apiClient.get<Paginated<JobApplication>>(
    '/recruiter/applications',
    {
      params: {
        page: 1,
        pageSize: limit,
        sortBy: 'appliedDate',
        sortDir: 'desc',
      },
    }
  )
  return data.items
}

export async function listApplications(
  q: ApplicationQuery
): Promise<Paginated<JobApplication>> {
  if (env.useMockApi) return mockApi.listApplications(q)
  const { data } = await apiClient.get<Paginated<JobApplication>>(
    '/recruiter/applications',
    { params: q }
  )
  return data
}

/**
 * POST /api/v1/recruiter/applications
 *
 * Succeeds only on HTTP 201 with `success: true` and a numeric application
 * ID in the response body. Any other outcome is rejected as an {@link ApiError}
 * carrying the backend error code + validation details when present.
 */
export async function createApplication(
  payload: CreateApplicationRequest
): Promise<CreateApplicationResponse> {
  if (env.useMockApi) {
    return mockApi.createApplication(payload)
  }

  const response = await apiClient.post<CreateApplicationResponse>(
    CREATE_APPLICATION_PATH,
    payload,
    {
      // Treat only 201 as a true success. Any other 2xx is suspicious
      // and should surface as an error for the UI to inspect.
      validateStatus: (status) => status === 201,
    }
  )

  const body = response.data
  if (!body || body.success !== true || typeof body.applicationId !== 'number') {
    throw new ApiError({
      message: 'Server returned a malformed success response.',
      status: response.status,
      code: 'UNKNOWN',
    })
  }
  return body
}

export function useDashboardStats() {
  return useQuery({
    queryKey: applicationKeys.stats(),
    queryFn: fetchDashboardStats,
  })
}

export function useRecentApplications(limit = 5) {
  return useQuery({
    queryKey: applicationKeys.recent(limit),
    queryFn: () => fetchRecentApplications(limit),
  })
}

export function useApplicationsList(q: ApplicationQuery) {
  return useQuery({
    queryKey: applicationKeys.list(q),
    queryFn: () => listApplications(q),
    placeholderData: (prev) => prev,
  })
}

export function useCreateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: applicationKeys.all })
      void qc.invalidateQueries({ queryKey: applicationKeys.stats() })
    },
  })
}

/**
 * Pick the user-facing message for a `createApplication` failure.
 * Keeps response-text and status-code mapping out of the UI component.
 */
export function createApplicationErrorMessage(err: unknown): {
  title: string
  description?: string
  details?: string[]
  retryable: boolean
} {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'VALIDATION_ERROR':
      case 'BAD_REQUEST':
        return {
          title: 'Please correct the highlighted fields.',
          description: err.message,
          details: err.details,
          retryable: false,
        }
      case 'FORBIDDEN':
        return {
          title: 'Request not permitted',
          description:
            err.message ||
            'This student may not be assigned to you, or the resume / cover letter is not accessible.',
          retryable: false,
        }
      case 'CONFLICT':
        return {
          title: 'Duplicate application',
          description:
            'An application for this student and job posting already exists.',
          retryable: false,
        }
      case 'INTERNAL_ERROR':
        return {
          title: 'Something went wrong',
          description:
            'Something went wrong while creating the application. Please try again.',
          retryable: true,
        }
      case 'SERVICE_UNAVAILABLE':
        return {
          title: 'Service unavailable',
          description:
            'The application service is temporarily unavailable. Please try again later.',
          retryable: true,
        }
      case 'NETWORK_ERROR':
        return {
          title: 'Connection failed',
          description: err.possiblySent
            ? 'Unable to reach the service. The application may have been created — check My Applications before retrying.'
            : 'Unable to connect to the application service. Check your connection and try again.',
          retryable: !err.possiblySent,
        }
      case 'UNAUTHORIZED':
        return {
          title: 'Not authenticated',
          description:
            'Your session is not authorized to create applications.',
          retryable: false,
        }
      default:
        return {
          title: 'Could not create the application',
          description: err.message,
          retryable: true,
        }
    }
  }
  return {
    title: 'Could not create the application',
    description: err instanceof Error ? err.message : undefined,
    retryable: true,
  }
}
