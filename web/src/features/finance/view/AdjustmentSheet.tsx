import { ArrowDownLeft, ArrowUpRight, CircleAlert } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { TransactionDetail } from '../model/financeTypes'
import { useAdjustmentViewModel } from '../viewModel/useAdjustmentViewModel'
import { AmountText } from './FinanceMeta'

type Original = Pick<TransactionDetail, 'id' | 'fundId' | 'fundName' | 'description' | 'amount' | 'flow'>

const directionOptions = [
  { value: 'IN', label: 'Tăng quỹ', hint: 'Ghi sổ ngay', icon: ArrowDownLeft },
  { value: 'OUT', label: 'Giảm quỹ', hint: 'Cần duyệt', icon: ArrowUpRight },
] as const

function AdjustmentForm({ original, onClose, onPendingChange }: { original: Original; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const errorId = useId()
  const vm = useAdjustmentViewModel(original, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Tạo điều chỉnh"
      description={`${original.fundName}. Giao dịch đã ghi sổ không sửa được; điều chỉnh ghi thêm một dòng tham chiếu giao dịch gốc.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            {vm.decreasing ? 'Gửi duyệt' : 'Ghi điều chỉnh'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <div className="rounded-2xl border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">Giao dịch gốc</p>
          <p className="mt-0.5 text-sm font-semibold break-words">{original.description}</p>
          <AmountText amount={original.amount} flow={original.flow} className="mt-1 block text-sm" />
        </div>

        <fieldset aria-describedby={errors.direction ? errorId : undefined} className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-semibold">
            Chiều điều chỉnh
            <span aria-hidden className="ml-0.5 text-destructive">
              *
            </span>
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {directionOptions.map(({ value, label, hint, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors duration-200 hover:border-input',
                  'has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-4 has-focus-visible:ring-primary/15',
                )}
              >
                <input type="radio" value={value} className="size-4 accent-primary" {...register('direction')} />
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.direction && (
            <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive">
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {errors.direction.message}
            </p>
          )}
        </fieldset>

        {vm.decreasing && (
          <p role="status" className="rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning">
            Điều chỉnh giảm quỹ cần một thành viên ban chủ nhiệm khác bạn duyệt; duyệt xong mới được ghi sổ.
          </p>
        )}

        <FormField label="Số tiền điều chỉnh" required error={errors.amount?.message}>
          <MoneyInput {...register('amount')} />
        </FormField>
        <FormField label="Lý do" required error={errors.reason?.message} hint="Ví dụ: Ghi thiếu 50.000 đ tiền thuê phòng theo hóa đơn.">
          <Textarea rows={3} maxLength={200} {...register('reason')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-FIN-05: tạo giao dịch điều chỉnh từ chi tiết một giao dịch đã ghi sổ. */
export function AdjustmentSheet({ open, original, onClose }: { open: boolean; original: Original; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <AdjustmentForm original={original} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
