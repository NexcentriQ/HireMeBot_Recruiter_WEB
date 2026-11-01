import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { SkeletonLine } from '@/components/common/LoadingState'
import { usePageMeta } from '@/components/layout/PageMeta'
import { useAssignedStudents } from '@/features/students/studentService'
import { useApplicationsList } from './applicationService'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDate, getInitials, cn } from '@/lib/utils'
import type { ApplicationQuery, ApplicationStatus } from '@/types/domain'

type DateRange = NonNullable<ApplicationQuery['dateRange']>
type SortDir = NonNullable<ApplicationQuery['sortDir']>

const DATE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
]

const PAGE_SIZES = [10, 20, 50]

const STATUS_VARIANT: Record<ApplicationStatus, 'success' | 'info' | 'warning' | 'danger'> = {
  APPLIED: 'success',
  IN_REVIEW: 'info',
  INTERVIEW: 'info',
  OFFER: 'success',
  REJECTED: 'danger',
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In Review',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
}

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function MyApplicationsPage() {
  usePageMeta({
    title: 'My Applications',
    description: 'Applications you have created for your assigned students.',
  })

  const [params, setParams] = useSearchParams()

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '')
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  const studentId = params.get('studentId') || 'all'
  const dateRange = (params.get('dateRange') as DateRange) || 'all'
  const sortDir = (params.get('sortDir') as SortDir) || 'desc'
  const page = parseIntParam(params.get('page'), 1)
  const pageSize = parseIntParam(params.get('pageSize'), 20)

  function updateParams(next: Record<string, string | number | undefined>) {
    const current = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '' || v === 'all') current.delete(k)
      else current.set(k, String(v))
    }
    setParams(current, { replace: true })
  }

  // When any filter/search changes, reset to page 1.
  function updateFilters(next: Record<string, string | undefined>) {
    const current = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '' || v === 'all') current.delete(k)
      else current.set(k, v)
    }
    current.delete('page')
    setParams(current, { replace: true })
  }

  const students = useAssignedStudents()

  const query = useMemo<ApplicationQuery>(
    () => ({
      search: debouncedSearch.trim() || undefined,
      studentId: studentId === 'all' ? undefined : studentId,
      dateRange,
      sortBy: 'appliedDate',
      sortDir,
      page,
      pageSize,
    }),
    [debouncedSearch, studentId, dateRange, sortDir, page, pageSize]
  )

  // Keep the URL in sync with the debounced search value.
  useEffect(() => {
    const existing = params.get('search') ?? ''
    if (existing === (debouncedSearch || '')) return
    const current = new URLSearchParams(params)
    if (debouncedSearch) current.set('search', debouncedSearch)
    else current.delete('search')
    current.delete('page')
    setParams(current, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const list = useApplicationsList(query)

  const totalItems = list.data?.totalItems ?? 0
  const totalPages = list.data?.totalPages ?? 1
  const items = list.data?.items ?? []
  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, totalItems)

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[260px] flex-1">
          <Input
            type="search"
            placeholder="Search by company, job title, or student..."
            startIcon={<Search className="h-4 w-4" />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <Select
          value={studentId}
          onValueChange={(v) => updateFilters({ studentId: v })}
        >
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-muted" />
              <SelectValue placeholder="All Students" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Students</SelectItem>
            {(students.data ?? []).map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={dateRange}
          onValueChange={(v) =>
            updateFilters({ dateRange: v === 'all' ? undefined : v })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {list.isLoading && !list.data ? (
          <div className="space-y-3 p-6">
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : list.isError ? (
          <div className="p-6">
            <ErrorState
              title="Could not load applications"
              description={list.error?.message}
              onRetry={() => list.refetch()}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No applications match your filters."
              description="Try adjusting your search, student, or date filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border text-left text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  <th className="px-6 py-3 w-12">#</th>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3">Job Title</th>
                  <th className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        updateParams({
                          sortDir: sortDir === 'asc' ? 'desc' : 'asc',
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-muted hover:text-brand-text"
                    >
                      Applied Date
                      {sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((app, i) => (
                  <tr
                    key={app.id}
                    className={cn(
                      'border-b border-brand-border last:border-b-0 hover:bg-brand-bg/60',
                      list.isFetching && 'opacity-70'
                    )}
                  >
                    <td className="px-6 py-4 text-brand-muted">
                      {startIndex + i}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(app.studentName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-brand-text">
                          {app.studentName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-brand-text">
                      {app.companyName}
                    </td>
                    <td className="px-6 py-4 text-brand-text">
                      {app.jobTitle}
                    </td>
                    <td className="px-6 py-4 text-brand-muted">
                      {formatDate(app.appliedDate)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={STATUS_VARIANT[app.status]}>
                        {STATUS_LABEL[app.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border px-6 py-3">
            <p className="text-sm text-brand-muted">
              Shows {startIndex} – {endIndex} of {totalItems}
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page <= 1}
                onClick={() => updateParams({ page: page - 1 })}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <PageNumbers
                page={page}
                totalPages={totalPages}
                onJump={(p) => updateParams({ page: p })}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: page + 1 })}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                updateParams({ pageSize: Number(v), page: 1 })
              }
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Card>
    </div>
  )
}

function PageNumbers({
  page,
  totalPages,
  onJump,
}: {
  page: number
  totalPages: number
  onJump: (page: number) => void
}) {
  // Simple windowed pagination: 1, ..., page-1, page, page+1, ..., totalPages
  const pages: Array<number | 'gap'> = []
  const push = (n: number | 'gap') => {
    if (
      pages.length === 0 ||
      pages[pages.length - 1] !== n ||
      n === 'gap'
    ) {
      pages.push(n)
    }
  }
  const addRange = (from: number, to: number) => {
    for (let i = from; i <= to; i++) push(i)
  }

  if (totalPages <= 7) {
    addRange(1, totalPages)
  } else {
    push(1)
    if (page > 3) push('gap')
    addRange(Math.max(2, page - 1), Math.min(totalPages - 1, page + 1))
    if (page < totalPages - 2) push('gap')
    push(totalPages)
  }

  return (
    <div className="flex items-center gap-1">
      {pages.map((p, idx) =>
        p === 'gap' ? (
          <span
            key={`gap-${idx}`}
            className="px-2 text-sm text-brand-muted"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onJump(p)}
            className={cn(
              'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
              p === page
                ? 'border-brand-blue bg-blue-50 text-brand-blue'
                : 'border-brand-border bg-white text-brand-text hover:bg-brand-bg'
            )}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}
    </div>
  )
}
