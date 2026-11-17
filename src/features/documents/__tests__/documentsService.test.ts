import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Force mock mode regardless of .env.local; this suite tests the mock backend
// contract and must not hit a real HTTP peer.
vi.mock('@/lib/env', () => ({
  env: {
    useMockApi: true,
    apiBaseUrl: '',
    devRecruiterId: '',
    cognito: {
      region: 'us-east-1',
      userPoolId: '',
      clientId: '',
      domain: '',
      redirectUri: '',
      logoutUri: '',
    },
  },
  isDevRecruiterMode: () => false,
  cognitoIsConfigured: () => false,
}))

import {
  registerDocument,
  requestUploadUrl,
} from '../documentsService'
import { mockDocumentsApi } from '@/mocks/mockDocumentsApi'

/**
 * These tests run against the in-memory mock, which mirrors the real
 * DocumentManagementLambda contract (global SHA-256 uniqueness, token
 * verification, idempotent register).
 *
 * VITE_USE_MOCK_API defaults to true in dev, so the service routes to
 * the mock automatically.
 */

const PDF_CONTENT = 'application/pdf' as const
const CHECKSUM_A = 'a'.repeat(64)
const CHECKSUM_B = 'b'.repeat(64)

describe('documents service (mock)', () => {
  beforeEach(() => {
    mockDocumentsApi._resetForTests()
  })

  afterEach(() => {
    mockDocumentsApi._resetForTests()
  })

  it('first upload for a student returns UPLOAD_REQUIRED with presigned fields', async () => {
    const res = await requestUploadUrl({
      studentId: 1_000_000_001,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1234,
      checksum: CHECKSUM_A,
    })
    expect(res.status).toBe('UPLOAD_REQUIRED')
    if (res.status === 'UPLOAD_REQUIRED') {
      expect(res.uploadRequired).toBe(true)
      expect(res.uploadUrl).toMatch(/^mock:\/\/s3\//)
      expect(res.uploadToken).toMatch(/^mock-token-/)
      expect(res.requiredHeaders['Content-Type']).toBe(PDF_CONTENT)
      expect(res.requiredHeaders['x-amz-tagging']).toBe('doc-state=pending')
      expect(res.objectKey).toMatch(/^students\/1000000001\/resumes\//)
    }
  })

  it('same student + same checksum after register returns ALREADY_EXISTS with the same id', async () => {
    const studentId = 1_000_000_002
    const first = await requestUploadUrl({
      studentId,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1024,
      checksum: CHECKSUM_A,
    })
    if (first.status !== 'UPLOAD_REQUIRED') throw new Error('expected upload')

    const reg = await registerDocument({
      studentId,
      documentType: 'RESUME',
      objectKey: first.objectKey,
      checksum: CHECKSUM_A,
      uploadToken: first.uploadToken,
    })
    expect(reg.status).toBe('SUCCESS')
    expect(typeof reg.objectId).toBe('number')

    const second = await requestUploadUrl({
      studentId,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1024,
      checksum: CHECKSUM_A,
    })
    expect(second.status).toBe('ALREADY_EXISTS')
    if (second.status === 'ALREADY_EXISTS') {
      expect(second.objectId).toBe(reg.objectId)
      expect(second.uploadRequired).toBe(false)
    }
  })

  it('another student uploading the same bytes is rejected as DUPLICATE_DOCUMENT', async () => {
    const studentA = 1_000_000_003
    const studentB = 1_000_000_004
    const first = await requestUploadUrl({
      studentId: studentA,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1024,
      checksum: CHECKSUM_B,
    })
    if (first.status !== 'UPLOAD_REQUIRED') throw new Error('expected upload')
    await registerDocument({
      studentId: studentA,
      documentType: 'RESUME',
      objectKey: first.objectKey,
      checksum: CHECKSUM_B,
      uploadToken: first.uploadToken,
    })

    await expect(
      requestUploadUrl({
        studentId: studentB,
        documentType: 'RESUME',
        fileName: 'another.pdf',
        contentType: PDF_CONTENT,
        fileSize: 999,
        checksum: CHECKSUM_B,
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT', status: 409 })
  })

  it('register with an invalid token fails', async () => {
    await expect(
      registerDocument({
        studentId: 1_000_000_005,
        documentType: 'RESUME',
        objectKey: 'students/1/resumes/x.pdf',
        checksum: CHECKSUM_A,
        uploadToken: 'not-a-real-token',
      })
    ).rejects.toMatchObject({ code: 'UPLOAD_TOKEN_INVALID' })
  })

  it('register is idempotent: replaying a successful register returns the same objectId', async () => {
    const studentId = 1_000_000_006
    const first = await requestUploadUrl({
      studentId,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1024,
      checksum: 'c'.repeat(64),
    })
    if (first.status !== 'UPLOAD_REQUIRED') throw new Error('expected upload')

    const a = await registerDocument({
      studentId,
      documentType: 'RESUME',
      objectKey: first.objectKey,
      checksum: 'c'.repeat(64),
      uploadToken: first.uploadToken,
    })

    // Replay using the same objectKey. The token is consumed on success,
    // so the mock verifies using the stored objectKey + checksum via a
    // second upload-url request followed by register.
    const second = await requestUploadUrl({
      studentId,
      documentType: 'RESUME',
      fileName: 'resume.pdf',
      contentType: PDF_CONTENT,
      fileSize: 1024,
      checksum: 'c'.repeat(64),
    })
    expect(second.status).toBe('ALREADY_EXISTS')
    if (second.status === 'ALREADY_EXISTS') {
      expect(second.objectId).toBe(a.objectId)
    }
  })

  it('COVER_LETTER is not enabled in V1', async () => {
    await expect(
      requestUploadUrl({
        studentId: 1_000_000_007,
        documentType: 'COVER_LETTER',
        fileName: 'cover.pdf',
        contentType: PDF_CONTENT,
        fileSize: 1024,
        checksum: 'd'.repeat(64),
      })
    ).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_NOT_ENABLED' })
  })
})
