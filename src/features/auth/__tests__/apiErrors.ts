import { ApiError, type ApiErrorCode } from '@/lib/apiClient'

/** Build an ApiError as the apiClient interceptor would produce it. */
export function apiError(
  code: ApiErrorCode | string,
  status: number,
  extra: Partial<{
    message: string
    requestId: string
    fieldErrors: { field: string; message: string }[]
    /** Pass null to model API Gateway's code-less {"message": "..."} body. */
    backendCode: string | null
  }> = {}
) {
  return new ApiError({
    message: extra.message ?? `${code} message`,
    status,
    code: code as ApiErrorCode,
    requestId: extra.requestId,
    fieldErrors: extra.fieldErrors,
    backendCode: extra.backendCode === null ? undefined : (extra.backendCode ?? code),
  })
}
