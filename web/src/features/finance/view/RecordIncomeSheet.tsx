import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { financeCategoryLabel } from '../viewModel/financeDisplay'
import { useRecordIncomeViewModel } from '../viewModel/useRecordIncomeViewModel'

function IncomeForm({ fundId, fundName, onClose, onPendingChange }: { fundId: string; fundName: string; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useRecordIncomeViewModel(fundId, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Ghi khoản thu"
      description={`Ghi vào ${fundName}. Khoản thu được ghi sổ ngay và mọi người xem quỹ đều thấy.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Ghi khoản thu
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Số tiền" required error={errors.amount?.message}>
            <MoneyInput {...register('amount')} />
          </FormField>
          <FormField label="Ngày thu" required error={errors.occurredDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('occurredDate')} />
          </FormField>
        </div>
        <FormField label="Hạng mục" required error={errors.category?.message}>
          <NativeSelect defaultValue="" {...register('category')}>
            <option value="" disabled>
              Chọn hạng mục thu…
            </option>
            {vm.categories.map((category) => (
              <option key={category} value={category}>
                {financeCategoryLabel[category]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Nội dung" required error={errors.description?.message} hint="Ví dụ: Thu quỹ học kỳ 2, Tài trợ của cửa hàng X.">
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

/** FR-FIN-01: Thủ quỹ ghi khoản thu. */
export function RecordIncomeSheet({ open, fundId, fundName, onClose }: { open: boolean; fundId: string; fundName: string; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <IncomeForm fundId={fundId} fundName={fundName} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
