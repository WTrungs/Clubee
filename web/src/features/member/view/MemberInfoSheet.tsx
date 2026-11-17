import { useEffect, useId, useState } from 'react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { MemberDetail } from '../model/memberTypes'
import { DISPLAY_TITLE_MAX, INTERNAL_NOTE_MAX } from '../viewModel/memberInfoSchema'
import { useMemberInfoViewModel } from '../viewModel/useMemberInfoViewModel'

function MemberInfoForm({ member, onClose, onPendingChange }: { member: MemberDetail; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useMemberInfoViewModel(member, onClose)
  const { register, formState, control } = vm.form
  const errors = formState.errors
  const note = useWatch({ control, name: 'internalNote' })
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Sửa thông tin thành viên"
      description={`${member.person.fullName}. Mỗi thay đổi được lưu vào lịch sử chỉnh sửa.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Thông tin thành viên vừa được người khác sửa. Tải lại để xem bản mới nhất rồi sửa lại." />
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
          <FormField
            label="Chức danh hiển thị"
            error={errors.displayTitle?.message}
            hint="Hiện cạnh tên ở danh sách thành viên, ví dụ Trưởng nhóm bè. Không phải chức vụ, không cho thêm quyền."
          >
            <Input maxLength={DISPLAY_TITLE_MAX} {...register('displayTitle')} />
          </FormField>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Ngày gia nhập" required error={errors.joinedOn?.message} hint="Dạng dd/mm/yyyy.">
              <Input placeholder="dd/mm/yyyy" inputMode="numeric" maxLength={10} autoComplete="off" {...register('joinedOn')} />
            </FormField>
            {vm.collectsStudentId && (
              <FormField label="MSSV" error={errors.studentId?.message} hint="5–20 chữ hoặc số.">
                <Input autoComplete="off" maxLength={20} {...register('studentId')} />
              </FormField>
            )}
          </div>
          <FormField
            label="Ghi chú nội bộ"
            error={errors.internalNote?.message}
            hint={`Chỉ ban chủ nhiệm xem được. ${note.length}/${INTERNAL_NOTE_MAX} ký tự.`}
          >
            <Textarea rows={5} maxLength={INTERNAL_NOTE_MAX} {...register('internalNote')} />
          </FormField>
          <FormAlert message={vm.errorMessage} />
        </form>
      </div>
    </SheetContent>
  )
}

/** FR-MEM-05: chỉ mở khi máy chủ trả `EDIT_INFO`. */
export function MemberInfoSheet({ member, open, onClose }: { member: MemberDetail | null; open: boolean; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open && member !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && member && <MemberInfoForm member={member} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
