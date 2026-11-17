/**
 * Shared domain + wire types for the DocumentManagementLambda APIs.
 *
 * The backend exposes a two-step flow:
 *   1. POST /api/v1/documents/upload-url  — duplicate check + presigned S3 PUT
 *   2. POST /api/v1/documents/register    — verify upload and register in MySQL
 *
 * The file bytes are PUT to S3 directly by the browser between the two calls,
 * using the exact signed headers returned by the first call.
 *
 * Only RESUME is enabled in V1; COVER_LETTER is kept in the type so the same
 * hook and service can support it later without refactoring.
 */

export type DocumentType = 'RESUME' | 'COVER_LETTER'

/** Numeric content types the frontend sends and the backend accepts. */
export type SupportedDocumentMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// ---------- /api/v1/documents/upload-url ----------

export interface UploadUrlRequest {
  studentId: number
  documentType: DocumentType
  fileName: string
  contentType: SupportedDocumentMime
  fileSize: number
  /** Lowercase SHA-256 hex of the file bytes, 64 chars. */
  checksum: string
}

export interface UploadRequiredResponse {
  success: true
  status: 'UPLOAD_REQUIRED'
  uploadRequired: true
  objectKey: string
  uploadUrl: string
  uploadToken: string
  expiresIn: number
  /** Case-insensitive on the wire; server returns them exactly as they must be sent. */
  requiredHeaders: Record<string, string>
}

export interface AlreadyExistsResponse {
  success: true
  status: 'ALREADY_EXISTS'
  uploadRequired: false
  objectId: number
}

export type UploadUrlResponse =
  | UploadRequiredResponse
  | AlreadyExistsResponse

// ---------- /api/v1/documents/register ----------

export interface RegisterDocumentRequest {
  studentId: number
  documentType: DocumentType
  objectKey: string
  checksum: string
  uploadToken: string
}

export interface RegisterDocumentResponse {
  success: true
  status: 'SUCCESS'
  objectId: number
  studentId: number
  documentType: DocumentType
  message?: string
}
