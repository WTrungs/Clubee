import { useId } from 'react'
import { formatMoney } from '@/shared/format/formatMoney'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import type { ConfirmPaymentViewModel } from '../viewModel/useConfirmPaymentViewModel'

/** FR-FIN-10: xác nhận đã nộp; mỗi lần ghi một khoản thu vào sổ Quỹ chung. */
export function ConfirmPaymentDialog({ vm }: { vm: ConfirmPaymentViewModel }) {
  const formId = useId()
  const { register, formState } = vm.form
  return (
    <Dialog open={vm.item !== null} onOpenChange={(open) => !open && vm.close()}>
      <DialogContent
        title="Xác nhận đã nộp"
        description={vm.item ? `${vm.item.member.fullName} còn thiếu ${formatMoney(vm.owed)}. Hệ thống ghi một khoản thu "Đóng quỹ thành viên" vào sổ Quỹ chung.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={vm.close} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Xác nhận
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
          <FormField label="Số tiền nộp" required error={formState.errors.amount?.message}>
            <MoneyInput {...register('amount')} />
          </FormField>
          <FormField label="Ngày nộp" required error={formState.errors.paidDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('paidDate')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}
