import { useEffect, useMemo } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { rememberLastClubId } from '@/features/account/viewModel/lastClub'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { useClubDetail } from '@/features/club/viewModel/useClubDetail'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'

/** Ngữ cảnh CLB lấy từ route `/clubs/:clubId`; quyền xem do máy chủ quyết định (403 kèm lý do). */
export function ClubLayout() {
  const { clubId = '' } = useParams()
  const club = useClubDetail(clubId)

  useEffect(() => {
    if (club.data) rememberLastClubId(club.data.id)
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

  return (
    <ClubContext.Provider value={value}>
      <Outlet />
    </ClubContext.Provider>
  )
}
