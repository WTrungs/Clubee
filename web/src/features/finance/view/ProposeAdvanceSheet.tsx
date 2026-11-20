import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { FundDetail } from '../model/financeTypes'
import { ADVANCE_PURPOSE_MAX } from '../viewModel/advanceSchemas'
import { financeCategoryLabel } from '../viewModel/financeDisplay'
import { useProposeAdvanceViewModel } from '../viewModel/useProposeAdvanceViewModel'

type FundRef = Pick<FundDetail, 'id' | 'name' | 'advanceSettleDays'>

function AdvanceForm({ fund, onClose, onPendingChange }: { fund: FundRef; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useProposeAdvanceViewModel(fund, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Đề xuất tạm ứng"
      description={`Ứng trước từ ${fund.name} để chi tiêu, sau đó nộp chứng từ quyết toán. Một thành viên ban chủ nhiệm khác bạn sẽ duyệt.`}
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
        <FormField label="Số tiền" required error={errors.amount?.message}>
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
        <FormField label="Mục đích" required error={errors.purpose?.message} hint="Ví dụ: Mua dây đàn dự phòng cho buổi tập.">
          <Textarea rows={3} maxLength={ADVANCE_PURPOSE_MAX} {...register('purpose')} />
        </FormField>
        <FormField label="Hạn quyết toán" required error={errors.settleDate?.message} hint="Ngày dạng dd/mm/yyyy, tối đa 90 ngày tới. Quá hạn thì chưa ứng thêm được.">
          <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('settleDate')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-FIN-07: đề xuất tạm ứng từ quỹ đang xem. */
export function ProposeAdvanceSheet({ open, fund, onClose }: { open: boolean; fund: FundRef; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <AdvanceForm fund={fund} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
