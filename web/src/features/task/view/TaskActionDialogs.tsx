import { useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FileInput } from '@/shared/ui/FileInput'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import type { TaskTransitionController } from '../viewModel/useTaskTransition'

function SubmitResultForm({ transition }: { transition: TaskTransitionController }) {
  const formId = useId()
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [touched, setTouched] = useState(false)
  const empty = note.trim() === '' && files.length === 0
  const error = touched && empty ? 'Nhập ghi chú hoặc đính kèm ít nhất một tệp kết quả.' : undefined

  return (
    <DialogContent
      title="Nộp kết quả"
      description={`“${transition.dialog?.task.title ?? ''}” sẽ chuyển sang Chờ nghiệm thu.`}
      footer={
        <>
          <Button variant="ghost" onClick={transition.closeDialog} disabled={transition.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={transition.pending}>
            Nộp kết quả
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
          if (!empty) transition.confirmDialog({ note: note.trim(), files })
        }}
      >
        <FormField label="Ghi chú kết quả" error={error} hint="Mô tả ngắn những gì đã làm, đường dẫn sản phẩm nếu có.">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} disabled={transition.pending} />
        </FormField>
        <FileInput files={files} onChange={setFiles} disabled={transition.pending} label="Đính kèm kết quả" />
      </form>
    </DialogContent>
  )
}

function ApproveForm({ transition }: { transition: TaskTransitionController }) {
  const formId = useId()
  const [comment, setComment] = useState('')
  return (
    <DialogContent
      title="Nghiệm thu đạt?"
      description={`“${transition.dialog?.task.title ?? ''}” sẽ chuyển sang Hoàn thành và không mở lại được.`}
      footer={
        <>
          <Button variant="ghost" onClick={transition.closeDialog} disabled={transition.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={transition.pending}>
            Xác nhận đạt
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          transition.confirmDialog({ reason: comment.trim() || undefined })
        }}
      >
        <FormField label="Nhận xét (không bắt buộc)">
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={500} disabled={transition.pending} />
        </FormField>
      </form>
    </DialogContent>
  )
}

/** Hộp thoại cho thao tác cần nhập thêm: nộp kết quả, nghiệm thu, yêu cầu làm lại (FR-TASK-04), hủy việc (FR-TASK-05). */
export function TaskActionDialogs({ transition }: { transition: TaskTransitionController }) {
  const action = transition.dialog?.action
  const dialogKey = transition.dialog ? `${transition.dialog.task.id}-${transition.dialog.action}` : 'closed'

  return (
    <>
      <Dialog open={action === 'SUBMIT' || action === 'APPROVE'} onOpenChange={(open) => !open && transition.closeDialog()}>
        {action === 'SUBMIT' && <SubmitResultForm key={dialogKey} transition={transition} />}
        {action === 'APPROVE' && <ApproveForm key={dialogKey} transition={transition} />}
      </Dialog>
      <ReasonDialog
        open={action === 'REQUEST_CHANGES'}
        onOpenChange={(open) => !open && transition.closeDialog()}
        title="Yêu cầu làm lại"
        description={`“${transition.dialog?.task.title ?? ''}” sẽ quay về Đang làm. Người chính sẽ thấy nhận xét này.`}
        label="Nhận xét"
        placeholder="Cần sửa gì để đạt?"
        confirmLabel="Trả về Đang làm"
        pending={transition.pending}
        onConfirm={(reason) => transition.confirmDialog({ reason })}
      />
      <ReasonDialog
        open={action === 'CANCEL'}
        onOpenChange={(open) => !open && transition.closeDialog()}
        title="Hủy việc"
        description={`“${transition.dialog?.task.title ?? ''}” sẽ chuyển sang Đã hủy và không mở lại được. Người chính và người phối hợp thấy lý do này.`}
        label="Lý do hủy"
        confirmLabel="Hủy việc"
        confirmVariant="destructive"
        pending={transition.pending}
        onConfirm={(reason) => transition.confirmDialog({ reason })}
      />
    </>
  )
}
