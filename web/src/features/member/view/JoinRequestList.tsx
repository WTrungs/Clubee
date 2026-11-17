import { motion } from 'motion/react'
import { Check, History, Inbox, Link2, X } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Pagination } from '@/shared/ui/ListControls'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { JoinRequestsViewModel } from '../viewModel/useJoinRequestsViewModel'
import { ApproveRequestDialog } from './ApproveRequestDialog'
import { PastMemberships } from './PastMemberships'

/** Yêu cầu gia nhập đang chờ (FR-MEM-03): duyệt kèm ban chính, hoặc từ chối kèm lý do. */
export function JoinRequestList({ vm }: { vm: JoinRequestsViewModel }) {
  const rejecting = vm.dialog?.mode === 'reject' ? vm.dialog.request : null

  return (
    <div className="space-y-4">
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} />
      {vm.loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="status" aria-label="Đang tải yêu cầu gia nhập">
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.requests.length === 0 && (
        <EmptyState icon={Inbox} title="Không có yêu cầu nào đang chờ" description="Yêu cầu gia nhập mới sẽ xuất hiện ở đây để ban chủ nhiệm xem xét." />
      )}
      {!vm.error && vm.requests.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" key={vm.page} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {vm.requests.map((request) => {
            const canApprove = request.allowedActions.some((action) => action === 'APPROVE_ACTIVE' || action === 'APPROVE_PROBATION')
            const canReject = request.allowedActions.includes('REJECT')
            const everJoined = request.pastMemberships.some((past) => past.joinedOn !== null)
            return (
              <motion.li key={request.membershipId} variants={itemVariants} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Avatar name={request.applicant.fullName} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{request.applicant.fullName}</h3>
                    <p className="truncate text-xs text-muted-foreground">{request.contact.email}</p>
                    {request.studentId && <p className="text-xs text-muted-foreground">MSSV {request.studentId}</p>}
                    <p className="text-xs text-muted-foreground">Gửi lúc {formatDateTime(request.requestedAt)}</p>
                    {request.invitedBy && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <Link2 aria-hidden className="size-3.5" />
                        Qua lời mời của {request.invitedBy.fullName}
                      </p>
                    )}
                  </div>
                </div>
                <blockquote className="rounded-xl bg-muted/50 p-3 text-sm">{request.introduction}</blockquote>
                {request.pastMemberships.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-status-warning">
                      <History aria-hidden className="size-4" />
                      {everJoined ? 'Người này từng là thành viên của CLB' : 'Các lần gửi yêu cầu trước'}
                    </p>
                    <PastMemberships items={request.pastMemberships} />
                  </div>
                )}
                {(canApprove || canReject) && (
                  <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {canReject && (
                      <Button variant="outline" disabled={vm.pending} onClick={() => vm.openDialog(request, 'reject')}>
                        <X aria-hidden />
                        Từ chối
                      </Button>
                    )}
                    {canApprove && (
                      <Button disabled={vm.pending} onClick={() => vm.openDialog(request, 'approve')}>
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
      {!vm.error && (
        <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
      )}

      <ApproveRequestDialog vm={vm} />
      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Từ chối yêu cầu gia nhập"
        description={`${rejecting?.applicant.fullName ?? ''} sẽ thấy lý do này. Tài khoản của họ không bị ảnh hưởng.`}
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={vm.pending}
        onConfirm={vm.reject}
      />
    </div>
  )
}
