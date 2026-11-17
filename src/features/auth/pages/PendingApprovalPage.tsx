import { useEffect, useRef, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuth } from '../AuthContext'

interface CheckMessage {
  tone: 'info' | 'error'
  text: string
}

/**
 * Shown while the account is registered but not yet approved. Approval is a
 * manual step by the owner in the database; this page can only ask the backend
 * again, once per click. It never polls and has no way to change the status.
 */
export function PendingApprovalPage() {
  const { refreshAccount, signOut } = useAuth()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<CheckMessage | null>(null)
  const checkingRef = useRef(false)

  useEffect(() => {
    document.title = 'Waiting for approval · HireMeBot Recruiter'
  }, [])

  async function checkAgain() {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    setMessage(null)
    try {
      const result = await refreshAccount()
      if (!result.ok) {
        setMessage({
          tone: 'error',
          text: [
            result.failure.message,
            result.failure.requestId ? `Reference: ${result.failure.requestId}` : null,
          ]
            .filter(Boolean)
            .join(' '),
        })
      } else if (result.status === 'pending') {
        setMessage({
          tone: 'info',
          text: 'Your account is still waiting for approval. Please check again later.',
        })
      }
      // Any other status (approved, restricted, signed out) changed the app
      // state, and the route guard takes the user to the right place.
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-brand-border bg-white p-10 text-center shadow-sm">
        <BrandLogo className="justify-center" />

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-brand-blue">
          <Clock className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-brand-text">
            Registration Submitted
          </h1>
          <p className="text-sm text-brand-muted">
            Your recruiter account has been created successfully and is waiting
            for approval.
          </p>
          <p className="text-sm text-brand-muted">
            You will be able to access the Recruiter Dashboard after your account
            is approved.
          </p>
        </div>

        <div aria-live="polite" className="min-h-[1.25rem]">
          {message && (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={
                message.tone === 'error'
                  ? 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'
                  : 'rounded-md bg-blue-50 px-3 py-2 text-sm text-brand-blue'
              }
            >
              {message.text}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => void checkAgain()}
            disabled={checking}
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              'Check again'
            )}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void signOut()}
            disabled={checking}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
