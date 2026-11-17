import { apiClient, ApiError } from '@/lib/apiClient'
import { env } from '@/lib/env'
import type {
  RegisterDocumentRequest,
  RegisterDocumentResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@/types/document'
import { mockDocumentsApi } from '@/mocks/mockDocumentsApi'

export const UPLOAD_URL_PATH = '/api/v1/documents/upload-url'
export const REGISTER_DOCUMENT_PATH = '/api/v1/documents/register'

/**
 * POST /api/v1/documents/upload-url
 *
 * Returns either:
 *   - ALREADY_EXISTS: the same student already owns a document with these bytes
 *     and the backend returns the existing `objectId`. No S3 PUT required.
 *   - UPLOAD_REQUIRED: a presigned S3 PUT URL + the exact headers the browser
 *     must send. The frontend must then upload to S3 and call /register.
 *
 * The request contains EXACTLY the documented fields. The backend uses strict
 * JSON validation and will reject unknown properties.
 */
export async function requestUploadUrl(
  req: UploadUrlRequest
): Promise<UploadUrlResponse> {
  if (env.useMockApi) return mockDocumentsApi.requestUploadUrl(req)

  const { data, status } = await apiClient.post<UploadUrlResponse>(
    UPLOAD_URL_PATH,
    req,
    { validateStatus: (s) => s === 200 }
  )

  if (!data || data.success !== true) {
    throw new ApiError({
      message: 'Server returned a malformed upload-url response.',
      status,
      code: 'UNKNOWN',
    })
  }

  if (data.status === 'ALREADY_EXISTS') {
    if (typeof data.objectId !== 'number') {
      throw new ApiError({
        message: 'ALREADY_EXISTS response did not include an objectId.',
        status,
        code: 'UNKNOWN',
      })
    }
    return data
  }

  if (data.status === 'UPLOAD_REQUIRED') {
    if (
      typeof data.uploadUrl !== 'string' ||
      typeof data.objectKey !== 'string' ||
      typeof data.uploadToken !== 'string' ||
      !data.requiredHeaders ||
      typeof data.requiredHeaders !== 'object'
    ) {
      throw new ApiError({
        message: 'UPLOAD_REQUIRED response was missing required fields.',
        status,
        code: 'UNKNOWN',
      })
    }
    return data
  }

  throw new ApiError({
    message: 'Server returned an unknown upload-url status.',
    status,
    code: 'UNKNOWN',
  })
}

/**
 * POST /api/v1/documents/register
 *
 * Called ONLY after a successful S3 PUT. Idempotent: replaying with the same
 * token/key returns the same `objectId`. Token is valid ~30 min after it is
 * issued by requestUploadUrl.
 */
export async function registerDocument(
  req: RegisterDocumentRequest
): Promise<RegisterDocumentResponse> {
  if (env.useMockApi) return mockDocumentsApi.registerDocument(req)

  const { data, status } = await apiClient.post<RegisterDocumentResponse>(
    REGISTER_DOCUMENT_PATH,
    req,
    { validateStatus: (s) => s === 200 || s === 201 }
  )

  if (
    !data ||
    data.success !== true ||
    data.status !== 'SUCCESS' ||
    typeof data.objectId !== 'number'
  ) {
    throw new ApiError({
      message: 'Server returned a malformed register response.',
      status,
      code: 'UNKNOWN',
    })
  }

  return data
}
