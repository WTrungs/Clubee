import { useEffect, useId, useState } from 'react'
import { formatDate } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import type { Position } from '../model/orgTypes'
import { useRevokePositionViewModel } from '../viewModel/useRevokePositionViewModel'

function RevokeForm({ position, onClose, onPendingChange }: { position: Position; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useRevokePositionViewModel(position, onClose)
  const { register, formState } = vm.form
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <DialogContent
      title="Thu hồi chức vụ"
      description={`${vm.title} của ${vm.holderName} hết hiệu lực từ ngày chuyển giao. Bản ghi được giữ lại trong lịch sử.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} variant="destructive" loading={vm.pending}>
            Thu hồi
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
        <FormField label="Lý do" required error={formState.errors.reason?.message}>
          <Textarea rows={3} maxLength={500} {...register('reason')} />
        </FormField>
        <FormField
          label="Ngày chuyển giao"
          required
          error={formState.errors.handoverDate?.message}
          hint={
            vm.upcomingFrom
              ? `Chức vụ chưa bắt đầu (từ ${formatDate(vm.upcomingFrom)}); chọn ngày chuyển giao không muộn hơn ngày này thì chức vụ bị hủy hẳn.${vm.lastDay ? ` Muộn nhất ${formatDate(vm.lastDay)}.` : ''}`
              : vm.lastDay
                ? `Từ hôm nay đến ${formatDate(vm.lastDay)}.`
                : vm.untilHandover
                  ? 'Từ hôm nay trở đi; chức vụ này còn hiệu lực tới khi bàn giao nhiệm kỳ xong.'
                  : 'Từ hôm nay trở đi.'
          }
        >
          <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('handoverDate')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </DialogContent>
  )
}

/** FR-ORG-03: kết thúc chức vụ trước hạn kèm lý do và ngày chuyển giao. */
export function RevokePositionDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {position && <RevokeForm key={position.id} position={position} onClose={onClose} onPendingChange={setPending} />}
    </Dialog>
  )
}
