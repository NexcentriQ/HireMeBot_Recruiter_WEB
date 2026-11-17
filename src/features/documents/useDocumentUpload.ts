import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { env } from '@/lib/env'
import { sha256Hex } from '@/lib/sha256'
import {
  documentTypeLabel,
  validateDocumentFile,
} from '@/lib/documentValidation'
import {
  registerDocument,
  requestUploadUrl,
} from './documentsService'
import {
  isMockUploadUrl,
  S3UploadError,
  simulateMockUpload,
  uploadFileToS3,
} from './s3Upload'
import type {
  DocumentType,
  RegisterDocumentRequest,
  UploadRequiredResponse,
} from '@/types/document'

export type UploadStatus =
  | 'idle'
  | 'validating'
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'registering'
  | 'succeeded'
  | 'alreadyExists'
  | 'failed'

export type UploadErrorCode =
  | 'VALIDATION_ERROR'
  | 'HASH_FAILED'
  | 'DUPLICATE_DOCUMENT'
  | 'DOCUMENT_UNAVAILABLE'
  | 'DOCUMENT_TYPE_NOT_ENABLED'
  | 'UPLOAD_TOKEN_EXPIRED'
  | 'UPLOAD_TOKEN_INVALID'
  | 'UPLOAD_NOT_FOUND'
  | 'UPLOAD_VERIFICATION_FAILED'
  | 'INVALID_FILE_FORMAT'
  | 'FORBIDDEN'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'S3_UPLOAD_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN'

export interface UploadErrorInfo {
  code: UploadErrorCode
  message: string
  /** True when a retry *of the current step only* (upload vs. register) is safe. */
  retryable: boolean
  /** True when retrying requires restarting from upload-url (e.g. token expired). */
  needsFreshUrl: boolean
}

interface UseDocumentUploadArgs {
  studentId: number | null
  documentType: DocumentType
  onRegistered?: (objectId: number) => void
}

interface PendingUpload {
  file: File
  checksum: string
  presign: UploadRequiredResponse
  issuedAt: number
}

/**
 * Orchestrates the resume/cover-letter upload flow:
 *   validate -> hash -> upload-url -> S3 PUT -> register.
 *
 * State transitions are the single source of truth for the UI. The hook
 * aborts all in-flight work on unmount and whenever the parent swaps the
 * studentId, so a late response can never restore another student's upload.
 */
export function useDocumentUpload(args: UseDocumentUploadArgs) {
  const { studentId, documentType, onRegistered } = args

  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<UploadErrorInfo | null>(null)
  const [objectId, setObjectId] = useState<number | null>(null)
  const [fileMeta, setFileMeta] = useState<{
    name: string
    size: number
  } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<PendingUpload | null>(null)
  const runIdRef = useRef(0)
  const studentIdRef = useRef(studentId)
  const onRegisteredRef = useRef(onRegistered)

  useEffect(() => {
    onRegisteredRef.current = onRegistered
  }, [onRegistered])

  // Abort + reset when the student changes or on unmount.
  useEffect(() => {
    if (studentIdRef.current !== studentId) {
      studentIdRef.current = studentId
      abortAll()
      hardReset()
    }
  }, [studentId])

  useEffect(() => {
    return () => abortAll()
  }, [])

  function abortAll() {
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current++
  }

  function hardReset() {
    pendingRef.current = null
    setStatus('idle')
    setProgress(0)
    setError(null)
    setObjectId(null)
    setFileMeta(null)
  }

  /**
   * Start the full flow for a newly selected file. Any in-flight work for
   * a previous file is cancelled first — only one upload runs per hook.
   */
  const startUpload = useCallback(
    async (file: File) => {
      if (!studentId) {
        setError({
          code: 'VALIDATION_ERROR',
          message: 'Select a student before uploading.',
          retryable: false,
          needsFreshUrl: false,
        })
        setStatus('failed')
        return
      }

      abortAll()
      hardReset()

      const myRun = ++runIdRef.current
      const controller = new AbortController()
      abortRef.current = controller

      setFileMeta({ name: file.name, size: file.size })

      setStatus('validating')
      const validation = validateDocumentFile(file)
      if (!validation.ok) {
        setError({
          code: 'VALIDATION_ERROR',
          message: validation.message,
          retryable: false,
          needsFreshUrl: false,
        })
        setStatus('failed')
        return
      }

      // --- hash ---
      setStatus('hashing')
      let checksum: string
      try {
        checksum = await sha256Hex(file)
      } catch (err) {
        if (!isCurrentRun(myRun)) return
        setError({
          code: 'HASH_FAILED',
          message:
            err instanceof Error
              ? err.message
              : 'Unable to compute file checksum.',
          retryable: false,
          needsFreshUrl: false,
        })
        setStatus('failed')
        return
      }
      if (!isCurrentRun(myRun)) return

      // --- upload-url ---
      setStatus('checking')
      let presignResponse
      try {
        presignResponse = await requestUploadUrl({
          studentId,
          documentType,
          fileName: file.name,
          contentType: validation.contentType,
          fileSize: file.size,
          checksum,
        })
      } catch (err) {
        if (!isCurrentRun(myRun)) return
        setError(mapCheckError(err))
        setStatus('failed')
        return
      }
      if (!isCurrentRun(myRun)) return

      if (presignResponse.status === 'ALREADY_EXISTS') {
        setObjectId(presignResponse.objectId)
        setProgress(100)
        setStatus('alreadyExists')
        onRegisteredRef.current?.(presignResponse.objectId)
        return
      }

      pendingRef.current = {
        file,
        checksum,
        presign: presignResponse,
        issuedAt: Date.now(),
      }

      // --- S3 upload ---
      await runUploadAndRegister({
        myRun,
        file,
        checksum,
        presign: presignResponse,
        signal: controller.signal,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studentId, documentType]
  )

  async function runUploadAndRegister(input: {
    myRun: number
    file: File
    checksum: string
    presign: UploadRequiredResponse
    signal: AbortSignal
  }) {
    const { myRun, file, checksum, presign, signal } = input

    setProgress(0)
    setStatus('uploading')

    try {
      if (env.useMockApi || isMockUploadUrl(presign.uploadUrl)) {
        await simulateMockUpload({
          onProgress: (pct) => {
            if (isCurrentRun(myRun)) setProgress(pct)
          },
          signal,
        })
      } else {
        await uploadFileToS3({
          uploadUrl: presign.uploadUrl,
          requiredHeaders: presign.requiredHeaders,
          file,
          onProgress: (pct) => {
            if (isCurrentRun(myRun)) setProgress(pct)
          },
          signal,
        })
      }
    } catch (err) {
      if (!isCurrentRun(myRun)) return
      setError(mapS3Error(err))
      setStatus('failed')
      return
    }
    if (!isCurrentRun(myRun)) return

    // --- register ---
    setStatus('registering')
    try {
      const res = await registerDocument(buildRegisterRequest({
        studentId: studentIdRef.current as number,
        documentType,
        checksum,
        presign,
      }))
      if (!isCurrentRun(myRun)) return
      setObjectId(res.objectId)
      setStatus('succeeded')
      // Keep pending metadata for a possible display, but drop the token
      // + URL from memory the moment it is no longer needed.
      pendingRef.current = null
      onRegisteredRef.current?.(res.objectId)
    } catch (err) {
      if (!isCurrentRun(myRun)) return
      setError(mapRegisterError(err))
      setStatus('failed')
    }
  }

  /** Retry the last failed step without re-hashing or re-uploading when possible. */
  const retryUpload = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending || !studentIdRef.current) {
      // Nothing to retry; the UI should prompt the user to pick a file.
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const myRun = ++runIdRef.current
    setError(null)

    // If we only failed at register, do not re-upload.
    if (status === 'failed' && error?.needsFreshUrl) {
      // Token/URL is stale — start over from upload-url with the same file.
      await startUpload(pending.file)
      return
    }
    if (status === 'failed' && error?.code === 'S3_UPLOAD_FAILED') {
      await runUploadAndRegister({
        myRun,
        file: pending.file,
        checksum: pending.checksum,
        presign: pending.presign,
        signal: controller.signal,
      })
      return
    }

    // Default: assume the register step failed — re-POST /register only.
    setStatus('registering')
    try {
      const res = await registerDocument(buildRegisterRequest({
        studentId: studentIdRef.current as number,
        documentType,
        checksum: pending.checksum,
        presign: pending.presign,
      }))
      if (!isCurrentRun(myRun)) return
      setObjectId(res.objectId)
      setStatus('succeeded')
      pendingRef.current = null
      onRegisteredRef.current?.(res.objectId)
    } catch (err) {
      if (!isCurrentRun(myRun)) return
      setError(mapRegisterError(err))
      setStatus('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error, documentType, startUpload])

  const cancelUpload = useCallback(() => {
    abortAll()
    pendingRef.current = null
    if (status === 'uploading' || status === 'registering' || status === 'checking' || status === 'hashing') {
      setStatus('idle')
      setProgress(0)
      setFileMeta(null)
    }
  }, [status])

  const resetUpload = useCallback(() => {
    abortAll()
    hardReset()
  }, [])

  function isCurrentRun(id: number) {
    return id === runIdRef.current
  }

  return {
    status,
    progress,
    error,
    objectId,
    fileMeta,
    documentLabel: documentTypeLabel(documentType),
    startUpload,
    retryUpload,
    cancelUpload,
    resetUpload,
    /** True while any network-bound step is running. */
    isBusy:
      status === 'validating' ||
      status === 'hashing' ||
      status === 'checking' ||
      status === 'uploading' ||
      status === 'registering',
  }
}

function buildRegisterRequest(input: {
  studentId: number
  documentType: DocumentType
  checksum: string
  presign: UploadRequiredResponse
}): RegisterDocumentRequest {
  return {
    studentId: input.studentId,
    documentType: input.documentType,
    objectKey: input.presign.objectKey,
    checksum: input.checksum,
    uploadToken: input.presign.uploadToken,
  }
}

// ----- Error mapping -----

function mapCheckError(err: unknown): UploadErrorInfo {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'CONFLICT':
      case ('DUPLICATE_DOCUMENT' as never):
        return {
          code: 'DUPLICATE_DOCUMENT',
          message: 'This document is already registered.',
          retryable: false,
          needsFreshUrl: false,
        }
      case ('DOCUMENT_UNAVAILABLE' as never):
        return {
          code: 'DOCUMENT_UNAVAILABLE',
          message: 'This document is not available right now. Please contact support.',
          retryable: false,
          needsFreshUrl: false,
        }
      case ('DOCUMENT_TYPE_NOT_ENABLED' as never):
        return {
          code: 'DOCUMENT_TYPE_NOT_ENABLED',
          message: 'This document type is not available yet.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'FORBIDDEN':
        return {
          code: 'FORBIDDEN',
          message:
            err.message ||
            'You are not authorized to upload documents for this student.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'VALIDATION_ERROR':
      case 'BAD_REQUEST':
        return {
          code: 'INVALID_FILE_FORMAT',
          message: err.message || 'Invalid document.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'SERVICE_UNAVAILABLE':
        return {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The document service is temporarily unavailable. Try again shortly.',
          retryable: true,
          needsFreshUrl: true,
        }
      case 'NETWORK_ERROR':
        return {
          code: 'NETWORK_ERROR',
          message: 'Unable to reach the document service. Check your connection and try again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case 'INTERNAL_ERROR':
        return {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
          retryable: true,
          needsFreshUrl: true,
        }
      default:
        return {
          code: 'UNKNOWN',
          message: err.message || 'Document check failed.',
          retryable: true,
          needsFreshUrl: true,
        }
    }
  }
  // Fallback for the mock error shape (plain Error with .code).
  const anyErr = err as { code?: string; message?: string } | undefined
  if (anyErr?.code === 'DUPLICATE_DOCUMENT') {
    return {
      code: 'DUPLICATE_DOCUMENT',
      message: 'This document is already registered.',
      retryable: false,
      needsFreshUrl: false,
    }
  }
  if (anyErr?.code === 'DOCUMENT_TYPE_NOT_ENABLED') {
    return {
      code: 'DOCUMENT_TYPE_NOT_ENABLED',
      message: anyErr.message || 'This document type is not available yet.',
      retryable: false,
      needsFreshUrl: false,
    }
  }
  return {
    code: 'UNKNOWN',
    message:
      anyErr?.message || 'Unable to request an upload URL. Please try again.',
    retryable: true,
    needsFreshUrl: true,
  }
}

function mapS3Error(err: unknown): UploadErrorInfo {
  if (err instanceof S3UploadError) {
    switch (err.code) {
      case 'S3_ABORTED':
        return {
          code: 'CANCELLED',
          message: 'Upload cancelled.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'S3_FORBIDDEN':
        // Likely expired or signature mismatch. Fresh URL is safest.
        return {
          code: 'UPLOAD_TOKEN_EXPIRED',
          message: 'The upload link has expired. Please try again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case 'S3_BAD_REQUEST':
        return {
          code: 'UPLOAD_VERIFICATION_FAILED',
          message: 'S3 rejected the upload. Please try again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case 'S3_NETWORK_ERROR':
      case 'S3_TIMEOUT':
      case 'S3_FAILED':
        return {
          code: 'S3_UPLOAD_FAILED',
          message: 'Upload to storage failed. Please try again.',
          retryable: true,
          needsFreshUrl: false,
        }
    }
  }
  return {
    code: 'S3_UPLOAD_FAILED',
    message:
      err instanceof Error ? err.message : 'Upload to storage failed.',
    retryable: true,
    needsFreshUrl: false,
  }
}

function mapRegisterError(err: unknown): UploadErrorInfo {
  if (err instanceof ApiError) {
    switch (err.code) {
      case ('UPLOAD_TOKEN_EXPIRED' as never):
        return {
          code: 'UPLOAD_TOKEN_EXPIRED',
          message:
            'This upload has expired. Please upload the resume again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case ('UPLOAD_TOKEN_INVALID' as never):
        return {
          code: 'UPLOAD_TOKEN_INVALID',
          message: 'The upload token is invalid. Please upload again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case ('UPLOAD_NOT_FOUND' as never):
        return {
          code: 'UPLOAD_NOT_FOUND',
          message:
            'Could not find the uploaded file to register. Please upload again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case ('UPLOAD_VERIFICATION_FAILED' as never):
        return {
          code: 'UPLOAD_VERIFICATION_FAILED',
          message:
            'We could not verify the uploaded file. Please upload again.',
          retryable: true,
          needsFreshUrl: true,
        }
      case 'CONFLICT':
      case ('DUPLICATE_DOCUMENT' as never):
        return {
          code: 'DUPLICATE_DOCUMENT',
          message: 'This document is already registered.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'FORBIDDEN':
        return {
          code: 'FORBIDDEN',
          message:
            err.message || 'You are not authorized to register this document.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'VALIDATION_ERROR':
      case 'BAD_REQUEST':
        return {
          code: 'INVALID_FILE_FORMAT',
          message: err.message || 'Invalid document.',
          retryable: false,
          needsFreshUrl: false,
        }
      case 'SERVICE_UNAVAILABLE':
        return {
          code: 'SERVICE_UNAVAILABLE',
          message:
            'The document service is temporarily unavailable. Try again shortly.',
          retryable: true,
          needsFreshUrl: false,
        }
      case 'NETWORK_ERROR':
        return {
          code: 'NETWORK_ERROR',
          message:
            err.possiblySent
              ? 'The connection dropped, but registration may have succeeded. Please retry.'
              : 'Unable to reach the document service. Check your connection and retry.',
          retryable: true,
          needsFreshUrl: false,
        }
      case 'INTERNAL_ERROR':
        return {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong while registering the document. Please retry.',
          retryable: true,
          needsFreshUrl: false,
        }
      default:
        return {
          code: 'UNKNOWN',
          message: err.message || 'Registration failed.',
          retryable: true,
          needsFreshUrl: false,
        }
    }
  }
  const anyErr = err as { code?: string; message?: string } | undefined
  if (anyErr?.code && anyErr.code.startsWith('UPLOAD_TOKEN')) {
    return {
      code: anyErr.code as UploadErrorCode,
      message: anyErr.message || 'Upload token problem. Please upload again.',
      retryable: true,
      needsFreshUrl: true,
    }
  }
  return {
    code: 'UNKNOWN',
    message: anyErr?.message || 'Registration failed. Please retry.',
    retryable: true,
    needsFreshUrl: false,
  }
}
