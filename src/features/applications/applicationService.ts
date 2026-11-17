import { useMutation } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/apiClient'
import { env } from '@/lib/env'
import type {
  CreateApplicationRequest,
  CreateApplicationResponse,
} from '@/types/domain'
import { mockApi } from '@/mocks/mockApi'

export const CREATE_APPLICATION_PATH = '/api/v1/recruiter/applications'

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

export function useCreateApplication() {
  return useMutation({ mutationFn: createApplication })
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
            ? 'Unable to reach the service. The application may have been created — confirm before retrying to avoid a duplicate.'
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
