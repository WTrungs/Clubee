import { motion } from 'motion/react'
import { ArrowLeft, CircleCheck, Flag, Pencil, TriangleAlert, UsersRound } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { fadeVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { Appointment, Handover } from '../model/handoverTypes'
import { appointmentTitle, termPeriod } from '../viewModel/termDisplay'
import { useHandoverViewModel } from '../viewModel/useHandoverViewModel'
import { AppointmentsSheet } from './AppointmentsSheet'
import { CompleteHandoverDialog } from './CompleteHandoverDialog'
import { HandoverItemsSection } from './HandoverItemsSection'

function AppointmentList({ title, appointments }: { title: string; appointments: Appointment[] }) {
  if (appointments.length === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <ul aria-label={title} className="divide-y rounded-xl border">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="flex items-start gap-3 px-3 py-2.5">
            <Avatar name={appointment.person.fullName} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold">{appointment.person.fullName}</p>
                {!appointment.eligible && <Badge tone="danger">Không đủ điều kiện</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{appointmentTitle(appointment)}</p>
              {appointment.ineligibleReason && <p className="mt-1 text-xs font-medium text-status-danger">{appointment.ineligibleReason}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Blockers({ handover }: { handover: Handover }) {
  if (handover.status !== 'OPEN') return null
  return (
    <section aria-labelledby="handover-blockers-title" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="handover-blockers-title" className="text-base font-bold">
        Điều kiện hoàn tất
      </h2>
      {handover.blockers.length === 0 ? (
        <p className="flex items-start gap-2 text-sm font-medium text-status-success">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Kết quả bầu, kế hoạch ban và danh mục bàn giao đã đủ điều kiện.
        </p>
      ) : (
        <ul className="space-y-2">
          {handover.blockers.map((blocker, index) => (
            <li key={`${index}-${blocker}`} className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {blocker}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Trang phiên bàn giao (FR-TERM-03..06): hai nhiệm kỳ, kết quả bầu, danh mục bàn giao, điều kiện còn thiếu và hoàn tất. */
export function HandoverPage() {
  const vm = useHandoverViewModel()
  const handover = vm.handover
  const termsPath = `/clubs/${encodeURIComponent(vm.clubId)}/terms`

  return (
    <div>
      <Link to={termsPath} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Nhiệm kỳ
      </Link>
      <PageHeader
        eyebrow={vm.clubName}
        title="Bàn giao nhiệm kỳ"
        description={handover ? `${handover.fromTerm.name} → ${handover.toTerm.name}` : undefined}
        actions={
          (vm.canEditAppointments || vm.canComplete) && (
            <>
              {vm.canEditAppointments && (
                <Button variant={vm.canComplete ? 'outline' : 'primary'} onClick={vm.openAppointments}>
                  <Pencil aria-hidden />
                  Sửa kết quả bầu
                </Button>
              )}
              {vm.canComplete && (
                <Button onClick={vm.openComplete}>
                  <Flag aria-hidden />
                  Hoàn tất bàn giao
                </Button>
              )}
            </>
          )
        }
      />

      {vm.loading && (
        <div className="space-y-4" role="status" aria-label="Đang tải phiên bàn giao">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}

      {handover && (
        <motion.div variants={fadeVariants} initial="initial" animate="animate" className="grid grid-cols-1 gap-5">
          <section aria-label="Thông tin phiên bàn giao" className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Bắt đầu {formatDateTime(handover.startedAt)} bởi {handover.startedBy.fullName}
                {handover.completedAt && ` · Hoàn tất ${formatDateTime(handover.completedAt)}`}
              </p>
              <Badge tone={handover.status === 'OPEN' ? 'warning' : 'success'} dot>
                {handover.status === 'OPEN' ? 'Đang bàn giao' : 'Đã hoàn tất'}
              </Badge>
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted p-3">
                <dt className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Bên giao</dt>
                <dd className="mt-1 text-sm">
                  <span className="font-semibold">{handover.fromTerm.name}</span>
                  <span className="block text-muted-foreground">{termPeriod(handover.fromTerm)}</span>
                </dd>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <dt className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Bên nhận</dt>
                <dd className="mt-1 text-sm">
                  <span className="font-semibold">{handover.toTerm.name}</span>
                  <span className="block text-muted-foreground">{handover.status === 'OPEN' ? `Dự kiến ${termPeriod(handover.toTerm)}` : termPeriod(handover.toTerm)}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="appointments-title" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 id="appointments-title" className="text-base font-bold">
                Kết quả bầu
              </h2>
              <p className="text-sm text-muted-foreground">Chức vụ mới có hiệu lực khi bàn giao hoàn tất; tới lúc đó ban chủ nhiệm hiện tại vẫn giữ quyền.</p>
            </div>
            {handover.appointments.length === 0 ? (
              <EmptyState icon={UsersRound} title="Chưa ghi kết quả bầu" description="Ban chủ nhiệm hiện tại ghi Chủ nhiệm, Phó chủ nhiệm, Thủ quỹ và trưởng, phó ban của nhiệm kỳ mới." />
            ) : (
              <>
                <AppointmentList title="Ban chủ nhiệm mới" appointments={vm.groups.board} />
                <AppointmentList title="Trưởng, phó ban" appointments={vm.groups.departments} />
              </>
            )}
          </section>

          <HandoverItemsSection handover={handover} />

          <Blockers handover={handover} />
        </motion.div>
      )}

      <AppointmentsSheet handover={handover} open={vm.appointmentsOpen} onClose={vm.closeAppointments} />
      <CompleteHandoverDialog handover={handover} open={vm.completeOpen} onClose={vm.closeComplete} />
    </div>
  )
}
