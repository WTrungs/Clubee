import { CalendarClock, DoorOpen, PauseCircle, PlayCircle, Undo2 } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import type { MyMembership } from '../model/memberTypes'
import { leaveRequestStatusDisplay } from '../viewModel/memberDisplay'
import { useMyMembershipViewModel } from '../viewModel/useMyMembershipViewModel'
import { MemberStatusBadge } from './MemberTable'
import { ResignDialog } from './ResignDialog'

/** Yêu cầu tạm nghỉ gần nhất: đang chờ, hoặc bị từ chối kèm lý do; yêu cầu đã duyệt, đã rút thì không cần nhắc. */
function LeaveRequestNote({ membership }: { membership: MyMembership }) {
  const request = membership.leaveRequest
  if (!request || (request.status !== 'PENDING' && request.status !== 'REJECTED')) return null
  const display = leaveRequestStatusDisplay[request.status]
  return (
    <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        Yêu cầu tạm nghỉ
        <Badge tone={display.tone}>{display.label}</Badge>
      </p>
      <p className="text-muted-foreground">
        Gửi lúc {formatDateTime(request.createdAt)}: {request.reason}
      </p>
      {request.status === 'REJECTED' && request.decisionNote && (
        <p>
          {request.decidedBy?.fullName ?? 'Ban chủ nhiệm'} từ chối: {request.decisionNote}
        </p>
      )}
    </div>
  )
}

/** FR-MEM-07: thẻ đầu trang Thành viên cho chính người đang xem. */
export function MyMembershipCard() {
  const { club } = useCurrentClub()
  const vm = useMyMembershipViewModel()
  const membership = vm.membership

  if (vm.loading) return <Skeleton className="mb-5 h-28 rounded-2xl" />
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} className="mb-5" />
  if (!membership) return null
  const leaveBlocked = membership.leaveBlockers.length > 0

  return (
    <section aria-labelledby="my-membership-title" className="mb-5 space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="my-membership-title" className="text-base font-bold">
            Tư cách của tôi
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <MemberStatusBadge status={membership.status} />
            <span>{membership.department ? `Ban ${membership.department.name}` : 'Chưa có ban'}</span>
            {membership.joinedOn && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock aria-hidden className="size-3.5" />
                Gia nhập {formatDate(membership.joinedOn)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {vm.can('RETURN') && (
            <Button size="sm" disabled={vm.pending} onClick={() => vm.open('return')}>
              <PlayCircle aria-hidden />
              Quay lại sinh hoạt
            </Button>
          )}
          {vm.can('REQUEST_LEAVE') && (
            <Button size="sm" variant="outline" disabled={vm.pending || leaveBlocked} onClick={() => vm.open('leave')}>
              <PauseCircle aria-hidden />
              Xin tạm nghỉ
            </Button>
          )}
          {vm.can('WITHDRAW_LEAVE_REQUEST') && (
            <Button size="sm" variant="outline" disabled={vm.pending} onClick={() => vm.open('withdraw')}>
              <Undo2 aria-hidden />
              Rút yêu cầu tạm nghỉ
            </Button>
          )}
          {vm.can('RESIGN') && (
            <Button size="sm" variant="ghost" disabled={vm.pending} onClick={() => vm.open('resign')}>
              <DoorOpen aria-hidden />
              Xin rời CLB
            </Button>
          )}
        </div>
      </div>
      {vm.can('REQUEST_LEAVE') && leaveBlocked && <p className="text-xs text-muted-foreground">Chưa xin tạm nghỉ được: {membership.leaveBlockers.join(' ')}</p>}
      <LeaveRequestNote membership={membership} />

      <ReasonDialog
        open={vm.dialog === 'leave'}
        onOpenChange={(open) => !open && vm.close()}
        title="Xin tạm nghỉ"
        description="Ban chủ nhiệm sẽ duyệt yêu cầu. Khi tạm nghỉ, bạn không nhận việc mới và không tính vào sĩ số điểm danh; quay lại lúc nào cũng được."
        confirmLabel="Gửi yêu cầu"
        pending={vm.pending}
        onConfirm={vm.confirm}
      />
      <ConfirmDialog
        open={vm.dialog === 'withdraw'}
        onOpenChange={(open) => !open && vm.close()}
        title="Rút yêu cầu tạm nghỉ"
        description="Yêu cầu đang chờ sẽ được hủy; bạn vẫn sinh hoạt bình thường."
        confirmLabel="Rút yêu cầu"
        pending={vm.pending}
        onConfirm={() => vm.confirm()}
      />
      <ConfirmDialog
        open={vm.dialog === 'return'}
        onOpenChange={(open) => !open && vm.close()}
        title="Quay lại sinh hoạt"
        description="Bạn trở lại là thành viên Chính thức ngay, không cần gia nhập lại."
        confirmLabel="Quay lại"
        pending={vm.pending}
        onConfirm={() => vm.confirm()}
      />
      <ResignDialog
        open={vm.dialog === 'resign'}
        clubName={club.name}
        blockers={membership.resignBlockers}
        checking={vm.checking}
        pending={vm.pending}
        errorMessage={vm.errorMessage}
        onClose={vm.close}
        onConfirm={vm.confirm}
      />
    </section>
  )
}
