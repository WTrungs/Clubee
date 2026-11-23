import { Info } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { SessionDetail } from '../model/sessionTypes'
import { sessionScopeLabel, seriesLabel } from '../viewModel/sessionDisplay'
import { useSessionEditViewModel } from '../viewModel/useSessionEditViewModel'
import { SessionFormFields } from './SessionFormFields'

interface SessionEditSheetProps {
  clubId: string
  session: SessionDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionEditSheet({ clubId, session, open, onOpenChange }: SessionEditSheetProps) {
  const formId = useId()
  const vm = useSessionEditViewModel(clubId, session, () => onOpenChange(false))
  const close = () => {
    vm.reset()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (vm.pending) return
        if (!next) vm.reset()
        onOpenChange(next)
      }}
    >
      <SheetContent
        title="Sửa buổi sinh hoạt"
        description={`Phạm vi: ${sessionScopeLabel(session.scope)}. Đổi giờ hoặc địa điểm thì thành viên trong phạm vi được báo.`}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <div className="space-y-5 p-5">
          {session.series && (
            <p role="note" className="flex items-start gap-2 rounded-xl bg-status-info-soft p-3 text-sm text-status-info">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Chỉ sửa buổi này ({seriesLabel(session.series)} của chuỗi). Các buổi khác trong chuỗi giữ nguyên.</span>
            </p>
          )}
          <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Buổi vừa được người khác sửa. Tải lại để xem bản mới nhất rồi sửa lại." />
          <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
            <SessionFormFields form={vm.form} />
            <FormAlert message={vm.errorMessage} />
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
