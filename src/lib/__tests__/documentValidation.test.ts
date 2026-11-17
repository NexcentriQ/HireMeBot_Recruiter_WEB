import { describe, expect, it } from 'vitest'
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
} from '../documentValidation'

function makeFile(name: string, size: number, type = 'application/pdf'): File {
  // jsdom accepts a sized Blob when the first arg is an array of parts.
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

describe('validateDocumentFile', () => {
  it('accepts a normal .pdf file', () => {
    const res = validateDocumentFile(makeFile('resume.pdf', 1024))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.extension).toBe('.pdf')
      expect(res.contentType).toBe('application/pdf')
    }
  })

  it('accepts .PDF case-insensitively and normalises contentType', () => {
    const res = validateDocumentFile(makeFile('Resume.PDF', 1024))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.contentType).toBe('application/pdf')
  })

  it('accepts a .docx file with the Word MIME type', () => {
    const res = validateDocumentFile(makeFile('resume.docx', 1024))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.extension).toBe('.docx')
      expect(res.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    }
  })

  it('rejects an empty file', () => {
    const res = validateDocumentFile(makeFile('resume.pdf', 0))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EMPTY_FILE')
  })

  it('rejects an .exe file', () => {
    const res = validateDocumentFile(makeFile('resume.exe', 1024))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('UNSUPPORTED_EXTENSION')
  })

  it('rejects a disguised double-extension like resume.pdf.exe', () => {
    const res = validateDocumentFile(makeFile('resume.pdf.exe', 1024))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('DISGUISED_EXTENSION')
  })

  it('rejects files larger than 5 MB', () => {
    const res = validateDocumentFile(makeFile('resume.pdf', MAX_DOCUMENT_BYTES + 1))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('TOO_LARGE')
  })

  it('accepts files exactly at the 5 MB cap', () => {
    const res = validateDocumentFile(makeFile('resume.pdf', MAX_DOCUMENT_BYTES))
    expect(res.ok).toBe(true)
  })

  it('rejects files with no extension at all', () => {
    const res = validateDocumentFile(makeFile('resume', 1024))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('UNSUPPORTED_EXTENSION')
  })
})
