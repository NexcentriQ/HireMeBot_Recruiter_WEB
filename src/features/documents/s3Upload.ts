/**
 * Direct browser-to-S3 PUT using XMLHttpRequest.
 *
 * XHR is used instead of fetch() because it exposes progress events on the
 * upload side. We intentionally:
 *   - send the raw File as the request body (no FormData, no multipart)
 *   - send ONLY the signed headers the backend returned, nothing else
 *   - never attach the app's JWT, Cognito token, or X-Dev-Recruiter-Id
 *   - never set Content-Length (the browser sets it)
 *   - treat only HTTP 200 as success
 */

export type S3UploadErrorCode =
  | 'S3_NETWORK_ERROR'
  | 'S3_TIMEOUT'
  | 'S3_ABORTED'
  | 'S3_FORBIDDEN'
  | 'S3_BAD_REQUEST'
  | 'S3_FAILED'

export class S3UploadError extends Error {
  code: S3UploadErrorCode
  status: number
  constructor(code: S3UploadErrorCode, status: number, message: string) {
    super(message)
    this.name = 'S3UploadError'
    this.code = code
    this.status = status
  }
}

export interface S3UploadParams {
  uploadUrl: string
  requiredHeaders: Record<string, string>
  file: File
  onProgress?: (percentage: number) => void
  signal?: AbortSignal
  /** PUT timeout in ms. Defaults to 2 minutes. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000

/** Headers the browser sets itself; we must not try to override them. */
const BROWSER_MANAGED_HEADERS = new Set(['content-length', 'host'])

export function uploadFileToS3(params: S3UploadParams): Promise<void> {
  const {
    uploadUrl,
    requiredHeaders,
    file,
    onProgress,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new S3UploadError('S3_ABORTED', 0, 'Upload cancelled.'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)

    // Never send credentials — the signed URL carries its own auth.
    xhr.withCredentials = false
    xhr.timeout = timeoutMs

    for (const [key, value] of Object.entries(requiredHeaders ?? {})) {
      if (BROWSER_MANAGED_HEADERS.has(key.toLowerCase())) continue
      try {
        xhr.setRequestHeader(key, value)
      } catch {
        // Some browsers refuse to set forbidden headers; the signed URL
        // response is authoritative, so surface this as a bad request rather
        // than silently sending a weaker PUT.
        reject(
          new S3UploadError(
            'S3_BAD_REQUEST',
            0,
            `Browser refused to set the required header "${key}".`
          )
        )
        xhr.abort()
        return
      }
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.round((event.loaded / event.total) * 100)
        onProgress(Math.min(99, pct))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        onProgress?.(100)
        resolve()
        return
      }
      const code: S3UploadErrorCode =
        xhr.status === 403
          ? 'S3_FORBIDDEN'
          : xhr.status === 400
            ? 'S3_BAD_REQUEST'
            : 'S3_FAILED'
      reject(
        new S3UploadError(
          code,
          xhr.status,
          `S3 rejected the upload (HTTP ${xhr.status}).`
        )
      )
    }

    xhr.onerror = () =>
      reject(
        new S3UploadError(
          'S3_NETWORK_ERROR',
          0,
          'Network error while uploading to S3.'
        )
      )
    xhr.ontimeout = () =>
      reject(new S3UploadError('S3_TIMEOUT', 0, 'Upload to S3 timed out.'))
    xhr.onabort = () =>
      reject(new S3UploadError('S3_ABORTED', 0, 'Upload cancelled.'))

    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    xhr.send(file)
  })
}

/**
 * Mock-mode helper. When the upload URL is a sentinel string issued by the
 * in-memory documents mock, there is no network peer to talk to, so we
 * simulate progress and resolve.
 */
export function isMockUploadUrl(url: string): boolean {
  return url.startsWith('mock://s3/')
}

export async function simulateMockUpload(params: {
  onProgress?: (pct: number) => void
  signal?: AbortSignal
}): Promise<void> {
  const { onProgress, signal } = params
  const steps = [15, 35, 60, 85, 100]
  for (const pct of steps) {
    if (signal?.aborted) {
      throw new S3UploadError('S3_ABORTED', 0, 'Upload cancelled.')
    }
    await new Promise((r) => setTimeout(r, 120))
    onProgress?.(pct)
  }
}
