import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { Term } from '../model/termTypes'
import { TERM_NAME_MAX } from '../viewModel/termSchemas'
import { useTermFormViewModel } from '../viewModel/useTermFormViewModel'
import type { TermFormState } from '../viewModel/useTermsPageViewModel'

function TermForm({ editing, clubName, onClose, onPendingChange }: { editing: Term | null; clubName: string; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useTermFormViewModel(editing, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title={editing ? `Sửa ${editing.name}` : 'Khai báo nhiệm kỳ mới'}
      description={
        editing
          ? `CLB hiện hành: ${clubName}.`
          : `CLB hiện hành: ${clubName}. Nhiệm kỳ mới ở trạng thái Chuẩn bị và chép danh sách ban hiện tại làm kế hoạch để sửa.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            {editing ? 'Lưu thay đổi' : 'Khai báo'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Tên nhiệm kỳ" required error={errors.name?.message}>
          <Input placeholder="Ví dụ: Nhiệm kỳ 2027–2028" maxLength={TERM_NAME_MAX} {...register('name')} />
        </FormField>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Ngày bắt đầu dự kiến" required error={errors.startDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('startDate')} />
          </FormField>
          <FormField label="Ngày kết thúc" required error={errors.endDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('endDate')} />
          </FormField>
        </div>
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Nhiệm kỳ đang chạy vẫn giữ nguyên cho tới khi bàn giao hoàn tất. Ngày bắt đầu thật là ngày hoàn tất bàn giao.
        </p>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-TERM-01: khai báo nhiệm kỳ mới hoặc sửa tên, ngày của nhiệm kỳ Chuẩn bị. */
export function TermFormSheet({ state, clubName, onClose }: { state: TermFormState; clubName: string; onClose: () => void }) {
  const editing = state?.mode === 'edit' ? state.term : null
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {state && <TermForm key={editing?.id ?? 'new'} editing={editing} clubName={clubName} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
