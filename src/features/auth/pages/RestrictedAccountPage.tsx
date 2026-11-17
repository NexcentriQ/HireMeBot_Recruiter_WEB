import { useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RestrictionCode } from '@/types/recruiterAuth'
import { useAuth } from '../AuthContext'

interface Copy {
  title: string
  guidance: string
}

const COPY: Record<RestrictionCode, Copy> = {
  ACCOUNT_SUSPENDED: {
    title: 'Account suspended',
    guidance: 'Please contact support if you believe this is a mistake.',
  },
  ACCOUNT_DELETED: {
    title: 'Account unavailable',
    guidance: 'Please contact support if you believe this is a mistake.',
  },
  ACCOUNT_TYPE_MISMATCH: {
    title: 'Different account type',
    guidance:
      'This Google account belongs to another HireMeBot portal and cannot be used here. Sign out and continue with a different Google account.',
  },
  ACCOUNT_IDENTITY_CONFLICT: {
    title: 'Email already in use',
    guidance:
      'We could not link this sign-in to a recruiter account. Please contact support so we can help you recover access.',
  },
  EMAIL_NOT_VERIFIED: {
    title: 'Verified email required',
    guidance:
      'Sign out and continue with a Google account whose email address is verified.',
  },
  ACCESS_DENIED: {
    title: 'Access denied',
    guidance: 'Sign out and continue with a different Google account.',
  },
}

/**
 * Where suspended, deleted, wrong-role and conflicting accounts land. It is
 * never a route to registration or the dashboard. The only way forward is to
 * sign out (which can lead to a different Google account).
 */
export function RestrictedAccountPage() {
  const { restriction, signOut } = useAuth()
  const copy = COPY[restriction?.code ?? 'ACCESS_DENIED']

  useEffect(() => {
    document.title = 'Access restricted · HireMeBot Recruiter'
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-brand-border bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-brand-text">{copy.title}</h1>
        {restriction?.message && (
          <p className="text-sm font-medium text-brand-text">{restriction.message}</p>
        )}
        <p className="text-sm text-brand-muted">{copy.guidance}</p>
        {restriction?.requestId && (
          <p className="text-xs text-brand-muted">Reference: {restriction.requestId}</p>
        )}
        <Button onClick={() => void signOut()} className="w-full">
          Sign out
        </Button>
      </div>
    </div>
  )
}
