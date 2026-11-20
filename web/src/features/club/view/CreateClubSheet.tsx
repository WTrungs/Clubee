import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { CLUB_DESCRIPTION_MAX, CLUB_FIELD_MAX, CLUB_FIELD_SUGGESTIONS, CLUB_NAME_MAX, CLUB_SHORT_NAME_MAX } from '../viewModel/clubSchemas'
import { useCreateClubViewModel } from '../viewModel/useCreateClubViewModel'

function CreateClubForm({ onClose, onPendingChange }: { onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const fieldListId = useId()
  const vm = useCreateClubViewModel(onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Tạo CLB"
      description="Bạn sẽ là thành viên Chính thức và Chủ nhiệm. Nhiệm kỳ đầu tiên bắt đầu từ hôm nay, kéo dài 12 tháng."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Tạo CLB
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Tên CLB" required error={errors.name?.message}>
          <Input placeholder="Ví dụ: CLB Nhiếp ảnh Sinh viên" maxLength={CLUB_NAME_MAX} {...register('name')} />
        </FormField>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Tên viết tắt" required error={errors.shortName?.message} hint="2–10 ký tự, hiện trên biểu tượng CLB.">
            <Input placeholder="Ví dụ: NASV" maxLength={CLUB_SHORT_NAME_MAX} {...register('shortName')} />
          </FormField>
          <FormField label="Lĩnh vực" required error={errors.field?.message} hint="Chọn gợi ý hoặc tự nhập.">
            <Input list={fieldListId} placeholder="Ví dụ: Nghệ thuật" maxLength={CLUB_FIELD_MAX} {...register('field')} />
          </FormField>
          <datalist id={fieldListId}>
            {CLUB_FIELD_SUGGESTIONS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </datalist>
        </div>
        <FormField label="Mô tả" required error={errors.description?.message} hint="Hiện công khai ở danh bạ CLB.">
          <Textarea rows={5} maxLength={CLUB_DESCRIPTION_MAX} {...register('description')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-CLB-01: ai có tài khoản cũng tạo được CLB. */
export function CreateClubSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <CreateClubForm onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
