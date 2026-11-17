import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AuthCallbackPage } from '@/features/auth/pages/AuthCallbackPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { PendingApprovalPage } from '@/features/auth/pages/PendingApprovalPage'
import { RestrictedAccountPage } from '@/features/auth/pages/RestrictedAccountPage'
import { CreateApplicationPage } from '@/features/applications/CreateApplicationPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  // Each account step is reachable only in the state the backend reported:
  // `signup-required`, `pending`, `restricted`. Anything else is redirected.
  {
    path: '/register',
    element: (
      <ProtectedRoute requiredStatus="signup-required">
        <RegisterPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/pending',
    element: (
      <ProtectedRoute requiredStatus="pending">
        <PendingApprovalPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/restricted',
    element: (
      <ProtectedRoute requiredStatus="restricted">
        <RestrictedAccountPage />
      </ProtectedRoute>
    ),
  },
  // Former route for rejected accounts.
  { path: '/access-denied', element: <Navigate to="/restricted" replace /> },
  {
    element: (
      <ProtectedRoute>
        <RecruiterLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/applications/new" replace /> },
      { path: '/applications/new', element: <CreateApplicationPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/applications/new" replace /> },
]

export const router = createBrowserRouter(routes)
