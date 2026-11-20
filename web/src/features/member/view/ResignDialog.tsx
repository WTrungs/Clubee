import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { Textarea } from '@/shared/ui/Input'
import { Spinner } from '@/shared/ui/Spinner'
import type { ResignBlocker } from '../model/memberTypes'
import { resignBlockerGroups, resignBlockerLink } from '../viewModel/memberDisplay'

interface ResignFormProps {
  clubName: string
  blockers: ResignBlocker[]
  /** Đang tải lại khoản còn tồn từ máy chủ; danh sách đang hiện có thể đã cũ. */
  checking: boolean
  pending: boolean
  errorMessage: string | null
  onClose: () => void
  onConfirm: (reason: string) => void
}

function BlockerList({ blockers }: { blockers: ResignBlocker[] }) {
  return (
    <div className="space-y-4">
      {resignBlockerGroups.map((group) => {
        const items = blockers.filter((blocker) => blocker.kind === group.kind)
        if (items.length === 0) return null
        return (
          <section key={group.kind} className="space-y-1.5">
            <h3 className="text-sm font-semibold">
              {group.label} ({items.length})
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {items.map((blocker) => {
                const link = resignBlockerLink(blocker)
                return (
                  <li key={`${blocker.kind}-${blocker.refId}`}>
                    {link ? (
                      <Link to={link} className="text-primary underline-offset-2 hover:underline">
                        {blocker.title}
                      </Link>
                    ) : (
                      blocker.title
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function ResignForm({ clubName, blockers, checking, pending, errorMessage, onClose, onConfirm }: ResignFormProps) {
  const formId = useId()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const trimmed = reason.trim()
  const blocked = blockers.length > 0
  const reasonError = touched && trimmed.length < REASON_MIN ? `Vui lòng nhập ít nhất ${REASON_MIN} ký tự.` : undefined

  if (checking) {
    return (
      <DialogContent title="Xin rời CLB" description="Đang kiểm tra các khoản bạn còn phụ trách…">
        <div role="status" aria-label="Đang kiểm tra khoản còn tồn" className="flex justify-center py-6">
          <Spinner />
        </div>
      </DialogContent>
    )
  }

  return (
    <DialogContent
      title="Xin rời CLB"
      description={
        blocked
          ? 'Bạn còn các khoản dưới đây nên chưa rời CLB được. Hoàn tất việc, hoặc nhờ ban chủ nhiệm thu hồi chức vụ, giao lại việc rồi thử lại.'
          : `Rời ${clubName} có hiệu lực ngay: bạn không vào được trang CLB nữa và muốn quay lại thì phải gửi yêu cầu gia nhập mới. Lịch sử sinh hoạt vẫn được giữ.`
      }
      footer={
        blocked ? (
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} variant="destructive" loading={pending}>
              Rời CLB
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <div className="space-y-4">
          <BlockerList blockers={blockers} />
          <FormAlert message={errorMessage} />
        </div>
      ) : (
        <form
          id={formId}
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setTouched(true)
            if (trimmed.length >= REASON_MIN) onConfirm(trimmed)
          }}
        >
          <FormField label="Lý do rời" required error={reasonError} hint="Ban chủ nhiệm sẽ thấy lý do này.">
            <Textarea value={reason} maxLength={REASON_MAX} onChange={(event) => setReason(event.target.value)} onBlur={() => setTouched(true)} />
          </FormField>
          <FormAlert message={errorMessage} />
        </form>
      )}
    </DialogContent>
  )
}

interface ResignDialogProps extends Omit<ResignFormProps, 'onClose'> {
  open: boolean
  onClose: () => void
}

/** FR-MEM-07, BR-MEM-03: còn tồn thì liệt kê từng khoản và khóa thao tác; hết tồn thì nhập lý do, rời ngay. */
export function ResignDialog({ open, onClose, ...props }: ResignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !props.pending && onClose()}>
      {open && <ResignForm {...props} onClose={onClose} />}
    </Dialog>
  )
}
