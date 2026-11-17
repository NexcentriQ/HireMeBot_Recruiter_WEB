import type { AuthStatus } from './AuthContext'

/** The existing post-login landing route (the recruiter workspace). */
export const DASHBOARD_PATH = '/applications/new'

/**
 * The one route that accepts each backend-confirmed state. `initializing` and
 * `error` have no route: they render in place, which keeps a failed lookup from
 * ever turning into a redirect loop.
 */
export function routeForStatus(status: AuthStatus): string | null {
  switch (status) {
    case 'authenticated':
      return DASHBOARD_PATH
    case 'signup-required':
      return '/register'
    case 'pending':
      return '/pending'
    case 'restricted':
      return '/restricted'
    case 'unauthenticated':
      return '/login'
    default:
      return null
  }
}
