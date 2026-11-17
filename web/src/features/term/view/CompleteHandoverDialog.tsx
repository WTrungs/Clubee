import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import type { Handover } from '../model/handoverTypes'
import { useCompleteHandoverViewModel } from '../viewModel/useCompleteHandoverViewModel'

type CompleteVm = ReturnType<typeof useCompleteHandoverViewModel>

function Body({ vm }: { vm: CompleteVm }) {
  if (vm.completedBy) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        Phiên bàn giao đã được {vm.completedBy} hoàn tất. Xem nhiệm kỳ mới ở trang Nhiệm kỳ.
      </p>
    )
  }
  if (vm.blockers.length > 0) {
    return (
      <section aria-labelledby="complete-blockers-title" className="space-y-2">
        <h3 id="complete-blockers-title" className="text-sm font-semibold">
          Chưa hoàn tất được
        </h3>
        <ul className="space-y-2">
          {vm.blockers.map((blocker, index) => (
            <li key={`${index}-${blocker}`} className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {blocker}
            </li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <section aria-labelledby="complete-summary-title" className="space-y-2">
      <h3 id="complete-summary-title" className="text-sm font-semibold">
        Những gì sẽ thay đổi
      </h3>
      <ul className="space-y-2">
        {vm.summary.map((line, index) => (
          <li key={`${index}-${line}`} className="flex items-start gap-2 text-sm">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-success" />
            {line}
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Ai không được bầu lại sẽ mất quyền ban chủ nhiệm ngay khi hoàn tất.</p>
    </section>
  )
}

function CompleteForm({ handover, onClose, onPendingChange }: { handover: Handover; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const vm = useCompleteHandoverViewModel(handover, onClose)
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])
  return (
    <DialogContent
      title="Hoàn tất bàn giao"
      description={vm.completedBy ? `${handover.toTerm.name} đã bắt đầu.` : 'Sau bước này nhiệm kỳ cũ đóng, ban chủ nhiệm mới nhận quyền ngay. Không hoàn tác được.'}
      footer={
        vm.completedBy ? (
          <Button onClick={vm.goToTerms}>Về trang Nhiệm kỳ</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button loading={vm.pending} disabled={!vm.canSubmit || vm.conflict} onClick={vm.submit}>
              Hoàn tất bàn giao
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <ConflictBanner show={vm.conflict} onReload={vm.reset} message="Phiên bàn giao vừa thay đổi (có lượt xác nhận hoặc sửa kết quả bầu). Đã tải bản mới; xem lại tóm tắt rồi hoàn tất." />
        <Body vm={vm} />
        <FormAlert message={vm.errorMessage} />
      </div>
    </DialogContent>
  )
}

/** FR-TERM-06: hộp xác nhận hoàn tất, tóm tắt những gì máy chủ sẽ áp dụng hoặc lý do chưa hoàn tất được. */
export function CompleteHandoverDialog({ handover, open, onClose }: { handover: Handover | null; open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <Dialog open={open && handover !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && handover && <CompleteForm handover={handover} onClose={onClose} onPendingChange={setPending} />}
    </Dialog>
  )
}
