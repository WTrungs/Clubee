import { useId } from 'react'
import { useWatch } from 'react-hook-form'
import { formatMoney } from '@/shared/format/formatMoney'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect, Textarea } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import type { DuesItemsViewModel } from '../viewModel/useDuesItemsViewModel'

/** Miễn giảm cho một người sau khi mở đợt (FR-FIN-09); mức không thấp hơn số người đó đã nộp. */
export function ExemptionDialog({ vm }: { vm: DuesItemsViewModel }) {
  const formId = useId()
  const { register, formState, control } = vm.exemptionForm
  const kind = useWatch({ control, name: 'kind' })
  const item = vm.dialog?.kind === 'EXEMPTION' ? vm.dialog.item : null
  const full = vm.campaign?.amount ?? 0
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && vm.closeDialog()}>
      <DialogContent
        title="Miễn giảm"
        description={item ? `${item.member.fullName}, mức đầy đủ ${formatMoney(full)}${item.paidAmount > 0 ? `, đã nộp ${formatMoney(item.paidAmount)}` : ''}.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Lưu
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submitExemption} className="space-y-4">
          <FormField label="Hình thức" required>
            <NativeSelect {...register('kind')}>
              <option value="EXEMPT">Miễn toàn bộ</option>
              <option value="REDUCED">Giảm còn</option>
              <option value="NONE">Không miễn giảm (đóng đủ)</option>
            </NativeSelect>
          </FormField>
          {kind === 'REDUCED' && (
            <FormField label="Mức sau giảm" required error={formState.errors.amount?.message}>
              <MoneyInput {...register('amount')} />
            </FormField>
          )}
          {kind !== 'NONE' && (
            <FormField label="Lý do" required error={formState.errors.reason?.message}>
              <Textarea rows={3} {...register('reason')} />
            </FormField>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
