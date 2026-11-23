import { ArrowLeft, CalendarClock, MapPin, Ticket, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { formatEventTime, publicSeatsText } from '../viewModel/eventDisplay'
import { usePublicEventViewModel } from '../viewModel/usePublicEventViewModel'
import { GuestRegistrationCard } from './GuestRegistrationCard'

/** FR-CLB-07: trang công khai của sự kiện mở cho khách; không có BTC, quỹ hay danh sách người đăng ký. */
export function PublicEventPage() {
  const { eventId = '' } = useParams()
  const vm = usePublicEventViewModel(eventId)
  const event = vm.event
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={event ? `/explore/${encodeURIComponent(event.clubId)}` : '/explore'}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {event?.clubName ?? 'Danh bạ CLB'}
      </Link>
      {vm.loading && (
        <div role="status" aria-label="Đang tải sự kiện" className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}
      {vm.error && (
        <ErrorState
          error={vm.error}
          onRetry={vm.refetch}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/explore">Về danh bạ</Link>
            </Button>
          }
        />
      )}
      {event && (
        <>
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <ClubMonogram clubId={event.clubId} shortName={event.clubShortName} logoUrl={event.clubLogoUrl} className="size-10 rounded-xl text-xs" />
              <p className="min-w-0 text-sm font-semibold text-muted-foreground">{event.clubName}</p>
            </div>
            <div className="space-y-2">
              <Badge tone={event.registrationOpen ? 'success' : 'neutral'} dot>
                {event.registrationOpen ? 'Đang nhận đăng ký' : 'Đã đóng đăng ký'}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{event.name}</h1>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {formatEventTime(event)}
              </li>
              <li className="flex items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="[overflow-wrap:anywhere]">{event.format === 'ONLINE' ? 'Trực tuyến (liên kết gửi kèm mã tham dự)' : (event.location ?? 'Chưa có địa điểm')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {publicSeatsText(event)}
              </li>
              {event.registrationDeadline && (
                <li className="flex items-start gap-2">
                  <Ticket aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  Hạn đăng ký {formatDateTime(event.registrationDeadline)}
                </li>
              )}
            </ul>
            {event.description && <p className="leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">{event.description}</p>}
          </section>
          {event.registrationOpen && !vm.appPath && <GuestRegistrationCard eventId={event.id} />}
          {vm.appPath && (
            <section className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Bạn là thành viên của CLB: đăng ký trong ứng dụng để được tính chuyên cần.</p>
              <Button asChild variant="outline" className="shrink-0">
                <Link to={vm.appPath}>Mở trong ứng dụng</Link>
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  )
}
