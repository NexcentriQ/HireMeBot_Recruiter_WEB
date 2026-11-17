import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

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

import { useDocumentUpload } from '../useDocumentUpload'
import { mockDocumentsApi } from '@/mocks/mockDocumentsApi'

function makeFile(name: string, bytes: Uint8Array): File {
  // Cast via BlobPart to keep TS 5.7 happy about Uint8Array's buffer variance.
  return new File([bytes as BlobPart], name, { type: 'application/pdf' })
}

describe('useDocumentUpload (mock backend)', () => {
  beforeEach(() => {
    mockDocumentsApi._resetForTests()
  })
  afterEach(() => {
    mockDocumentsApi._resetForTests()
  })

  it('walks a new file through hashing → upload → register to succeeded', async () => {
    const seen: number[] = []
    const { result } = renderHook(() =>
      useDocumentUpload({
        studentId: 1_000_000_010,
        documentType: 'RESUME',
        onRegistered: (id) => seen.push(id),
      })
    )
    expect(result.current.status).toBe('idle')

    await act(async () => {
      await result.current.startUpload(
        makeFile('resume.pdf', new Uint8Array([10, 20, 30, 40]))
      )
    })

    await waitFor(() => {
      expect(result.current.status).toBe('succeeded')
    })
    expect(result.current.objectId).toBeTypeOf('number')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(result.current.objectId)
    expect(result.current.progress).toBe(100)
  })

  it('short-circuits to alreadyExists when the same student re-uploads the same bytes', async () => {
    const bytes = new Uint8Array([99, 99, 99, 1, 2])
    const { result } = renderHook(() =>
      useDocumentUpload({
        studentId: 1_000_000_011,
        documentType: 'RESUME',
      })
    )

    await act(async () => {
      await result.current.startUpload(makeFile('resume.pdf', bytes))
    })
    await waitFor(() => expect(result.current.status).toBe('succeeded'))
    const firstId = result.current.objectId

    // Re-select the same bytes — the backend recognises this as already-owned.
    await act(async () => {
      await result.current.startUpload(makeFile('resume-copy.pdf', bytes))
    })
    await waitFor(() => expect(result.current.status).toBe('alreadyExists'))
    expect(result.current.objectId).toBe(firstId)
  })

  it('rejects a file with an unsupported extension without hitting the network', async () => {
    const { result } = renderHook(() =>
      useDocumentUpload({
        studentId: 1_000_000_012,
        documentType: 'RESUME',
      })
    )
    await act(async () => {
      await result.current.startUpload(
        makeFile('resume.exe', new Uint8Array([1, 2, 3]))
      )
    })
    expect(result.current.status).toBe('failed')
    expect(result.current.error?.code).toBe('VALIDATION_ERROR')
  })

  it('refuses to start when no student is selected', async () => {
    const { result } = renderHook(() =>
      useDocumentUpload({
        studentId: null,
        documentType: 'RESUME',
      })
    )
    await act(async () => {
      await result.current.startUpload(
        makeFile('resume.pdf', new Uint8Array([1, 2, 3]))
      )
    })
    expect(result.current.status).toBe('failed')
    expect(result.current.error?.code).toBe('VALIDATION_ERROR')
  })

  it('resetUpload clears the state back to idle', async () => {
    const { result } = renderHook(() =>
      useDocumentUpload({
        studentId: 1_000_000_013,
        documentType: 'RESUME',
      })
    )
    await act(async () => {
      await result.current.startUpload(
        makeFile('resume.pdf', new Uint8Array([7, 7, 7, 7]))
      )
    })
    await waitFor(() => expect(result.current.status).toBe('succeeded'))

    act(() => {
      result.current.resetUpload()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.objectId).toBeNull()
    expect(result.current.fileMeta).toBeNull()
  })

  it('resets when the studentId prop changes', async () => {
    const { result, rerender } = renderHook(
      ({ sid }: { sid: number }) =>
        useDocumentUpload({
          studentId: sid,
          documentType: 'RESUME',
        }),
      { initialProps: { sid: 1_000_000_014 } }
    )

    await act(async () => {
      await result.current.startUpload(
        makeFile('resume.pdf', new Uint8Array([3, 1, 4, 1, 5]))
      )
    })
    await waitFor(() => expect(result.current.status).toBe('succeeded'))
    expect(result.current.objectId).not.toBeNull()

    rerender({ sid: 1_000_000_015 })

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.objectId).toBeNull()
    expect(result.current.fileMeta).toBeNull()
  })
})
