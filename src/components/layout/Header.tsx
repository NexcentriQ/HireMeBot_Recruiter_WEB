import { ChevronDown, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/AuthContext'
import { getInitials } from '@/lib/utils'

interface HeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function Header({ title, description, action }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const name = profile?.fullName ?? 'Recruiter'
  const email = profile?.email ?? '—'

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-border bg-white px-8 py-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-brand-muted">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {action}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-brand-bg"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>{getInitials(name)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-sm font-semibold text-brand-text">{name}</p>
                <p className="text-xs text-brand-muted">{email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-brand-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-brand-text">{name}</p>
              <p className="text-xs text-brand-muted">{email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
