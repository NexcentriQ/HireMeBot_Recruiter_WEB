import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../AuthContext'

export function AccessDeniedPage() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-brand-border bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-brand-text">Access Denied</h1>
        <p className="text-sm text-brand-muted">
          This account is not authorized to use the HireMeBot Recruiter Portal.
          If you believe this is a mistake, please contact your administrator.
        </p>
        <Button onClick={signOut} className="w-full">
          Return to sign-in
        </Button>
      </div>
    </div>
  )
}
