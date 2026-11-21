import { CalendarClock } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { REASON_MAX } from '@/shared/lib/reasonRules'
import { TERM_EXTENSION_MAX_DAYS } from '@/shared/lib/termExtensionRules'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import type { Term } from '../model/termTypes'
import { useExtendTermViewModel } from '../viewModel/useExtendTermViewModel'

function ExtendForm({ term, onClose, onPendingChange }: { term: Term; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useExtendTermViewModel(term, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <DialogContent
      title={`Gia hạn ${term.name}`}
      description={`Đang kết thúc ngày ${vm.currentEndText}. Mỗi lần dời tối đa ${TERM_EXTENSION_MAX_DAYS} ngày.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Gia hạn
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
        <FormField label="Ngày kết thúc mới" required error={errors.endDate?.message}>
          <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('endDate')} />
        </FormField>
        <p role="status" className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {vm.preview}
        </p>
        <FormField label="Lý do gia hạn" required error={errors.reason?.message}>
          <Textarea placeholder="Ví dụ: Lùi đại hội bầu ban chủ nhiệm vì trùng lịch thi." maxLength={REASON_MAX} {...register('reason')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
      </form>
    </DialogContent>
  )
}

/** FR-TERM-02: dời ngày kết thúc của nhiệm kỳ đang chạy, kèm lý do. */
export function ExtendTermDialog({ term, onClose }: { term: Term | null; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Dialog open={term !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {term && <ExtendForm key={term.id} term={term} onClose={onClose} onPendingChange={setPending} />}
    </Dialog>
  )
}
