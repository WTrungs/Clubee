import { CalendarHeart } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { rememberLastClubId } from '@/features/account/viewModel/lastClub'
import { ClubStatusBanner } from '@/features/club/view/ClubStatusBanner'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { useClubDetail } from '@/features/club/viewModel/useClubDetail'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'

/** Ngữ cảnh CLB lấy từ route `/clubs/:clubId`; quyền xem do máy chủ quyết định (403 kèm lý do). */
export function ClubLayout() {
  const { clubId = '' } = useParams()
  const club = useClubDetail(clubId)
  const { pathname } = useLocation()

  useEffect(() => {
    // CLB mình chỉ là khách của sự kiện không thành CLB gần nhất (FR-ACC-06).
    if (club.data?.viewerRole === 'MEMBER') rememberLastClubId(club.data.id)
  }, [club.data])

  const value = useMemo(() => (club.data ? { clubId, club: club.data } : null), [clubId, club.data])

  if (club.isPending) {
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải CLB">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (club.isError || !value) {
    return (
      <ErrorState
        error={club.error}
        onRetry={() => void club.refetch()}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/clubs">Về CLB của tôi</Link>
          </Button>
        }
      />
    )
  }

  // Khách của sự kiện chỉ dùng mục Sự kiện; trang khác máy chủ cũng từ chối, nên báo ngay thay cho lỗi 403 (SRS 3.5).
  const eventsPath = `/clubs/${clubId}/events`
  if (value.club.viewerRole === 'EVENT_GUEST' && pathname !== eventsPath && !pathname.startsWith(`${eventsPath}/`)) {
    if (pathname.replace(/\/$/, '') === `/clubs/${clubId}`) return <Navigate to={eventsPath} replace />
    return (
      <EmptyState
        icon={CalendarHeart}
        title={`Bạn là khách ban tổ chức của ${value.club.name}`}
        description="Bạn chỉ xem được các sự kiện mình đang tham gia ban tổ chức, không xem được dữ liệu khác của CLB."
        action={
          <Button asChild size="sm">
            <Link to={eventsPath}>Xem sự kiện</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ClubContext.Provider value={value}>
      <ClubStatusBanner club={value.club} />
      <Outlet />
    </ClubContext.Provider>
  )
}
