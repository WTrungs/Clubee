import { ShieldAlert } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation, type NavigateProps } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { resolveRedirect } from '../viewModel/redirect'
import { useCurrentUser, useSession } from '../viewModel/useSession'

/** Chuyển trang kèm màn chờ: trang đích tải theo yêu cầu, nếu chỉ chuyển hướng thì màn hình trống tới khi tải xong. */
function RedirectWithLoader(props: NavigateProps) {
  return (
    <>
      <FullScreenLoader />
      <Navigate {...props} />
    </>
  )
}

/** Vùng cần đăng nhập; chưa có phiên thì chuyển về trang đăng nhập và nhớ trang định vào. */
export function RequireAuth() {
  const location = useLocation()
  const session = useSession()

  if (session.isPending) return <FullScreenLoader />
  if (session.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    )
  }
  if (!session.data) return <RedirectWithLoader to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <Outlet />
}

/** NFR-SEC-06: Admin không dùng các trang của CLB; mở trang CLB thì về khu quản trị. */
export function UserOnly() {
  const user = useCurrentUser()
  if (user.accountType === 'ADMIN') return <Navigate to="/admin" replace />
  return <Outlet />
}

/** Khu quản trị (SRS 3.4): tài khoản thường thấy câu báo không có quyền kèm lý do thay vì bị chuyển đi im lặng. */
export function AdminOnly() {
  const user = useCurrentUser()
  if (user.accountType === 'ADMIN') return <Outlet />
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Không có quyền truy cập"
      description="Trang này chỉ dành cho quản trị hệ thống. Tài khoản của bạn là tài khoản thành viên CLB."
      action={
        <Button asChild variant="outline">
          <Link to="/clubs">Về CLB của tôi</Link>
        </Button>
      }
    />
  )
}

/** Trang đăng nhập, đăng ký: đã đăng nhập thì vào thẳng trang định đến (hoặc danh sách CLB). */
export function GuestOnly() {
  const location = useLocation()
  const session = useSession()
  if (session.isPending) return <FullScreenLoader />
  if (session.data) return <RedirectWithLoader to={resolveRedirect(location.state, session.data.accountType)} replace />
  return <Outlet />
}
