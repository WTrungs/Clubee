import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Controller } from 'react-hook-form'
import {
  RECRUITMENT_DESCRIPTION_MAX,
  RECRUITMENT_JUDGES_MAX,
  RECRUITMENT_NAME_MAX,
  RECRUITMENT_QUESTION_MAX,
  RECRUITMENT_QUESTIONS_MAX,
  RECRUITMENT_ROUND_NAME_MAX,
  RECRUITMENT_ROUNDS_MAX,
} from '@/shared/lib/recruitmentRules'
import { Button } from '@/shared/ui/Button'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { RecruitmentDetail } from '../model/recruitmentTypes'
import { EMPTY_QUESTION, EMPTY_ROUND } from '../viewModel/recruitmentFormSchema'
import { useRecruitmentFormViewModel, type RecruitmentFormViewModel } from '../viewModel/useRecruitmentViewModels'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-bold">{title}</legend>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  )
}

function RowError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  ) : null
}

function QuotaRows({ vm }: { vm: RecruitmentFormViewModel }) {
  const { register, formState } = vm.form
  const errors = formState.errors.quotas
  return (
    <Section title="Chỉ tiêu theo ban" hint="Ứng viên chỉ chọn nguyện vọng trong các ban có chỉ tiêu.">
      <ul className="space-y-3">
        {vm.quotas.fields.map((field, index) => (
          <li key={field.id} className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2">
              <FormField label={`Ban ${index + 1}`}>
                <NativeSelect {...register(`quotas.${index}.departmentId`)}>
                  <option value="">Chọn ban</option>
                  {vm.departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Chỉ tiêu">
                <Input inputMode="numeric" maxLength={3} {...register(`quotas.${index}.quota`)} />
              </FormField>
              <Button type="button" variant="ghost" size="icon" aria-label={`Bỏ dòng chỉ tiêu ${index + 1}`} disabled={vm.quotas.fields.length === 1} onClick={() => vm.quotas.remove(index)}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            <RowError message={errors?.[index]?.departmentId?.message ?? errors?.[index]?.quota?.message} />
          </li>
        ))}
      </ul>
      <RowError message={errors?.message ?? errors?.root?.message} />
      <Button type="button" variant="outline" size="sm" disabled={vm.quotas.fields.length >= vm.departmentOptions.length} onClick={() => vm.quotas.append({ departmentId: '', quota: '' })}>
        <Plus aria-hidden />
        Thêm ban
      </Button>
    </Section>
  )
}

function RoundRows({ vm }: { vm: RecruitmentFormViewModel }) {
  const { register, formState } = vm.form
  const errors = formState.errors.rounds
  return (
    <Section title="Các vòng" hint={vm.locked ? 'Đợt đã mở nên không đổi được các vòng.' : 'Đơn qua hết các vòng theo thứ tự mới vào xét kết quả.'}>
      <ol className="space-y-3">
        {vm.rounds.fields.map((field, index) => (
          <li key={field.id} className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <FormField label={`Vòng ${index + 1}`}>
                <Input maxLength={RECRUITMENT_ROUND_NAME_MAX} disabled={vm.locked} {...register(`rounds.${index}.name`)} />
              </FormField>
              <Button type="button" variant="ghost" size="icon" aria-label={`Bỏ vòng ${index + 1}`} disabled={vm.locked || vm.rounds.fields.length === 1} onClick={() => vm.rounds.remove(index)}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            <RowError message={errors?.[index]?.name?.message} />
          </li>
        ))}
      </ol>
      <RowError message={errors?.message ?? errors?.root?.message} />
      {!vm.locked && (
        <Button type="button" variant="outline" size="sm" disabled={vm.rounds.fields.length >= RECRUITMENT_ROUNDS_MAX} onClick={() => vm.rounds.append(EMPTY_ROUND)}>
          <Plus aria-hidden />
          Thêm vòng
        </Button>
      )}
    </Section>
  )
}

function QuestionRows({ vm }: { vm: RecruitmentFormViewModel }) {
  const { register, formState } = vm.form
  const errors = formState.errors.questions
  return (
    <Section title="Câu hỏi trong đơn" hint={vm.locked ? 'Đợt đã mở nên không đổi được câu hỏi.' : `Tối đa ${RECRUITMENT_QUESTIONS_MAX} câu.`}>
      {vm.questions.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có câu hỏi nào; đơn chỉ gồm nguyện vọng ban.</p>}
      <ol className="space-y-3">
        {vm.questions.fields.map((field, index) => (
          <li key={field.id} className="space-y-2 rounded-xl border p-3">
            <FormField label={`Câu ${index + 1}`} error={errors?.[index]?.text?.message}>
              <Textarea rows={2} maxLength={RECRUITMENT_QUESTION_MAX} disabled={vm.locked} {...register(`questions.${index}.text`)} />
            </FormField>
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" disabled={vm.locked} {...register(`questions.${index}.required`)} />
                Bắt buộc trả lời
              </label>
              {!vm.locked && (
                <Button type="button" variant="ghost" size="sm" onClick={() => vm.questions.remove(index)}>
                  <Trash2 aria-hidden />
                  Bỏ câu này
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!vm.locked && (
        <Button type="button" variant="outline" size="sm" disabled={vm.questions.fields.length >= RECRUITMENT_QUESTIONS_MAX} onClick={() => vm.questions.append(EMPTY_QUESTION)}>
          <Plus aria-hidden />
          Thêm câu hỏi
        </Button>
      )}
    </Section>
  )
}

function JudgePicker({ vm }: { vm: RecruitmentFormViewModel }) {
  return (
    <Section title="Giám khảo" hint={`Thành viên Chính thức, tối đa ${RECRUITMENT_JUDGES_MAX} người.`}>
      <Controller
        control={vm.form.control}
        name="judgeIds"
        render={({ field, fieldState }) => (
          <>
            <ul aria-label="Chọn giám khảo" className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-1">
              {vm.judgeOptions.map((candidate) => {
                const checked = field.value.includes(candidate.id)
                return (
                  <li key={candidate.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-primary"
                        checked={checked}
                        disabled={!checked && field.value.length >= RECRUITMENT_JUDGES_MAX}
                        onChange={() => field.onChange(checked ? field.value.filter((id) => id !== candidate.id) : [...field.value, candidate.id])}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{candidate.fullName}</span>
                        {candidate.note ? (
                          <span className="block truncate text-xs font-medium text-status-warning">{candidate.note}</span>
                        ) : (
                          candidate.departmentName && <span className="block truncate text-xs text-muted-foreground">Ban {candidate.departmentName}</span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <RowError message={fieldState.error?.message} />
          </>
        )}
      />
    </Section>
  )
}

function RecruitmentForm({ editing, onClose, onPendingChange }: { editing: RecruitmentDetail | null; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useRecruitmentFormViewModel(editing, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title={editing ? `Sửa ${editing.name}` : 'Mở đợt tuyển'}
      description={vm.locked ? 'Đợt đã mở: chỉ sửa được tên, mô tả, giờ đóng (chỉ lùi), chỉ tiêu và giám khảo.' : 'Khai báo thời gian, chỉ tiêu theo ban, các vòng, câu hỏi và giám khảo.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            {editing ? 'Lưu thay đổi' : 'Mở đợt tuyển'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-6 p-5">
        <Section title="Thông tin">
          <FormField label="Tên đợt tuyển" required error={errors.name?.message}>
            <Input placeholder="Ví dụ: Tuyển thành viên học kỳ 1" maxLength={RECRUITMENT_NAME_MAX} {...register('name')} />
          </FormField>
          <FormField label="Mô tả" error={errors.description?.message}>
            <Textarea maxLength={RECRUITMENT_DESCRIPTION_MAX} {...register('description')} />
          </FormField>
        </Section>
        <Section title="Thời gian nhận đơn">
          {vm.locked ? (
            <p className="text-sm text-muted-foreground">
              Đã mở lúc {vm.form.getValues('opensTime')} ngày {vm.form.getValues('opensDate')}.
            </p>
          ) : (
            <DateTimeRow label="Mở" date={register('opensDate')} time={register('opensTime')} error={errors.opensDate?.message ?? errors.opensTime?.message} />
          )}
          <DateTimeRow label="Đóng" date={register('closesDate')} time={register('closesTime')} error={errors.closesDate?.message ?? errors.closesTime?.message} />
        </Section>
        <QuotaRows vm={vm} />
        <RoundRows vm={vm} />
        <QuestionRows vm={vm} />
        <JudgePicker vm={vm} />
        <FormAlert message={vm.optionsError ? 'Chưa tải được danh sách ban hoặc giám khảo. Đóng rồi mở lại để thử lại.' : vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-REC-01: mở đợt tuyển hoặc sửa đợt chưa chốt kết quả. */
export function RecruitmentFormSheet({ open, editing, onClose }: { open: boolean; editing: RecruitmentDetail | null; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <RecruitmentForm key={editing?.id ?? 'new'} editing={editing} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
