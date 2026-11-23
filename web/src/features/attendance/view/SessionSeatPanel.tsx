import { CalendarCheck2, Hourglass, Ticket, XCircle } from 'lucide-react'
import { RegistrationBadge } from '@/features/event/view/EventMeta'
import { describeDueDate, formatDateTime } from '@/shared/format/formatDate'
import { formatNumber } from '@/shared/format/formatMoney'
import { useNow } from '@/shared/hooks/useNow'
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { SessionDetail, SessionSeats } from '../model/sessionTypes'
import { seatsLeft, sessionCancelHint, sessionCancelRegistrationText } from '../viewModel/sessionDisplay'
import { useSessionRegistrationViewModel } from '../viewModel/useSessionRegistrationViewModel'

/** FR-ATT-03: số chỗ, danh sách chờ, hạn đăng ký và nút đăng ký, hủy của chính người xem. */
export function SessionSeatPanel({ clubId, session, seats }: { clubId: string; session: SessionDetail; seats: SessionSeats }) {
  const now = useNow()
  const vm = useSessionRegistrationViewModel(clubId, session.id)
  const mine = session.myRegistration
  const { remaining, full } = seatsLeft(seats)
  const closesAt = session.registrationDeadline ?? session.startAt
  const closed = Date.parse(closesAt) <= now
  const cancelHint = mine ? sessionCancelHint(mine, session, now) : null

  return (
    <section aria-label="Đăng ký chỗ" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Đã nhận chỗ</p>
              <p className="text-3xl font-extrabold tabular-nums">
                <AnimatedNumber value={seats.taken} />
                <span className="text-lg font-bold text-muted-foreground">/{formatNumber(seats.capacity)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Danh sách chờ</p>
              <p className="text-3xl font-extrabold tabular-nums">
                <AnimatedNumber value={seats.waitlist} />
              </p>
            </div>
          </div>
          <ProgressBar value={seats.taken} max={seats.capacity} label="Tỷ lệ chỗ đã nhận" tone={full ? 'warning' : 'primary'} className="h-3" />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Hourglass aria-hidden className="size-4" />
              {`${session.registrationDeadline ? 'Hạn đăng ký' : 'Nhận đăng ký đến khi bắt đầu'} ${formatDateTime(closesAt)}`}
              {closed ? ' (đã qua)' : ` · ${describeDueDate(closesAt).toLowerCase()}`}
            </span>
            <span className={full ? 'font-semibold text-status-warning' : 'font-semibold text-status-success'}>
              {full ? 'Đã hết chỗ, đăng ký mới vào danh sách chờ' : `Còn ${remaining} chỗ`}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          {mine ? (
            <>
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <Ticket aria-hidden className={mine.status === 'CONFIRMED' ? 'size-5 text-status-success' : 'size-5 text-status-warning'} />
                Bạn đã đăng ký
              </span>
              <RegistrationBadge status={mine.status} waitlistPosition={mine.waitlistPosition} />
              <span className="text-xs text-muted-foreground">
                {mine.promotedAt ? `Được đôn từ danh sách chờ lúc ${formatDateTime(mine.promotedAt)}` : `Lúc ${formatDateTime(mine.registeredAt)}`}
              </span>
              {cancelHint && <span className="max-w-xs text-xs text-muted-foreground md:text-right">{cancelHint}</span>}
              {mine.allowedActions.includes('CANCEL') && (
                <Button variant="outline" size="sm" onClick={vm.openCancel} disabled={vm.cancelling}>
                  <XCircle aria-hidden />
                  Hủy đăng ký
                </Button>
              )}
            </>
          ) : session.allowedActions.includes('REGISTER') ? (
            <Button size="lg" loading={vm.registering} onClick={vm.register}>
              <CalendarCheck2 aria-hidden />
              {full ? 'Vào danh sách chờ' : 'Đăng ký giữ chỗ'}
            </Button>
          ) : (
            <p className="max-w-xs text-sm text-muted-foreground md:text-right">
              {session.cancelled ? 'Buổi đã hủy.' : closed ? 'Buổi đã hết hạn đăng ký.' : 'Chỉ thành viên thuộc phạm vi của buổi được đăng ký.'}
            </p>
          )}
        </div>
      </div>
      {mine && (
        <ConfirmDialog
          open={vm.confirming}
          onOpenChange={(open) => !open && vm.closeCancel()}
          title="Hủy đăng ký?"
          description={sessionCancelRegistrationText(mine)}
          confirmLabel="Hủy đăng ký"
          confirmVariant="destructive"
          pending={vm.cancelling}
          onConfirm={() => vm.confirmCancel(mine.id)}
        />
      )}
    </section>
  )
}
