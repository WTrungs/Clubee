import { AnimatePresence, motion } from 'motion/react'
import { CalendarCheck2, CalendarClock, CircleCheck, Hourglass, PartyPopper, Ticket, UsersRound, XCircle } from 'lucide-react'
import { describeDueDate, formatDateTime } from '@/shared/format/formatDate'
import { useNow } from '@/shared/hooks/useNow'
import { formatNumber } from '@/shared/format/formatMoney'
import { itemVariants, listVariants, spring } from '@/shared/motion/presets'
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { EventDetail } from '../model/eventTypes'
import { cancelHint, cancelRegistrationText, reconfirmHint, seatInfo } from '../viewModel/eventDisplay'
import type { EventDetailViewModel } from '../viewModel/useEventDetailViewModel'
import { useEventRegistrationsViewModel } from '../viewModel/useEventRegistrationsViewModel'
import { useRegistrationActionsViewModel } from '../viewModel/useRegistrationActionsViewModel'
import { Badge } from '@/shared/ui/Badge'
import { RegistrationBadge } from './EventMeta'

function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, index) => index)
  const colors = ['bg-primary', 'bg-status-danger', 'bg-status-success', 'bg-status-progress', 'bg-status-warning']
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <motion.span
          key={piece}
          className={`absolute top-1/2 left-1/2 size-2 rounded-sm ${colors[piece % colors.length]}`}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: Math.cos((piece / pieces.length) * Math.PI * 2) * 140, y: Math.sin((piece / pieces.length) * Math.PI * 2) * 90 - 30, opacity: 0, rotate: 220 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

function SeatPanel({ event, vm }: { event: EventDetail; vm: EventDetailViewModel }) {
  const now = useNow()
  const seats = seatInfo(event)
  const mine = event.myRegistration
  const actions = useRegistrationActionsViewModel(vm.clubId, event.id)
  const hint = mine ? cancelHint(mine, event, now) : null
  const reconfirmNote = mine ? reconfirmHint(mine) : null
  const deadlinePassed = event.registrationDeadline !== null && Date.parse(event.registrationDeadline) <= now

  return (
    <section aria-label="Tình hình đăng ký" className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      {vm.justRegistered && <Confetti />}
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Đã nhận chỗ</p>
              <p className="text-3xl font-extrabold tabular-nums">
                <AnimatedNumber value={event.confirmedCount} />
                {seats.limited && <span className="text-lg font-bold text-muted-foreground">/{formatNumber(event.capacity ?? 0)}</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Danh sách chờ</p>
              <p className="text-3xl font-extrabold tabular-nums">
                <AnimatedNumber value={event.waitlistCount} />
              </p>
            </div>
          </div>
          {seats.limited ? (
            <ProgressBar value={event.confirmedCount} max={event.capacity ?? 0} label="Tỷ lệ chỗ đã nhận" tone={seats.full ? 'warning' : 'primary'} className="h-3" />
          ) : (
            <p className="text-sm text-muted-foreground">Không giới hạn số chỗ.</p>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Hourglass aria-hidden className="size-4" />
              {event.registrationDeadline
                ? `Hạn đăng ký ${formatDateTime(event.registrationDeadline)}${deadlinePassed ? ' (đã qua)' : ` · ${describeDueDate(event.registrationDeadline).toLowerCase()}`}`
                : 'Nhận đăng ký đến khi bắt đầu'}
            </span>
            {seats.limited && (
              <span className={seats.full ? 'font-semibold text-status-warning' : 'font-semibold text-status-success'}>
                {seats.full ? 'Đã hết chỗ, đăng ký mới vào danh sách chờ' : `Còn ${seats.remaining} chỗ`}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <AnimatePresence mode="wait" initial={false}>
            {mine ? (
              <motion.div key="registered" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} className="flex flex-col items-start gap-2 md:items-end">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  {mine.status === 'CONFIRMED' ? (
                    <PartyPopper aria-hidden className="size-5 text-status-success" />
                  ) : mine.status === 'RECONFIRM_PENDING' ? (
                    <CalendarClock aria-hidden className="size-5 text-status-info" />
                  ) : (
                    <Ticket aria-hidden className="size-5 text-status-warning" />
                  )}
                  Bạn đã đăng ký
                </span>
                <RegistrationBadge status={mine.status} waitlistPosition={mine.waitlistPosition} />
                <span className="text-xs text-muted-foreground">
                  {mine.promotedAt ? `Được đôn từ danh sách chờ lúc ${formatDateTime(mine.promotedAt)}` : `Lúc ${formatDateTime(mine.registeredAt)}`}
                </span>
                {hint && <span className="text-xs text-muted-foreground md:text-right">{hint}</span>}
                {reconfirmNote && <p className="max-w-xs rounded-xl bg-status-info-soft p-3 text-sm text-status-info">{reconfirmNote}</p>}
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {mine.allowedActions.includes('RECONFIRM') && (
                    <Button size="sm" onClick={() => actions.reconfirm(mine.id)} loading={actions.reconfirming} disabled={actions.busy}>
                      <CircleCheck aria-hidden />
                      Xác nhận tham dự
                    </Button>
                  )}
                  {mine.allowedActions.includes('CANCEL') && (
                    <Button variant="outline" size="sm" onClick={actions.openCancel} disabled={actions.busy}>
                      <XCircle aria-hidden />
                      Hủy đăng ký
                    </Button>
                  )}
                </div>
              </motion.div>
            ) : vm.canRegister ? (
              <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Button size="lg" loading={vm.registering} onClick={vm.register}>
                  <CalendarCheck2 aria-hidden />
                  {seats.full ? 'Vào danh sách chờ' : 'Đăng ký tham dự'}
                </Button>
              </motion.div>
            ) : (
              <motion.p key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xs text-sm text-muted-foreground md:text-right">
                {event.status === 'REGISTRATION_OPEN' ? 'Bạn không thuộc đối tượng đăng ký hoặc đã hết hạn.' : 'Sự kiện hiện không nhận đăng ký.'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      {mine && (
        <ConfirmDialog
          open={actions.confirming}
          onOpenChange={(open) => !open && actions.closeCancel()}
          title="Hủy đăng ký?"
          description={cancelRegistrationText(mine.status, mine.cancelDeadline)}
          confirmLabel="Hủy đăng ký"
          confirmVariant="destructive"
          pending={actions.cancelling}
          onConfirm={() => actions.confirmCancel(mine.id)}
        />
      )}
    </section>
  )
}

function RegistrationList({ clubId, eventId }: { clubId: string; eventId: string }) {
  const list = useEventRegistrationsViewModel(clubId, eventId, true)
  return (
    <section aria-labelledby="registration-list-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 id="registration-list-heading" className="flex items-center gap-2 font-bold">
          <UsersRound aria-hidden className="size-4 text-muted-foreground" />
          Danh sách tham dự
        </h3>
        <SearchInput label="Tìm người đăng ký" placeholder="Tìm theo tên…" value={list.keyword} onValueChange={list.setKeyword} className="sm:w-64" />
      </div>
      {list.loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
      {!list.loading && !list.error && list.rows.length === 0 && <EmptyState icon={UsersRound} title="Chưa có ai đăng ký" />}
      {list.rows.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" key={list.page} className="divide-y overflow-hidden rounded-2xl border bg-card">
          {list.rows.map((row, index) => (
            <motion.li key={row.id} variants={itemVariants} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{list.page * list.pageSize + index + 1}</span>
              <Avatar name={row.attendee.fullName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{row.attendee.fullName}</span>
                  {row.guest && <Badge tone="info">Khách mời</Badge>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(row.registeredAt)}
                  {row.promotedAt && ` · được đôn lúc ${formatDateTime(row.promotedAt)}`}
                </span>
              </span>
              <RegistrationBadge status={row.status} waitlistPosition={row.waitlistPosition} />
            </motion.li>
          ))}
        </motion.ul>
      )}
      <Pagination page={list.page} totalPages={list.totalPages} totalElements={list.totalElements} pageSize={list.pageSize} onPageChange={list.setPage} />
    </section>
  )
}

export function EventRegistrationTab({ event, vm }: { event: EventDetail; vm: EventDetailViewModel }) {
  return (
    <div className="space-y-6">
      <SeatPanel event={event} vm={vm} />
      {vm.canViewRegistrations && <RegistrationList clubId={vm.clubId} eventId={event.id} />}
    </div>
  )
}
