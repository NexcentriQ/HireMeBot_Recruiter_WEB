import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { exchangeCodeForTokens } from '../cognitoClient'
import { LoadingState } from '@/components/common/LoadingState'
import { ErrorState } from '@/components/common/ErrorState'
import { env } from '@/lib/env'

export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeLogin } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function run() {
      if (env.useMockApi) {
        navigate('/dashboard', { replace: true })
        return
      }

      const errParam = params.get('error_description') || params.get('error')
      if (errParam) {
        setError(errParam)
        return
      }

      const code = params.get('code')
      const state = params.get('state')
      if (!code || !state) {
        setError('Missing authorization code or state.')
        return
      }
      try {
        const tokens = await exchangeCodeForTokens(code, state)
        if (!active) return
        await completeLogin(tokens)
        navigate('/dashboard', { replace: true })
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Could not complete sign-in.'
        if (active) setError(message)
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [params, completeLogin, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      {error ? (
        <ErrorState
          title="Sign-in failed"
          description={error}
          onRetry={() => navigate('/login', { replace: true })}
        />
      ) : (
        <LoadingState label="Completing sign-in…" />
      )}
    </div>
  )
}
