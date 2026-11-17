/* eslint-disable react-refresh/only-export-components -- test helper, not an app module */
import * as React from 'react'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate, useRoutes } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/toast'
import { AuthProvider } from '../AuthContext'
import { routes } from '@/app/router'

/**
 * Mounts the REAL route table (guards, pages, AuthProvider) in a MemoryRouter.
 *
 * (Not createMemoryRouter: the data router builds a fetch `Request` with
 * jsdom's AbortSignal, which Node's undici rejects. useRoutes exercises the
 * same route objects without that.)
 */
function AppRoutes() {
  return useRoutes(routes)
}

export interface RenderedApp {
  state: { location: { pathname: string } }
  navigate: (to: string) => Promise<void>
}

export function renderApp(
  path: string,
  options: { strictMode?: boolean } = {}
): RenderedApp {
  const current = { pathname: path }
  let navigateTo: (to: string) => void = () => {}

  function Probe() {
    const location = useLocation()
    const navigate = useNavigate()
    current.pathname = location.pathname
    navigateTo = (to) => navigate(to)
    return null
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const tree = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Probe />
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
  render(options.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree)

  return {
    state: {
      get location() {
        return { pathname: current.pathname }
      },
    },
    navigate: async (to) => {
      await act(async () => navigateTo(to))
    },
  }
}
