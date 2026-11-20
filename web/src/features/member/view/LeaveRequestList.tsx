import { motion } from 'motion/react'
import { CircleAlert, Check, Inbox, X } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { leaveRequestStatusDisplay } from '../viewModel/memberDisplay'
import type { LeaveFilter, LeaveRequestsViewModel } from '../viewModel/useLeaveRequestsViewModel'

const filters: Array<{ value: LeaveFilter; label: string }> = [
  { value: 'PENDING', label: 'Đang chờ' },
  { value: 'DECIDED', label: 'Đã xử lý' },
]

/** Yêu cầu xin tạm nghỉ (FR-MEM-07): duyệt thì người gửi sang Tạm nghỉ; từ chối kèm lý do. */
export function LeaveRequestList({ vm }: { vm: LeaveRequestsViewModel }) {
  const approving = vm.dialog?.mode === 'approve' ? vm.dialog.request : null
  const rejecting = vm.dialog?.mode === 'reject' ? vm.dialog.request : null

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Lọc yêu cầu tạm nghỉ" className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <FilterChip key={filter.value} label={filter.label} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
        ))}
      </div>
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} />
      {vm.loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="status" aria-label="Đang tải yêu cầu tạm nghỉ">
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.requests.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={vm.status === 'PENDING' ? 'Không có yêu cầu tạm nghỉ đang chờ' : 'Chưa có yêu cầu nào đã xử lý'}
          description="Thành viên Chính thức gửi yêu cầu tạm nghỉ ở thẻ Tư cách của tôi."
        />
      )}
      {!vm.error && vm.requests.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" key={`${vm.status}-${vm.page}`} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {vm.requests.map((request) => {
            const display = leaveRequestStatusDisplay[request.status]
            return (
              <motion.li key={request.id} variants={itemVariants} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Avatar name={request.member.fullName} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{request.member.fullName}</h3>
                    <p className="text-xs text-muted-foreground">
                      {request.department ? `Ban ${request.department.name}` : 'Chưa có ban'} · Gửi lúc {formatDateTime(request.createdAt)}
                    </p>
                  </div>
                  <Badge tone={display.tone}>{display.label}</Badge>
                </div>
                <blockquote className="rounded-xl bg-muted/50 p-3 text-sm">{request.reason}</blockquote>
                {request.decidedAt && request.status !== 'PENDING' && (
                  <p className="text-xs text-muted-foreground">
                    {request.decidedBy?.fullName ?? '—'} · {formatDateTime(request.decidedAt)}
                    {request.decisionNote && `: ${request.decisionNote}`}
                  </p>
                )}
                {request.blockers.length > 0 && (
                  <p className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {request.blockers.join(' ')}
                  </p>
                )}
                {request.allowedActions.length > 0 && (
                  <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {request.allowedActions.includes('REJECT') && (
                      <Button variant="outline" disabled={vm.pending} onClick={() => vm.openDialog(request, 'reject')}>
                        <X aria-hidden />
                        Từ chối
                      </Button>
                    )}
                    {request.allowedActions.includes('APPROVE') && (
                      <Button disabled={vm.pending || request.blockers.length > 0} onClick={() => vm.openDialog(request, 'approve')}>
                        <Check aria-hidden />
                        Duyệt
                      </Button>
                    )}
                  </div>
                )}
              </motion.li>
            )
          })}
        </motion.ul>
      )}
      {!vm.error && <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />}

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Duyệt tạm nghỉ"
        description={`${approving?.member.fullName ?? ''} chuyển sang Tạm nghỉ ngay: không nhận việc mới, không tính vào sĩ số điểm danh, tự quay lại được khi muốn.`}
        confirmLabel="Duyệt"
        pending={vm.pending}
        onConfirm={vm.approve}
      />
      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Từ chối yêu cầu tạm nghỉ"
        description={`${rejecting?.member.fullName ?? ''} sẽ thấy lý do này.`}
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={vm.pending}
        onConfirm={vm.reject}
      />
    </div>
  )
}
