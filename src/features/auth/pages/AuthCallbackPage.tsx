import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { routeForStatus } from '../authRoutes'
import { describeOAuthFailure } from '../cognitoAuth'
import { AccountErrorScreen } from '../components/AccountErrorScreen'
import { LoadingState } from '@/components/common/LoadingState'
import { ErrorState } from '@/components/common/ErrorState'

/**
 * Cognito redirects here (`/auth/callback`) after Google. Amplify completes the
 * code exchange on its own as soon as it is configured, and AuthProvider only
 * runs the recruiter account lookup once the session is ready, so this page
 * just reflects the provider's state and moves on once the backend has answered.
 */
export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { status, oauthError } = useAuth()

  // Cognito reports a cancelled or refused sign-in as ?error=...&error_description=...
  const redirectError = params.get('error')
    ? describeOAuthFailure(
        `${params.get('error')} ${params.get('error_description') ?? ''}`
      )
    : null

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
        <LoadingState label="Completing sign-in…" />
      </div>
    )
  }

  if (status === 'error') return <AccountErrorScreen />

  if (status === 'unauthenticated') {
    const message = oauthError ?? redirectError
    // No session and nothing went wrong (e.g. this URL was opened directly, or
    // the session just ended): back to the login page, never straight to Google.
    if (!message) return <Navigate to="/login" replace />
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
        <ErrorState
          title="Sign-in failed"
          description={message}
          onRetry={() => navigate('/login', { replace: true })}
        />
      </div>
    )
  }

  return <Navigate to={routeForStatus(status) ?? '/login'} replace />
}
