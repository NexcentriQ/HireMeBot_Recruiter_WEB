import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FilePlus2, ListChecks, LogOut } from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/applications/new', label: 'Create Application', icon: FilePlus2 },
  { to: '/applications', label: 'My Applications', icon: ListChecks },
]

export function Sidebar() {
  const { signOut } = useAuth()

  return (
    <aside className="flex h-screen w-[230px] shrink-0 flex-col bg-brand-sidebar text-white">
      <div className="flex h-16 items-center px-5">
        <BrandLogo variant="sidebar" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-blue text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}
