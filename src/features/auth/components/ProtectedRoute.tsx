import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { LoadingState } from '@/components/common/LoadingState'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Preparing your workspace…" />
      </div>
    )
  }

  if (status === 'unauthorized') {
    return <Navigate to="/access-denied" replace />
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
