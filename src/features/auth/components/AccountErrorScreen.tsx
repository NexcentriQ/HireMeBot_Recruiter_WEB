import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { useAuth } from '../AuthContext'

/**
 * Shown IN PLACE (no redirect) when the backend account lookup failed for a
 * reason that says nothing about the account: network, 5xx after retries, or an
 * unexpected response. Never grants access; offers retry and sign-out.
 */
export function AccountErrorScreen() {
  const { failure, refreshAccount, signOut } = useAuth()
  const [retrying, setRetrying] = useState(false)
  const retryingRef = useRef(false)

  async function retry() {
    if (retryingRef.current) return
    retryingRef.current = true
    setRetrying(true)
    try {
      await refreshAccount()
    } finally {
      retryingRef.current = false
      setRetrying(false)
    }
  }

  const description = [
    failure?.message ?? 'We could not check your account right now.',
    failure?.requestId ? `Reference: ${failure.requestId}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md space-y-3">
        {retrying ? (
          <LoadingState label="Checking your account…" />
        ) : (
          <ErrorState
            title="We couldn't check your account"
            description={description}
            onRetry={() => void retry()}
          />
        )}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => void signOut()}
          disabled={retrying}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
