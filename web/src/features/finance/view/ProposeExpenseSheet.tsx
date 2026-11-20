import { useEffect, useId, useState } from 'react'
import { formatMoney } from '@/shared/format/formatMoney'
import { Button } from '@/shared/ui/Button'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { FundDetail } from '../model/financeTypes'
import { financeCategoryLabel } from '../viewModel/financeDisplay'
import { useProposeExpenseViewModel } from '../viewModel/useProposeExpenseViewModel'

type FundRef = Pick<FundDetail, 'id' | 'name' | 'receiptThreshold'>

function ExpenseForm({ fund, onClose, onPendingChange }: { fund: FundRef; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useProposeExpenseViewModel(fund, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Đề xuất chi"
      description={`Chi từ ${fund.name}. Một thành viên ban chủ nhiệm khác bạn sẽ duyệt, rồi Thủ quỹ ghi sổ khi đã chi thật.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Gửi đề xuất
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Số tiền" required error={errors.amount?.message} hint={`Trên ${formatMoney(vm.receiptThreshold)} phải có chứng từ.`}>
          <MoneyInput {...register('amount')} />
        </FormField>
        <FormField label="Hạng mục" required error={errors.category?.message}>
          <NativeSelect defaultValue="" {...register('category')}>
            <option value="" disabled>
              Chọn hạng mục chi…
            </option>
            {vm.categories.map((category) => (
              <option key={category} value={category}>
                {financeCategoryLabel[category]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Nội dung" required error={errors.description?.message} hint="Ví dụ: Thuê âm thanh cho đêm nhạc, In poster tuyển thành viên.">
          <Input maxLength={200} {...register('description')} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Chứng từ</p>
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

/** FR-FIN-02: đề xuất chi từ quỹ đang xem. */
export function ProposeExpenseSheet({ open, fund, onClose }: { open: boolean; fund: FundRef; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <ExpenseForm fund={fund} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
