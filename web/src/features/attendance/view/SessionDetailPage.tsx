import { motion } from 'motion/react'
import { ArrowLeft, CalendarClock, MapPin, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDateTime, formatTimeRange } from '@/shared/format/formatDate'
import { duration, easeOut } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import { capacityLabel, sessionScopeLabel } from '../viewModel/sessionDisplay'
import { useSessionDetailViewModel } from '../viewModel/useSessionDetailViewModel'
import { AttendancePanel } from './AttendancePanel'
import { SessionTimingBadge } from './SessionMeta'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function SessionDetailPage() {
  const vm = useSessionDetailViewModel()
  const session = vm.session

  if (vm.loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải buổi sinh hoạt">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }
  if (vm.error || !session) return <ErrorState error={vm.error} onRetry={vm.refetch} />

  return (
    <div className="space-y-5">
      <Link to={`/clubs/${vm.clubId}/sessions`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Tất cả buổi sinh hoạt
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: easeOut }}
        className="space-y-3 rounded-3xl bg-brand p-6 text-brand-foreground sm:p-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-card px-1 py-0.5">
            <SessionTimingBadge session={session} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold opacity-90">
            <UsersRound aria-hidden className="size-4" />
            {sessionScopeLabel(session.scope)}
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{session.title}</h1>
        <div className="flex flex-col gap-1.5 text-sm font-medium sm:flex-row sm:flex-wrap sm:gap-x-5">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock aria-hidden className="size-4 shrink-0" />
            {formatTimeRange(session.startAt, session.endAt)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{session.location}</span>
          </span>
        </div>
      </motion.header>

      <Tabs value={vm.tab} onValueChange={vm.setTab}>
        <TabsBar items={vm.tabs} active={vm.tab} aria-label="Nội dung buổi sinh hoạt" />
        <TabsContent value="info" className="pt-5">
          <section aria-labelledby="session-info" className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 id="session-info" className="text-base font-bold">
              Thông tin buổi
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Thời gian">{formatTimeRange(session.startAt, session.endAt)}</Field>
              <Field label="Địa điểm">
                <span className="break-words">{session.location}</span>
              </Field>
              <Field label="Phạm vi">{sessionScopeLabel(session.scope)}</Field>
              <Field label="Số chỗ">{capacityLabel(session.capacity)}</Field>
              <Field label="Hạn đăng ký">{session.registrationDeadline ? formatDateTime(session.registrationDeadline) : 'Không đặt hạn'}</Field>
              <Field label="Người tạo">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={session.creator.fullName} size="xs" />
                  {session.creator.fullName}
                </span>
              </Field>
              <Field label="Tạo lúc">{formatDateTime(session.createdAt)}</Field>
            </dl>
            {session.description && (
              <div className="space-y-1.5 border-t pt-4">
                <h3 className="text-sm font-bold">Nội dung</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{session.description}</p>
              </div>
            )}
          </section>
        </TabsContent>
        {vm.canViewAttendance && (
          <TabsContent value="attendance" className="pt-5">
            <AttendancePanel activity={{ type: 'SESSION', clubId: vm.clubId, id: vm.sessionId }} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
