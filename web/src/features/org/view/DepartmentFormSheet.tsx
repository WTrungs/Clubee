import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { Department } from '../model/orgTypes'
import { DEPARTMENT_DESCRIPTION_MAX, DEPARTMENT_NAME_MAX } from '../viewModel/departmentSchema'
import { useDepartmentFormViewModel } from '../viewModel/useDepartmentFormViewModel'

function DepartmentForm({ editing, clubName, onClose, onPendingChange }: { editing: Department | null; clubName: string; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useDepartmentFormViewModel(editing, onClose)
  const { register, formState } = vm.form
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title={editing ? `Sửa ban ${editing.name}` : 'Thêm ban chuyên môn'}
      description={`CLB hiện hành: ${clubName}. Ban thuộc nhiệm kỳ đang chạy.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            {editing ? 'Lưu thay đổi' : 'Thêm ban'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Tên ban" required error={formState.errors.name?.message}>
          <Input placeholder="Ví dụ: Đối ngoại" maxLength={DEPARTMENT_NAME_MAX} {...register('name')} />
        </FormField>
        <FormField label="Mô tả" error={formState.errors.description?.message} hint="Nhiệm vụ chính của ban, giúp thành viên mới chọn ban.">
          <Textarea maxLength={DEPARTMENT_DESCRIPTION_MAX} {...register('description')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

interface DepartmentFormSheetProps {
  state: { mode: 'create' } | { mode: 'edit'; department: Department } | null
  clubName: string
  onClose: () => void
}

/** FR-ORG-01: khai báo ban mới hoặc sửa tên, mô tả ban đang hoạt động. */
export function DepartmentFormSheet({ state, clubName, onClose }: DepartmentFormSheetProps) {
  const editing = state?.mode === 'edit' ? state.department : null
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {state && <DepartmentForm key={editing?.id ?? 'new'} editing={editing} clubName={clubName} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
