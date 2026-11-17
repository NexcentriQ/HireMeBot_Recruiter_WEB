import type {
  DocumentType,
  SupportedDocumentMime,
} from '@/types/document'

/** Hard maximum enforced client-side. The backend has its own limits. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

/** Extensions the HTML file input accepts and the frontend validates. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'] as const

/** `<input type="file" accept="...">` value. */
export const FILE_INPUT_ACCEPT = ACCEPTED_EXTENSIONS.join(',')

/** Map of extension (lowercased, with leading dot) to the exact MIME the backend expects. */
const EXT_TO_MIME: Record<string, SupportedDocumentMime> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export interface FileValidationOk {
  ok: true
  extension: '.pdf' | '.docx'
  contentType: SupportedDocumentMime
}

export interface FileValidationFail {
  ok: false
  /** Stable code so the UI can branch on reason instead of message text. */
  code:
    | 'EMPTY_FILE'
    | 'TOO_LARGE'
    | 'UNSUPPORTED_EXTENSION'
    | 'DISGUISED_EXTENSION'
  message: string
}

export type FileValidationResult = FileValidationOk | FileValidationFail

/**
 * Validate a selected file for a document upload.
 *
 * Rules:
 *  - rejects empty files
 *  - rejects files larger than {@link MAX_DOCUMENT_BYTES}
 *  - accepts only .pdf and .docx (case-insensitive)
 *  - rejects multi-extension names like resume.pdf.exe
 *  - derives contentType from the extension, not from `file.type`
 *
 * This is for UX. The backend performs authoritative validation.
 */
export function validateDocumentFile(file: File): FileValidationResult {
  if (file.size === 0) {
    return {
      ok: false,
      code: 'EMPTY_FILE',
      message: 'This file is empty. Pick a non-empty PDF or DOCX file.',
    }
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `File is larger than ${formatMb(MAX_DOCUMENT_BYTES)}. Pick a smaller file.`,
    }
  }

  const name = file.name ?? ''
  const lowered = name.toLowerCase()

  // Reject disguised extensions: anything that has an accepted extension
  // somewhere in the middle but ends in something else, e.g. resume.pdf.exe.
  const containsMasked = ACCEPTED_EXTENSIONS.some(
    (ext) => lowered.includes(ext + '.') || lowered.includes(ext.replace('.', '') + '.exe')
  )
  const lastDot = lowered.lastIndexOf('.')
  const finalExt = lastDot >= 0 ? lowered.slice(lastDot) : ''

  if (containsMasked && !ACCEPTED_EXTENSIONS.includes(finalExt as '.pdf' | '.docx')) {
    return {
      ok: false,
      code: 'DISGUISED_EXTENSION',
      message:
        'This file name looks suspicious. Only .pdf and .docx files are allowed.',
    }
  }

  const mime = EXT_TO_MIME[finalExt]
  if (!mime) {
    return {
      ok: false,
      code: 'UNSUPPORTED_EXTENSION',
      message: 'Only PDF (.pdf) or Word (.docx) files are allowed.',
    }
  }

  return {
    ok: true,
    extension: finalExt as '.pdf' | '.docx',
    contentType: mime,
  }
}

/** Human-readable file size for display and errors. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/** Short human label for a document type, used in prompts and toasts. */
export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'RESUME':
      return 'Resume'
    case 'COVER_LETTER':
      return 'Cover Letter'
  }
}
