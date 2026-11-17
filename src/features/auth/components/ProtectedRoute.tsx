import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, type AuthStatus } from '../AuthContext'
import { routeForStatus } from '../authRoutes'
import { AccountErrorScreen } from './AccountErrorScreen'
import { LoadingState } from '@/components/common/LoadingState'

/**
 * Renders `children` only when the backend-confirmed account state equals
 * `requiredStatus` (default `authenticated`, i.e. an approved recruiter).
 * Every other state is sent to the single route that accepts it, so a pending
 * recruiter cannot open the dashboard and an approved one cannot reopen the
 * registration form. This is a UX guard: the backend enforces access itself.
 */
export function ProtectedRoute({
  children,
  requiredStatus = 'authenticated',
}: {
  children: React.ReactNode
  requiredStatus?: AuthStatus
}) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Preparing your workspace…" />
      </div>
    )
  }

  if (status === 'error') return <AccountErrorScreen />

  if (status === requiredStatus) return <>{children}</>

  return (
    <Navigate
      to={routeForStatus(status) ?? '/login'}
      replace
      state={status === 'unauthenticated' ? { from: location } : undefined}
    />
  )
}
