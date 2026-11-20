import { useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { selectableLead } from '../viewModel/eventDisplay'
import type { EventDetailViewModel } from '../viewModel/useEventDetailViewModel'

function ApproveForm({ vm }: { vm: EventDetailViewModel }) {
  const formId = useId()
  const proposer = vm.event?.proposer
  const [leadUserId, setLeadUserId] = useState(proposer?.id ?? '')
  const selected = selectableLead(vm.leadCandidates, leadUserId)
  const proposerEligible = vm.leadCandidates.some((candidate) => candidate.id === proposer?.id)
  const hint = vm.leadCandidatesLoading || vm.leadCandidatesError || proposerEligible ? undefined : 'Người đề xuất không còn đủ điều kiện, hãy chọn người khác.'

  return (
    <DialogContent
      title="Duyệt đề xuất"
      description="Sự kiện chuyển sang Đã duyệt. Người đề xuất mặc định làm Trưởng BTC; nếu không đủ điều kiện, chọn người khác."
      footer={
        <>
          <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.transitionPending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.transitionPending} disabled={vm.leadCandidatesLoading || selected === ''}>
            Duyệt sự kiện
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (selected) vm.confirmTransition({ leadUserId: selected })
        }}
      >
        <FormField label="Trưởng BTC" required hint={hint} error={vm.leadCandidatesError ?? undefined}>
          <NativeSelect value={selected} onChange={(event) => setLeadUserId(event.target.value)} disabled={vm.leadCandidatesLoading || vm.transitionPending}>
            <option value="">{vm.leadCandidatesLoading ? 'Đang tải…' : 'Chọn Trưởng BTC…'}</option>
            {vm.leadCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
                {candidate.id === proposer?.id ? ' (người đề xuất)' : candidate.departmentName ? ` · Ban ${candidate.departmentName}` : ''}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </form>
    </DialogContent>
  )
}

/** Hộp thoại chuyển trạng thái: duyệt (FR-EVT-03), từ chối và hủy bắt buộc lý do (FR-EVT-03, 15), đóng sự kiện (FR-EVT-16). */
export function EventTransitionDialogs({ vm }: { vm: EventDetailViewModel }) {
  return (
    <>
      <Dialog open={vm.dialog === 'APPROVE'} onOpenChange={(open) => !open && vm.closeDialog()}>
        {vm.dialog === 'APPROVE' && <ApproveForm vm={vm} />}
      </Dialog>
      <ReasonDialog
        open={vm.dialog === 'REJECT'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Từ chối đề xuất"
        description="Đề xuất quay về Dự thảo. Người đề xuất sẽ thấy lý do để chỉnh sửa và gửi lại."
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={vm.transitionPending}
        onConfirm={(reason) => vm.confirmTransition({ reason })}
      />
      <ReasonDialog
        open={vm.dialog === 'CANCEL'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Hủy sự kiện"
        description="Đã hủy là điểm cuối, không khôi phục được. Người đăng ký và BTC sẽ được thông báo; danh sách vẫn được giữ."
        label="Lý do hủy"
        confirmLabel="Hủy sự kiện"
        confirmVariant="destructive"
        pending={vm.transitionPending}
        onConfirm={(reason) => vm.confirmTransition({ reason })}
      />
      <ConfirmDialog
        open={vm.dialog === 'CLOSE'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Đóng sự kiện"
        description="Mọi chức vụ trong sự kiện hết hiệu lực và hồ sơ sự kiện chuyển sang chỉ đọc. Đã đóng thì không mở lại được."
        confirmLabel="Đóng sự kiện"
        pending={vm.transitionPending}
        onConfirm={() => vm.confirmTransition({})}
      />
    </>
  )
}
