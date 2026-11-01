import { beforeEach, describe, expect, it, vi } from 'vitest'

// Force real-API mode for this test file. Must run BEFORE importing the
// service, since env is read at module load time.
vi.mock('@/lib/env', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/env')>('@/lib/env')
  return {
    ...actual,
    env: { ...actual.env, useMockApi: false, apiBaseUrl: 'http://127.0.0.1:3000' },
    isDevRecruiterMode: () => false,
  }
})

import { apiClient, ApiError } from '@/lib/apiClient'
import {
  createApplication,
  createApplicationErrorMessage,
  CREATE_APPLICATION_PATH,
} from '../applicationService'
import type { CreateApplicationRequest } from '@/types/domain'

function samplePayload(): CreateApplicationRequest {
  return {
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
  }
}

describe('createApplication (real API path)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to the documented endpoint and returns the parsed body on 201', async () => {
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({
        status: 201,
        data: {
          success: true,
          message: 'Application recorded successfully',
          applicationId: 1000000005,
        },
      } as never)

    const result = await createApplication(samplePayload())

    expect(postSpy).toHaveBeenCalledTimes(1)
    const [path, body] = postSpy.mock.calls[0]
    expect(path).toBe(CREATE_APPLICATION_PATH)
    expect(body).toEqual(samplePayload())
    expect(result.applicationId).toBe(1000000005)
    expect(result.success).toBe(true)
  })

  it('throws an ApiError with a sanitized message on malformed success', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      status: 201,
      data: { success: false },
    } as never)

    await expect(createApplication(samplePayload())).rejects.toBeInstanceOf(
      ApiError
    )
  })
})

describe('createApplicationErrorMessage', () => {
  it('maps VALIDATION_ERROR with details', () => {
    const err = new ApiError({
      message: 'Request validation failed',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: ['application.jobTitle is required'],
    })
    const info = createApplicationErrorMessage(err)
    expect(info.title).toMatch(/correct/i)
    expect(info.details).toEqual(['application.jobTitle is required'])
    expect(info.retryable).toBe(false)
  })

  it('maps CONFLICT to a duplicate message', () => {
    const err = new ApiError({
      message: 'duplicate',
      status: 409,
      code: 'CONFLICT',
    })
    const info = createApplicationErrorMessage(err)
    expect(info.title).toMatch(/duplicate/i)
    expect(info.retryable).toBe(false)
  })

  it('maps FORBIDDEN to an authorization message', () => {
    const err = new ApiError({
      message: 'student not assigned',
      status: 403,
      code: 'FORBIDDEN',
    })
    const info = createApplicationErrorMessage(err)
    expect(info.title).toMatch(/not permitted/i)
    expect(info.retryable).toBe(false)
  })

  it('marks SERVICE_UNAVAILABLE as retryable', () => {
    const err = new ApiError({
      message: 'down',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    })
    const info = createApplicationErrorMessage(err)
    expect(info.retryable).toBe(true)
  })

  it('warns on NETWORK_ERROR when the request may have been sent', () => {
    const err = new ApiError({
      message: 'network',
      status: 0,
      code: 'NETWORK_ERROR',
      possiblySent: true,
    })
    const info = createApplicationErrorMessage(err)
    expect(info.retryable).toBe(false)
    expect(info.description).toMatch(/may have been created/i)
  })
})
