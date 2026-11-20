import { Info } from 'lucide-react'
import { useId } from 'react'
import { REASON_MAX } from '@/shared/lib/reasonRules'
import { Button } from '@/shared/ui/Button'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { EventDetail } from '../model/eventTypes'
import { formatEventTime, rescheduleImpact } from '../viewModel/eventDisplay'
import type { RescheduleViewModel } from '../viewModel/useRescheduleViewModel'

/** FR-EVT-14: Trưởng BTC hoặc ban chủ nhiệm dời giờ, thấy trước ai phải xác nhận lại. */
export function RescheduleSheet({ event, vm }: { event: EventDetail; vm: RescheduleViewModel }) {
  const formId = useId()
  const impactId = useId()
  const { register, formState } = vm.form
  const errors = formState.errors

  return (
    <Sheet open={vm.open} onOpenChange={(next) => !next && vm.close()}>
      <SheetContent
        title="Dời thời gian"
        description={`Giờ hiện tại: ${formatEventTime(event)}.`}
        footer={
          <>
            <Button variant="ghost" onClick={vm.close} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              Dời thời gian
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} aria-describedby={impactId} className="space-y-5 p-5">
          <p id={impactId} className="flex items-start gap-2 rounded-xl bg-status-info-soft p-3 text-sm text-status-info">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{rescheduleImpact(event)}</span>
          </p>
          <DateTimeRow label="Bắt đầu mới" date={register('startDate')} time={register('startTime')} error={errors.startDate?.message ?? errors.startTime?.message} />
          <DateTimeRow label="Kết thúc mới" date={register('endDate')} time={register('endTime')} error={errors.endDate?.message ?? errors.endTime?.message} />
          <DateTimeRow label="Hạn đăng ký" date={register('deadlineDate')} time={register('deadlineTime')} error={errors.deadlineDate?.message} required={false} />
          <FormField label="Lý do" required error={errors.reason?.message} hint="Người đăng ký và BTC nhận thông báo kèm giờ cũ, giờ mới và lý do này.">
            <Textarea rows={3} maxLength={REASON_MAX} placeholder="Ví dụ: Hội trường bận sửa chữa" {...register('reason')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}
