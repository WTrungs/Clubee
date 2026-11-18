import { UserPlus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { SearchInput } from '@/shared/ui/ListControls'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { DUES_NAME_MAX } from '../viewModel/duesSchemas'
import { useOpenDuesViewModel, type OpenDuesViewModel } from '../viewModel/useOpenDuesViewModel'

const CANDIDATE_LIMIT = 20

function ExemptionRows({ vm }: { vm: OpenDuesViewModel }) {
  const { register, formState, control } = vm.form
  const rows = useWatch({ control, name: 'exemptions' })
  if (vm.exemptions.length === 0) return <p className="text-sm text-muted-foreground">Chưa chọn ai. Mọi người trong danh sách đóng đủ mức.</p>
  return (
    <ul className="space-y-3" aria-label="Người được miễn giảm">
      {vm.exemptions.map((row, index) => {
        const errors = formState.errors.exemptions?.[index]
        return (
          <li key={row.key} className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold">{row.fullName}</p>
              <Button variant="ghost" size="sm" onClick={() => vm.removeExemption(index)} aria-label={`Bỏ miễn giảm cho ${row.fullName}`}>
                <X aria-hidden />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Hình thức" required>
                <NativeSelect {...register(`exemptions.${index}.kind`)}>
                  <option value="EXEMPT">Miễn toàn bộ</option>
                  <option value="REDUCED">Giảm còn</option>
                </NativeSelect>
              </FormField>
              {rows[index]?.kind === 'REDUCED' && (
                <FormField label="Mức sau giảm" required error={errors?.amount?.message}>
                  <MoneyInput {...register(`exemptions.${index}.amount`)} />
                </FormField>
              )}
            </div>
            <FormField label="Lý do" required error={errors?.reason?.message}>
              <Textarea rows={2} {...register(`exemptions.${index}.reason`)} />
            </FormField>
          </li>
        )
      })}
    </ul>
  )
}

function OpenDuesForm({ onClose, onOpened, onPendingChange }: { onClose: () => void; onOpened: (id: string) => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useOpenDuesViewModel(onOpened)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])
  return (
    <SheetContent
      title="Mở đợt đóng quỹ"
      description="Danh sách gồm thành viên Thử việc và Chính thức lúc mở đợt. Người phải đóng được báo kỳ, mức và hạn nộp."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Mở đợt
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        <FormField label="Tên kỳ" required error={errors.name?.message} hint="Ví dụ: Quỹ học kỳ 2, Quỹ tháng 12.">
          <Input maxLength={DUES_NAME_MAX} {...register('name')} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Mức đóng mỗi người" required error={errors.amount?.message}>
            <MoneyInput {...register('amount')} />
          </FormField>
          <FormField label="Hạn nộp" required error={errors.dueDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" {...register('dueDate')} />
          </FormField>
        </div>
        <section className="space-y-3" aria-label="Miễn giảm">
          <h3 className="text-sm font-semibold">Miễn giảm</h3>
          <ExemptionRows vm={vm} />
          <SearchInput label="Tìm thành viên để miễn giảm" placeholder="Tìm theo tên…" value={vm.keyword} onValueChange={vm.setKeyword} />
          {vm.candidatesError && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl bg-status-danger-soft p-3 text-sm sm:flex-row sm:items-center">
              <p className="flex-1 text-status-danger">Không tải được danh sách thành viên: {vm.candidatesError}</p>
              <Button variant="outline" size="sm" onClick={vm.retryCandidates} className="self-start sm:self-auto">
                Thử lại
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Hiện tối đa {CANDIDATE_LIMIT} người, gõ tên để tìm thêm.</p>
          <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border" aria-label="Thành viên phải đóng">
            {vm.candidates.slice(0, CANDIDATE_LIMIT).map((candidate) => (
              <li key={candidate.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{candidate.fullName}</span>
                  {candidate.departmentName && <span className="block truncate text-xs text-muted-foreground">{candidate.departmentName}</span>}
                </span>
                <Button variant="outline" size="sm" onClick={() => vm.addExemption(candidate)} aria-label={`Miễn giảm cho ${candidate.fullName}`}>
                  <UserPlus aria-hidden />
                  Chọn
                </Button>
              </li>
            ))}
            {!vm.candidatesLoading && !vm.candidatesError && vm.candidates.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Không còn ai phù hợp.</li>}
          </ul>
        </section>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-FIN-09: Thủ quỹ mở đợt đóng quỹ. */
export function OpenDuesSheet({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (campaignId: string) => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <OpenDuesForm onClose={onClose} onOpened={onOpened} onPendingChange={setPending} />}
    </Sheet>
  )
}
