import { motion } from 'motion/react'
import { Check, MailQuestion, X } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { absenceStatusDisplay } from '../viewModel/sessionDisplay'
import { useAbsenceRequestsViewModel } from '../viewModel/useAbsenceViewModel'

/** Tab Xin phép cho người phụ trách buổi (FR-ATT-04). */
export function AbsenceRequestList({ clubId, sessionId }: { clubId: string; sessionId: string }) {
  const vm = useAbsenceRequestsViewModel(clubId, sessionId)
  return (
    <section aria-labelledby="absence-requests-heading" className="space-y-3">
      <h2 id="absence-requests-heading" className="flex items-center gap-2 font-bold">
        <MailQuestion aria-hidden className="size-4 text-muted-foreground" />
        Đơn xin phép vắng
      </h2>
      {vm.loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.rows.length === 0 && <EmptyState icon={MailQuestion} title="Chưa có đơn xin phép" />}
      {!vm.error && vm.rows.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="space-y-2">
          {vm.rows.map((row) => {
            const display = absenceStatusDisplay[row.status]
            const busy = vm.pendingId === row.id
            return (
              <motion.li key={row.id} variants={itemVariants} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Avatar name={row.requester.fullName} size="sm" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{row.requester.fullName}</span>
                      <Badge tone={display.tone} dot>
                        {display.label}
                      </Badge>
                    </p>
                    <p className="text-sm break-words">{row.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Gửi lúc {formatDateTime(row.createdAt)}
                      {row.decision && ` · ${row.status === 'APPROVED' ? 'duyệt' : 'từ chối'} bởi ${row.decision.by.fullName}`}
                      {row.decision?.note && `: ${row.decision.note}`}
                    </p>
                  </div>
                </div>
                {row.allowedActions.includes('DECIDE') && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => vm.approve(row)} loading={busy && !vm.rejecting} disabled={vm.deciding} aria-label={`Duyệt đơn của ${row.requester.fullName}`}>
                      <Check aria-hidden />
                      Duyệt
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => vm.openReject(row)} disabled={vm.deciding} aria-label={`Từ chối đơn của ${row.requester.fullName}`}>
                      <X aria-hidden />
                      Từ chối
                    </Button>
                  </div>
                )}
              </motion.li>
            )
          })}
        </motion.ul>
      )}
      <ReasonDialog
        open={vm.rejecting !== null}
        onOpenChange={(open) => !open && vm.closeReject()}
        title="Từ chối đơn xin phép?"
        description={vm.rejecting ? `${vm.rejecting.requester.fullName} sẽ nhận lý do này. Nếu vắng, người này bị ghi Vắng không phép.` : undefined}
        placeholder="Ví dụ: Buổi này có kiểm tra cuối khóa, cần có mặt."
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={vm.deciding}
        onConfirm={vm.confirmReject}
      />
    </section>
  )
}
