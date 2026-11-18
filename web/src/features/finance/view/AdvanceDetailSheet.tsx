import { Check, HandCoins, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { AdvanceDetail } from '../model/advanceTypes'
import { advanceStatusDisplay, settleByText } from '../viewModel/advanceDisplay'
import { financeCategoryLabel } from '../viewModel/financeDisplay'
import { useAdvanceActionsViewModel, type AdvanceActionsViewModel } from '../viewModel/useAdvanceActionsViewModel'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  )
}

/** Hộp ghi đã ứng: số dư tải mới để Thủ quỹ biết có đủ không (BR-FIN-08), ngày ứng không sau hôm nay. */
export function DisburseDialog({ vm, advance }: { vm: AdvanceActionsViewModel; advance: AdvanceDetail }) {
  const formId = useId()
  const { register, formState } = vm.disburseForm
  const short = vm.fundBalance !== null && vm.fundBalance < advance.amount
  return (
    <Dialog open={vm.dialog === 'DISBURSE'} onOpenChange={(open) => !open && vm.closeDialog()}>
      <DialogContent
        title="Ghi đã ứng"
        description={`Chi ${formatMoney(advance.amount)} từ ${advance.fundName} cho ${advance.requester.fullName}. Hệ thống ghi một khoản chi đã ghi sổ.`}
        footer={
          <>
            <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending} disabled={vm.fundBalance === null || short}>
              Ghi đã ứng
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submitDisburse} className="space-y-4">
          {vm.fundBalanceError ? (
            <div role="alert" className="flex flex-col gap-2 rounded-xl bg-status-danger-soft p-3 text-sm sm:flex-row sm:items-center">
              <p className="flex-1 text-status-danger">Không tải được số dư hiện tại: {vm.fundBalanceError}</p>
              <Button type="button" variant="outline" size="sm" onClick={vm.retryFundBalance} className="self-start sm:self-auto">
                Thử lại
              </Button>
            </div>
          ) : (
            <p role="status" className={short ? 'rounded-xl bg-status-danger-soft p-3 text-sm text-status-danger' : 'rounded-xl border bg-muted/40 p-3 text-sm'}>
              {vm.fundBalance === null
                ? 'Đang tải số dư mới nhất…'
                : short
                  ? `Số dư quỹ còn ${formatMoney(vm.fundBalance)}, không đủ để ứng.`
                  : `Số dư quỹ hiện tại ${formatMoney(vm.fundBalance)}, sau khi ứng còn ${formatMoney(vm.fundBalance - advance.amount)}.`}
            </p>
          )}
          <FormField label="Ngày ứng" required error={formState.errors.disbursedDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('disbursedDate')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdvanceBody({ vm, advance, onOpenTransaction }: { vm: AdvanceActionsViewModel; advance: AdvanceDetail; onOpenTransaction?: (transactionId: string) => void }) {
  const status = advanceStatusDisplay[advance.status]
  const settle = settleByText(advance)
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {advance.overdue && <Badge tone="danger">Quá hạn</Badge>}
        </p>
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(advance.amount)}</p>
        <p className="text-sm">{advance.purpose}</p>
        {settle && <p className={advance.overdue ? 'text-sm font-semibold text-status-danger' : 'text-sm text-muted-foreground'}>{settle}</p>}
      </div>
      <dl className="divide-y rounded-xl border px-4">
        <Row label="Người ứng">{advance.requester.fullName}</Row>
        <Row label="Quỹ">{advance.fundName}</Row>
        <Row label="Hạng mục">{financeCategoryLabel[advance.category]}</Row>
        <Row label="Đề xuất lúc">{formatDateTime(advance.createdAt)}</Row>
        {advance.approver && advance.decidedAt && (
          <Row label={advance.status === 'REJECTED' ? 'Từ chối bởi' : 'Duyệt bởi'}>
            {advance.approver.fullName}, {formatDateTime(advance.decidedAt)}
          </Row>
        )}
        {advance.rejectionReason && <Row label="Lý do từ chối">{advance.rejectionReason}</Row>}
        {advance.disbursedBy && advance.disbursedOn && (
          <Row label="Ghi đã ứng">
            {advance.disbursedBy.fullName}, ngày {formatDate(advance.disbursedOn)}
          </Row>
        )}
        {advance.disbursementTxId && onOpenTransaction && (
          <Row label="Khoản chi">
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => advance.disbursementTxId && onOpenTransaction(advance.disbursementTxId)}
            >
              Xem khoản chi đã ghi sổ
            </button>
          </Row>
        )}
      </dl>
      {(vm.canApprove || vm.canReject || vm.canDisburse) && (
        <div className="flex flex-wrap gap-2">
          {vm.canApprove && (
            <Button onClick={vm.approve} loading={vm.pendingAction === 'APPROVE'} disabled={vm.pending}>
              <Check aria-hidden />
              Duyệt
            </Button>
          )}
          {vm.canReject && (
            <Button variant="outline" onClick={vm.openReject} disabled={vm.pending}>
              <X aria-hidden />
              Từ chối
            </Button>
          )}
          {vm.canDisburse && (
            <Button onClick={vm.openDisburse} disabled={vm.pending}>
              <HandCoins aria-hidden />
              Ghi đã ứng
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Chi tiết tạm ứng mở bằng `?adv=` (FR-FIN-07): trạng thái theo ST-ADV, hạn, người duyệt, thao tác máy chủ cho phép. */
export function AdvanceDetailSheet({
  advanceId,
  onClose,
  onOpenTransaction,
}: {
  advanceId: string | null
  onClose: () => void
  onOpenTransaction?: (transactionId: string) => void
}) {
  const vm = useAdvanceActionsViewModel(advanceId)
  const advance = vm.advance
  return (
    <Sheet open={advanceId !== null} onOpenChange={(open) => !open && !vm.pending && onClose()}>
      <SheetContent title="Tạm ứng" description={advance ? `${advance.requester.fullName} · ${advance.fundName}` : undefined}>
        {vm.loading && (
          <div className="space-y-3 p-5" role="status" aria-label="Đang tải tạm ứng">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} className="m-5" />}
        {advance && <AdvanceBody vm={vm} advance={advance} onOpenTransaction={onOpenTransaction} />}
      </SheetContent>
      {advance && <DisburseDialog vm={vm} advance={advance} />}
      <ReasonDialog
        open={vm.dialog === 'REJECT'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Từ chối tạm ứng"
        description="Người ứng nhận thông báo kèm lý do."
        confirmLabel="Từ chối tạm ứng"
        dismissLabel="Quay lại"
        confirmVariant="destructive"
        pending={vm.pending}
        onConfirm={vm.confirmReject}
      />
    </Sheet>
  )
}
