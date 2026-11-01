import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AuthCallbackPage } from '@/features/auth/pages/AuthCallbackPage'
import { AccessDeniedPage } from '@/features/auth/pages/AccessDeniedPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CreateApplicationPage } from '@/features/applications/CreateApplicationPage'
import { MyApplicationsPage } from '@/features/applications/MyApplicationsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/access-denied', element: <AccessDeniedPage /> },
  {
    element: (
      <ProtectedRoute>
        <RecruiterLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/applications/new', element: <CreateApplicationPage /> },
      { path: '/applications', element: <MyApplicationsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
