import { CalendarClock, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { formatEventTime } from '../viewModel/eventDisplay'
import { useGuestPassViewModel } from '../viewModel/useGuestViewModels'
import { GuestTicket } from './GuestTicket'

/** FR-EVT-12: vé của khách mời mở từ email; không cần đăng nhập. */
export function GuestPassPage() {
  const { code = '' } = useParams()
  const vm = useGuestPassViewModel(code)
  const pass = vm.pass
  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Vé tham dự</h1>
      {vm.loading && <Skeleton role="status" aria-label="Đang tải vé" className="h-96 rounded-2xl" />}
      {vm.error && (
        <ErrorState
          error={vm.error}
          onRetry={vm.refetch}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/explore">Về danh bạ CLB</Link>
            </Button>
          }
        />
      )}
      {pass && (
        <>
          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-muted-foreground">{pass.event.clubName}</p>
            <Link to={`/explore/events/${encodeURIComponent(pass.event.id)}`} className="block text-lg font-bold [overflow-wrap:anywhere] hover:text-primary">
              {pass.event.name}
            </Link>
            <p className="flex items-start gap-2 text-sm">
              <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {formatEventTime(pass.event)}
            </p>
            {pass.event.location && (
              <p className="flex items-start gap-2 text-sm">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="[overflow-wrap:anywhere]">{pass.event.location}</span>
              </p>
            )}
          </section>
          <GuestTicket pass={pass} />
          <p className="text-sm text-muted-foreground">
            Đăng ký lúc {formatDateTime(pass.registeredAt)}.{pass.checkedInDays.length > 0 && ` Đã ghi có mặt ${pass.checkedInDays.length} ngày.`}
          </p>
          {vm.canCancel && (
            <Button variant="outline" onClick={() => vm.setConfirmCancel(true)}>
              Hủy đăng ký
            </Button>
          )}
          <ConfirmDialog
            open={vm.confirmCancel}
            onOpenChange={vm.setConfirmCancel}
            title="Hủy đăng ký?"
            description="Chỗ của bạn sẽ được nhường cho người đầu danh sách chờ. Muốn tham dự lại thì phải đăng ký mới."
            confirmLabel="Hủy đăng ký"
            confirmVariant="destructive"
            pending={vm.cancelling}
            onConfirm={vm.cancel}
          />
        </>
      )}
    </div>
  )
}
