import { Check, FileText, Lock, Undo2, Upload } from 'lucide-react'
import { useId } from 'react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { formatFileSize } from '@/shared/lib/validateUploadFile'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import type { AdvanceDetail, AdvanceLine } from '../model/advanceTypes'
import { advanceLineStatusDisplay, closureText, settlementProgress } from '../viewModel/advanceDisplay'
import { useAdvanceSettlementViewModel, type AdvanceSettlementViewModel } from '../viewModel/useAdvanceSettlementViewModel'
import { SubmitSettlementSheet } from './SubmitSettlementSheet'

function LineItem({ line, vm }: { line: AdvanceLine; vm: AdvanceSettlementViewModel }) {
  const status = advanceLineStatusDisplay[line.status]
  const decidable = vm.canDecide && line.status === 'SUBMITTED'
  return (
    <li className="space-y-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold break-words">{line.description}</p>
          <p className="text-xs text-muted-foreground">
            Chi ngày {formatDate(line.spentOn)} · nộp {formatDateTime(line.submittedAt)}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(line.amount)}</span>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      {line.note && <p className="text-xs break-words text-status-danger">Lý do trả lại: {line.note}</p>}
      {line.attachments.length > 0 && (
        <ul className="space-y-1">
          {line.attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-2 text-xs">
              <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {decidable && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => vm.confirmLine(line.id)} loading={vm.pendingLine === line.id} disabled={vm.pending} aria-label={`Xác nhận ${line.description}`}>
            <Check aria-hidden />
            Xác nhận
          </Button>
          <Button size="sm" variant="outline" onClick={() => vm.openReturn(line.id)} disabled={vm.pending} aria-label={`Trả lại ${line.description}`}>
            <Undo2 aria-hidden />
            Trả lại
          </Button>
        </div>
      )}
    </li>
  )
}

/** Hộp chốt: nói trước hệ thống sẽ ghi gì (hoàn, chi bổ sung, hay khớp); có phần hoàn thì hỏi ngày nhận lại tiền. */
function CloseAdvanceDialog({ vm, advance }: { vm: AdvanceSettlementViewModel; advance: AdvanceDetail }) {
  const formId = useId()
  const { register, formState } = vm.closeForm
  return (
    <Dialog open={vm.dialog?.kind === 'CLOSE'} onOpenChange={(open) => !open && vm.closeDialog()}>
      <DialogContent
        title="Chốt quyết toán"
        description={`Đã ứng ${formatMoney(advance.amount)}, đã xác nhận ${formatMoney(advance.confirmedAmount)}. Sau khi chốt, tạm ứng không nhận thêm chứng từ.`}
        footer={
          <>
            <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Chốt quyết toán
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submitClose} className="space-y-4">
          <p role="status" className="rounded-xl border bg-muted/40 p-3 text-sm">
            {vm.preview.text}
          </p>
          {vm.preview.kind === 'REFUND' && (
            <FormField label="Ngày nhận lại tiền" required error={formState.errors.refundDate?.message}>
              <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('refundDate')} />
            </FormField>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** FR-FIN-08 trong sheet tạm ứng: thanh đối chiếu, các lần nộp, nộp chứng từ, xác nhận, trả lại, chốt. */
export function AdvanceSettlementSection({ advance, onOpenTransaction }: { advance: AdvanceDetail; onOpenTransaction?: (transactionId: string) => void }) {
  const vm = useAdvanceSettlementViewModel(advance)
  const titleId = useId()
  const { remaining, over } = settlementProgress(advance.amount, advance.confirmedAmount)
  const closure = advance.closure
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className="text-sm font-semibold">
        Quyết toán
      </h3>
      <div className="space-y-2 rounded-xl border p-4">
        <ProgressBar value={advance.confirmedAmount} max={advance.amount} label="Tiến độ quyết toán" tone={over > 0 ? 'warning' : 'success'} />
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Đã ứng</dt>
            <dd className="min-w-0 font-semibold break-words tabular-nums">{formatMoney(advance.amount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Đã xác nhận</dt>
            <dd className="min-w-0 font-semibold break-words tabular-nums">{formatMoney(advance.confirmedAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{closure?.kind === 'REFUND' ? 'Đã hoàn' : over > 0 ? 'Chi vượt' : 'Còn lại'}</dt>
            <dd className={over > 0 ? 'min-w-0 font-semibold break-words text-status-warning tabular-nums' : 'min-w-0 font-semibold break-words tabular-nums'}>{formatMoney(over > 0 ? over : remaining)}</dd>
          </div>
        </dl>
      </div>

      {closure && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-status-success-soft p-3 text-sm">
          <span className="flex-1">
            {closureText(closure)} Chốt bởi {closure.closedBy.fullName}, {formatDateTime(closure.closedAt)}.
          </span>
          {closure.transactionId && onOpenTransaction && (
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => closure.transactionId && onOpenTransaction(closure.transactionId)}
            >
              {closure.kind === 'REFUND' ? 'Xem khoản hoàn' : 'Xem khoản chi bổ sung'}
            </button>
          )}
        </div>
      )}

      {(vm.canSubmit || vm.canClose || vm.canDecide) && (
        <div className="flex flex-wrap items-center gap-2">
          {vm.canSubmit && (
            <Button onClick={vm.openSubmit} disabled={vm.pending}>
              <Upload aria-hidden />
              Nộp chứng từ
            </Button>
          )}
          {vm.canClose && (
            <Button variant="outline" onClick={vm.openClose} disabled={vm.pending}>
              <Lock aria-hidden />
              Chốt quyết toán
            </Button>
          )}
          {vm.canDecide && <p className="text-xs text-muted-foreground">Xác nhận hoặc trả lại {vm.pendingLines} lần nộp đang chờ rồi mới chốt được.</p>}
        </div>
      )}

      {advance.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa nộp chứng từ nào.</p>
      ) : (
        <ul className="space-y-2" aria-label="Các lần nộp chứng từ">
          {advance.lines.map((line) => (
            <LineItem key={line.id} line={line} vm={vm} />
          ))}
        </ul>
      )}

      <SubmitSettlementSheet open={vm.dialog?.kind === 'SUBMIT'} advance={advance} onClose={vm.closeDialog} />
      <CloseAdvanceDialog vm={vm} advance={advance} />
      <ReasonDialog
        open={vm.dialog?.kind === 'RETURN'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Trả lại chứng từ"
        description="Người ứng nhận thông báo kèm lý do và nộp lại bằng lần nộp mới."
        confirmLabel="Trả lại"
        dismissLabel="Quay lại"
        pending={vm.pending}
        onConfirm={vm.confirmReturn}
      />
    </section>
  )
}
