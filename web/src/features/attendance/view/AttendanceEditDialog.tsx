import { useId, useState } from 'react'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { toneVariants } from '@/shared/ui/tone'
import type { AttendanceStatus } from '../model/attendanceTypes'
import { ATTENDANCE_STATUSES, attendanceStatusDisplay } from '../viewModel/attendanceDisplay'
import type { AttendanceViewModel, EditTarget } from '../viewModel/useAttendanceViewModel'

/** Nội dung hộp sửa; dựng lại mỗi lần mở một người để ô chọn và lý do bắt đầu từ trạng thái hiện tại. */
function EditForm({ target, vm }: { target: EditTarget; vm: AttendanceViewModel }) {
  const formId = useId()
  const current = target.record?.status ?? null
  const [status, setStatus] = useState<AttendanceStatus | null>(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const trimmed = reason.trim()
  const statusError = touched && status === null ? 'Chọn trạng thái mới.' : undefined
  const reasonError = touched && trimmed.length < REASON_MIN ? `Vui lòng nhập ít nhất ${REASON_MIN} ký tự.` : undefined

  return (
    <DialogContent
      title={`Sửa điểm danh: ${target.fullName}`}
      description={current ? `Đang ghi ${attendanceStatusDisplay[current].label}. Lần sửa được lưu vào lịch sử và báo cho người này.` : 'Người này chưa có bản ghi. Lần ghi được lưu vào lịch sử và báo cho người này.'}
      footer={
        <>
          <Button variant="ghost" onClick={vm.closeEdit} disabled={vm.editPending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.editPending}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setTouched(true)
          if (status !== null && trimmed.length >= REASON_MIN) vm.submitEdit(status, trimmed)
        }}
      >
        <FormField label="Trạng thái mới" required error={statusError}>
          <div role="radiogroup" aria-label="Trạng thái mới" className="grid grid-cols-2 gap-2">
            {ATTENDANCE_STATUSES.map((option) => {
              const display = attendanceStatusDisplay[option]
              const selected = status === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={option === current}
                  onClick={() => setStatus(option)}
                  className={cn(
                    'h-11 rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                    selected ? cn(toneVariants({ tone: display.tone }), 'border-transparent') : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {display.label}
                </button>
              )
            })}
          </div>
        </FormField>
        <FormField label="Lý do sửa" required error={reasonError}>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Ví dụ: Đối chiếu danh sách ký tên giấy."
            maxLength={REASON_MAX}
          />
        </FormField>
        <FormAlert message={vm.editError} />
      </form>
    </DialogContent>
  )
}

/** FR-ATT-08, BR-ATT-04: sửa một người sau khi chốt, bắt buộc lý do. */
export function AttendanceEditDialog({ vm }: { vm: AttendanceViewModel }) {
  const target = vm.editTarget
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && vm.closeEdit()}>
      {target && <EditForm key={target.userId} target={target} vm={vm} />}
    </Dialog>
  )
}
