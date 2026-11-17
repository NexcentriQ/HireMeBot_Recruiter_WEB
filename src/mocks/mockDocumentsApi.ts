import type {
  RegisterDocumentRequest,
  RegisterDocumentResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@/types/document'

/**
 * In-memory mock of the DocumentManagementLambda contract.
 *
 * Mirrors the two-step flow and the global SHA-256 uniqueness rule so the UI
 * can be developed and demoed without a running backend.
 *
 *  - If (studentId, checksum) already exists, returns ALREADY_EXISTS.
 *  - If the same checksum exists under another student (or another type),
 *    throws DUPLICATE_DOCUMENT.
 *  - Otherwise returns UPLOAD_REQUIRED. The returned "presigned URL" is a
 *    data: URL that the mock S3 uploader intentionally skips — it is never
 *    dereferenced by the mock to avoid touching the network.
 *  - register() verifies the token was issued by this same mock and that the
 *    key matches.
 */

interface MockObject {
  objectId: number
  studentId: number
  documentType: UploadUrlRequest['documentType']
  objectKey: string
  checksum: string
}

interface MockToken {
  issuedAt: number
  req: UploadUrlRequest
  objectKey: string
  uploadToken: string
}

const LATENCY_MS = 300

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

const state = {
  objects: [] as MockObject[],
  tokens: new Map<string, MockToken>(),
  nextObjectId: 1_000_000_100,
}

function mintUploadToken(req: UploadUrlRequest, objectKey: string): string {
  const token = `mock-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  state.tokens.set(token, {
    issuedAt: Date.now(),
    req,
    objectKey,
    uploadToken: token,
  })
  return token
}

function buildObjectKey(req: UploadUrlRequest): string {
  const prefix = req.documentType === 'RESUME' ? 'resumes' : 'cover-letters'
  const uuid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const ext = req.contentType === 'application/pdf' ? 'pdf' : 'docx'
  return `students/${req.studentId}/${prefix}/${uuid}.${ext}`
}

/** Throws a shape that the apiClient-style errors would throw. */
function throwError(opts: {
  status: number
  code: string
  message: string
}): never {
  const err = new Error(opts.message) as Error & {
    status: number
    code: string
  }
  err.status = opts.status
  err.code = opts.code
  throw err
}

export const mockDocumentsApi = {
  async requestUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse> {
    if (req.documentType === 'COVER_LETTER') {
      throwError({
        status: 400,
        code: 'DOCUMENT_TYPE_NOT_ENABLED',
        message: 'Cover letter uploads are not available yet.',
      })
    }

    const sameStudentSameType = state.objects.find(
      (o) =>
        o.studentId === req.studentId &&
        o.documentType === req.documentType &&
        o.checksum === req.checksum
    )
    if (sameStudentSameType) {
      return delay<UploadUrlResponse>({
        success: true,
        status: 'ALREADY_EXISTS',
        uploadRequired: false,
        objectId: sameStudentSameType.objectId,
      })
    }

    const anyMatch = state.objects.find((o) => o.checksum === req.checksum)
    if (anyMatch) {
      throwError({
        status: 409,
        code: 'DUPLICATE_DOCUMENT',
        message: 'This document is already registered.',
      })
    }

    const objectKey = buildObjectKey(req)
    const token = mintUploadToken(req, objectKey)

    return delay<UploadUrlResponse>({
      success: true,
      status: 'UPLOAD_REQUIRED',
      uploadRequired: true,
      objectKey,
      // Marked so the mock uploader can short-circuit the network PUT.
      uploadUrl: `mock://s3/${objectKey}`,
      uploadToken: token,
      expiresIn: 300,
      requiredHeaders: {
        'Content-Type': req.contentType,
        'x-amz-checksum-sha256': 'mock-base64-checksum',
        'x-amz-tagging': 'doc-state=pending',
      },
    })
  },

  async registerDocument(
    req: RegisterDocumentRequest
  ): Promise<RegisterDocumentResponse> {
    const token = state.tokens.get(req.uploadToken)
    if (!token) {
      throwError({
        status: 400,
        code: 'UPLOAD_TOKEN_INVALID',
        message: 'Upload token is invalid. Please start the upload again.',
      })
    }
    if (Date.now() - token.issuedAt > 30 * 60 * 1000) {
      throwError({
        status: 400,
        code: 'UPLOAD_TOKEN_EXPIRED',
        message: 'Upload token has expired. Please start the upload again.',
      })
    }
    if (token.objectKey !== req.objectKey) {
      throwError({
        status: 400,
        code: 'UPLOAD_VERIFICATION_FAILED',
        message: 'Upload verification failed.',
      })
    }
    if (
      token.req.studentId !== req.studentId ||
      token.req.documentType !== req.documentType ||
      token.req.checksum !== req.checksum
    ) {
      throwError({
        status: 400,
        code: 'UPLOAD_VERIFICATION_FAILED',
        message: 'Upload verification failed.',
      })
    }

    const existing = state.objects.find((o) => o.objectKey === req.objectKey)
    if (existing) {
      // Idempotent replay.
      state.tokens.delete(req.uploadToken)
      return delay<RegisterDocumentResponse>({
        success: true,
        status: 'SUCCESS',
        objectId: existing.objectId,
        studentId: existing.studentId,
        documentType: existing.documentType,
        message: 'Resume uploaded successfully',
      })
    }

    const objectId = ++state.nextObjectId
    state.objects.push({
      objectId,
      studentId: req.studentId,
      documentType: req.documentType,
      objectKey: req.objectKey,
      checksum: req.checksum,
    })
    state.tokens.delete(req.uploadToken)

    return delay<RegisterDocumentResponse>({
      success: true,
      status: 'SUCCESS',
      objectId,
      studentId: req.studentId,
      documentType: req.documentType,
      message: 'Resume uploaded successfully',
    })
  },

  /** Test hook: wipe state between tests. */
  _resetForTests() {
    state.objects.length = 0
    state.tokens.clear()
    state.nextObjectId = 1_000_000_100
  },
}
