import { useEffect, useId, useState } from 'react'
import { formatMoney } from '@/shared/format/formatMoney'
import { Button } from '@/shared/ui/Button'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { AdvanceDetail } from '../model/advanceTypes'
import { SETTLEMENT_TEXT_MAX } from '../viewModel/advanceSchemas'
import { useSubmitSettlementViewModel } from '../viewModel/useSubmitSettlementViewModel'

type AdvanceRef = Pick<AdvanceDetail, 'id' | 'version' | 'amount' | 'confirmedAmount' | 'purpose'>

function SettlementForm({ advance, onClose, onPendingChange }: { advance: AdvanceRef; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useSubmitSettlementViewModel(advance, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])
  const remaining = Math.max(advance.amount - advance.confirmedAmount, 0)

  return (
    <SheetContent
      title="Nộp chứng từ quyết toán"
      description={`${advance.purpose}. Còn ${formatMoney(remaining)} chưa được xác nhận; mỗi lần nộp một khoản đã chi, Thủ quỹ xác nhận từng lần.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Nộp chứng từ
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Số tiền đã chi" required error={errors.amount?.message}>
          <MoneyInput {...register('amount')} />
        </FormField>
        <FormField label="Nội dung" required error={errors.description?.message} hint="Ví dụ: Mua 3 bộ dây đàn tại cửa hàng nhạc cụ.">
          <Input maxLength={SETTLEMENT_TEXT_MAX} {...register('description')} />
        </FormField>
        <FormField label="Ngày chi" required error={errors.spentDate?.message}>
          <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('spentDate')} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">
            Chứng từ <span className="text-destructive">*</span>
          </p>
          <FileInput files={vm.files} onChange={vm.setFiles} disabled={vm.pending} label="Đính kèm chứng từ" />
          {vm.filesError && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {vm.filesError}
            </p>
          )}
        </div>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-FIN-08: người ứng nộp một lần chứng từ quyết toán tạm ứng. */
export function SubmitSettlementSheet({ open, advance, onClose }: { open: boolean; advance: AdvanceRef; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <SettlementForm advance={advance} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
