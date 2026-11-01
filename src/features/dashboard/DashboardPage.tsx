import { useNavigate } from 'react-router-dom'
import { Briefcase, CalendarDays, Users, Plus, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { SkeletonCard, SkeletonLine } from '@/components/common/LoadingState'
import { usePageMeta } from '@/components/layout/PageMeta'
import {
  useDashboardStats,
  useRecentApplications,
} from '@/features/applications/applicationService'
import { formatDate, getInitials } from '@/lib/utils'
import type { JobApplication } from '@/types/domain'

export function DashboardPage() {
  const navigate = useNavigate()

  usePageMeta({
    title: 'Dashboard',
    description: 'Overview of your applications and assigned students.',
    action: (
      <Button onClick={() => navigate('/applications/new')}>
        <Plus className="h-4 w-4" />
        Create Application
      </Button>
    ),
  })

  const stats = useDashboardStats()
  const recent = useRecentApplications(5)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stats.isError ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <ErrorState
              title="Could not load statistics"
              description={stats.error?.message}
              onRetry={() => stats.refetch()}
            />
          </div>
        ) : (
          <>
            <StatCard
              icon={<Briefcase className="h-5 w-5" />}
              iconBg="bg-blue-100 text-brand-blue"
              value={stats.data?.totalApplications ?? 0}
              label="Total Applications"
            />
            <StatCard
              icon={<CalendarDays className="h-5 w-5" />}
              iconBg="bg-amber-100 text-amber-700"
              value={stats.data?.todayApplications ?? 0}
              label="Today's Applications"
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              iconBg="bg-green-100 text-green-700"
              value={stats.data?.assignedStudents ?? 0}
              label="Assigned Students"
            />
          </>
        )}
      </section>

      {/* Recent Applications */}
      <Card>
        <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
          <h2 className="text-base font-semibold text-brand-text">
            Recent Applications
          </h2>
          <button
            type="button"
            onClick={() => navigate('/applications')}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-blue-hover"
          >
            View All <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recent.isLoading ? (
          <div className="space-y-3 p-6">
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : recent.isError ? (
          <div className="p-6">
            <ErrorState
              title="Could not load recent applications"
              description={recent.error?.message}
              onRetry={() => recent.refetch()}
            />
          </div>
        ) : (recent.data?.length ?? 0) === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No applications created yet."
              description="Create your first application for one of your assigned students."
              action={
                <Button
                  onClick={() => navigate('/applications/new')}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4" />
                  Create Application
                </Button>
              }
            />
          </div>
        ) : (
          <RecentTable items={recent.data!} />
        )}
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode
  iconBg: string
  value: number
  label: string
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-brand-text">{value}</p>
        <p className="text-sm text-brand-muted">{label}</p>
      </div>
    </Card>
  )
}

function RecentTable({ items }: { items: JobApplication[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-border text-left text-xs font-semibold uppercase tracking-wide text-brand-muted">
            <th className="px-6 py-3">Student</th>
            <th className="px-6 py-3">Company</th>
            <th className="px-6 py-3">Job Title</th>
            <th className="px-6 py-3">Applied Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((app) => (
            <tr
              key={app.id}
              className="border-b border-brand-border last:border-b-0 hover:bg-brand-bg/60"
            >
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
              <td className="px-6 py-4 text-brand-text">{app.companyName}</td>
              <td className="px-6 py-4 text-brand-text">{app.jobTitle}</td>
              <td className="px-6 py-4 text-brand-muted">
                {formatDate(app.appliedDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
