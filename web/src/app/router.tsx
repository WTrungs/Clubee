import { createBrowserRouter, Navigate } from 'react-router'
import { AdminOnly, GuestOnly, RequireAuth, UserOnly } from '@/features/account/view/RequireAuth'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { AppLayout } from './layouts/AppLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { ClubLayout } from './layouts/ClubLayout'
import { NotFoundPage } from './NotFoundPage'
import { RouteErrorPage } from './RouteErrorPage'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    // Every page loads on demand, so the first paint needs a loader instead of a blank screen.
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', lazy: () => import('@/features/account/view/LoginPage').then((module) => ({ Component: module.LoginPage })) },
              { path: '/register', lazy: () => import('@/features/account/view/RegisterPage').then((module) => ({ Component: module.RegisterPage })) },
              {
                path: '/forgot-password',
                lazy: () => import('@/features/account/view/ForgotPasswordPage').then((module) => ({ Component: module.ForgotPasswordPage })),
              },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              // Trang dùng chung cho mọi loại tài khoản.
              { path: '/me/profile', lazy: () => import('@/features/account/view/ProfilePage').then((module) => ({ Component: module.ProfilePage })) },
              {
                path: '/notifications',
                lazy: () => import('@/features/notification/view/NotificationsPage').then((module) => ({ Component: module.NotificationsPage })),
              },
              {
                element: <AdminOnly />,
                children: [
                  { path: '/admin', lazy: () => import('@/features/account/view/AdminMetricsPage').then((module) => ({ Component: module.AdminMetricsPage })) },
                  {
                    path: '/admin/accounts',
                    lazy: () => import('@/features/account/view/AdminAccountsPage').then((module) => ({ Component: module.AdminAccountsPage })),
                  },
                  {
                    path: '/admin/transfers',
                    lazy: () => import('@/features/account/view/AdminTransfersPage').then((module) => ({ Component: module.AdminTransfersPage })),
                  },
                ],
              },
              {
                element: <UserOnly />,
                children: [
                  { path: '/', element: <Navigate to="/clubs" replace /> },
                  { path: '/clubs', lazy: () => import('@/features/account/view/MyClubsPage').then((module) => ({ Component: module.MyClubsPage })) },
                  {
                    path: '/directory',
                    lazy: () => import('@/features/club/view/ClubDirectoryPage').then((module) => ({ Component: module.ClubDirectoryPage })),
                  },
                  {
                    path: '/invite/:token',
                    lazy: () => import('@/features/member/view/InvitationPage').then((module) => ({ Component: module.InvitationPage })),
                  },
                  {
                    path: '/recruitments/:recruitmentId',
                    lazy: () => import('@/features/recruitment/view/ApplyPage').then((module) => ({ Component: module.ApplyPage })),
                  },
                  { path: '/me/tasks', lazy: () => import('@/features/task/view/MyTasksPage').then((module) => ({ Component: module.MyTasksPage })) },
                  { path: '/me/activity', lazy: () => import('@/features/report/view/MyActivityPage').then((module) => ({ Component: module.MyActivityPage })) },
                  { path: '/me/calendar', lazy: () => import('@/features/calendar/view/CalendarPage').then((module) => ({ Component: module.CalendarPage })) },
                  {
                    path: '/scan',
                    lazy: () => import('@/features/attendance/view/AttendanceScanPage').then((module) => ({ Component: module.AttendanceScanPage })),
                  },
                  {
                    path: '/clubs/:clubId',
                    element: <ClubLayout />,
                    children: [
                      { index: true, lazy: () => import('@/features/club/view/ClubOverviewPage').then((module) => ({ Component: module.ClubOverviewPage })) },
                      { path: 'structure', lazy: () => import('@/features/org/view/OrgStructurePage').then((module) => ({ Component: module.OrgStructurePage })) },
                      { path: 'terms', lazy: () => import('@/features/term/view/TermsPage').then((module) => ({ Component: module.TermsPage })) },
                      {
                        path: 'terms/:termId',
                        lazy: () => import('@/features/term/view/TermDetailPage').then((module) => ({ Component: module.TermDetailPage })),
                      },
                      {
                        path: 'handovers/:handoverId',
                        lazy: () => import('@/features/term/view/HandoverPage').then((module) => ({ Component: module.HandoverPage })),
                      },
                      { path: 'members', lazy: () => import('@/features/member/view/MembersPage').then((module) => ({ Component: module.MembersPage })) },
                      { path: 'tasks', lazy: () => import('@/features/task/view/ClubTasksPage').then((module) => ({ Component: module.ClubTasksPage })) },
                      { path: 'events', lazy: () => import('@/features/event/view/EventListPage').then((module) => ({ Component: module.EventListPage })) },
                      {
                        path: 'events/:eventId',
                        lazy: () => import('@/features/event/view/EventDetailPage').then((module) => ({ Component: module.EventDetailPage })),
                      },
                      {
                        path: 'sessions',
                        lazy: () => import('@/features/attendance/view/SessionListPage').then((module) => ({ Component: module.SessionListPage })),
                      },
                      {
                        path: 'sessions/:sessionId',
                        lazy: () => import('@/features/attendance/view/SessionDetailPage').then((module) => ({ Component: module.SessionDetailPage })),
                      },
                      { path: 'documents', lazy: () => import('@/features/document/view/DocumentsPage').then((module) => ({ Component: module.DocumentsPage })) },
                      {
                        path: 'recruitments',
                        lazy: () => import('@/features/recruitment/view/RecruitmentsPage').then((module) => ({ Component: module.RecruitmentsPage })),
                      },
                      {
                        path: 'recruitments/:recruitmentId',
                        lazy: () => import('@/features/recruitment/view/RecruitmentDetailPage').then((module) => ({ Component: module.RecruitmentDetailPage })),
                      },
                      { path: 'finance', lazy: () => import('@/features/finance/view/FinancePage').then((module) => ({ Component: module.FinancePage })) },
                      { path: 'reports', lazy: () => import('@/features/report/view/ClubReportsPage').then((module) => ({ Component: module.ClubReportsPage })) },
                    ],
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
