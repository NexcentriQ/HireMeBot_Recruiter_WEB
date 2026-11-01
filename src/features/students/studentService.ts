import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { env } from '@/lib/env'
import type { AssignedStudent } from '@/types/domain'
import { mockApi } from '@/mocks/mockApi'

/**
 * Fetch students assigned to the current recruiter.
 *
 * The backend's exact response shape for this endpoint is not nailed down
 * yet, so we tolerate the common wrappers and field names and normalize
 * them into `AssignedStudent[]`. If none match, we throw a descriptive
 * error so the UI can surface it instead of crashing.
 */
export async function fetchAssignedStudents(): Promise<AssignedStudent[]> {
  if (env.useMockApi) return mockApi.getAssignedStudents()

  const { data } = await apiClient.get<unknown>('/api/v1/recruiter/students')
  const list = extractList(data)
  if (!list) {
    // eslint-disable-next-line no-console
    console.warn(
      '[recruiter/students] Unexpected response shape:',
      data
    )
    throw new Error(
      'The students endpoint returned an unexpected response shape. Check the Network tab and update extractList() in studentService.ts.'
    )
  }
  return list.map(normalizeStudent).filter((s): s is AssignedStudent => !!s)
}

/** Peel common envelopes to find the array of students. */
function extractList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    for (const key of ['students', 'data', 'items', 'result', 'results', 'content']) {
      const inner = obj[key]
      if (Array.isArray(inner)) return inner
      if (inner && typeof inner === 'object') {
        const nested = extractList(inner)
        if (nested) return nested
      }
    }
  }
  return null
}

/** Map common field name variants to AssignedStudent. */
function normalizeStudent(raw: unknown): AssignedStudent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const idRaw =
    r.id ??
    r.studentId ??
    r.student_id ??
    r.userId ??
    r.user_id
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) return null

  const fullName =
    pickString(r.fullName) ??
    pickString(r.name) ??
    pickString(r.studentName) ??
    joinNames(r.firstName, r.lastName) ??
    joinNames(r.first_name, r.last_name) ??
    `Student ${id}`

  const email =
    pickString(r.email) ??
    pickString(r.emailAddress) ??
    pickString(r.email_address) ??
    ''

  const isActive =
    typeof r.isActive === 'boolean'
      ? r.isActive
      : typeof r.active === 'boolean'
        ? r.active
        : typeof r.status === 'string'
          ? r.status.toUpperCase() === 'ACTIVE'
          : true

  return { id, fullName, email, isActive }
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function joinNames(first: unknown, last: unknown): string | null {
  const f = pickString(first)
  const l = pickString(last)
  if (!f && !l) return null
  return [f, l].filter(Boolean).join(' ')
}

export function useAssignedStudents() {
  return useQuery({
    queryKey: ['assigned-students'],
    queryFn: fetchAssignedStudents,
    staleTime: 60_000,
  })
}
