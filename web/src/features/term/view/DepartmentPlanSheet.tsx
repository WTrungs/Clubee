import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Controller } from 'react-hook-form'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Switch } from '@/shared/ui/Switch'
import type { Term } from '../model/termTypes'
import { planEntryKind, planEntryKindDisplay } from '../viewModel/termDisplay'
import { PLAN_DESCRIPTION_MAX, PLAN_NAME_MAX } from '../viewModel/termSchemas'
import { useDepartmentPlanViewModel } from '../viewModel/useDepartmentPlanViewModel'

type PlanVm = ReturnType<typeof useDepartmentPlanViewModel>

function PlanRow({ vm, index }: { vm: PlanVm; index: number }) {
  const switchId = useId()
  const { register, control, formState, watch } = vm.form
  const row = vm.rows[index]
  const entry = watch(`entries.${index}`)
  const server = vm.serverEntry(row?.departmentId ?? null)
  const errors = formState.errors.entries?.[index]
  if (!row || !entry) return null
  const isNew = entry.departmentId === null
  const kind = planEntryKind({ ...entry, currentName: server?.currentName ?? null })
  const blocked = server?.dropBlockedReason ?? null
  const dropError = errors?.dropped?.message
  const describedBy = [blocked ? `${switchId}-blocked` : null, dropError ? `${switchId}-error` : null].filter(Boolean).join(' ') || undefined
  const title = isNew ? `Ban mới ${index + 1}` : (server?.currentName ?? entry.name)

  return (
    <li className={cn('space-y-4 rounded-2xl border bg-card p-4', entry.dropped && 'bg-muted/60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{title}</p>
          {!isNew && <p className="text-xs text-muted-foreground">{server ? `${server.memberCount} thành viên` : ''}</p>}
        </div>
        <Badge tone={planEntryKindDisplay[kind].tone}>{planEntryKindDisplay[kind].label}</Badge>
      </div>

      {!entry.dropped && (
        <div className="space-y-4">
          <FormField label="Tên ban" required error={errors?.name?.message}>
            <Input maxLength={PLAN_NAME_MAX} {...register(`entries.${index}.name`)} />
          </FormField>
          <FormField label="Mô tả" error={errors?.description?.message}>
            <Textarea rows={2} maxLength={PLAN_DESCRIPTION_MAX} {...register(`entries.${index}.description`)} />
          </FormField>
        </div>
      )}

      {isNew ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => vm.removeEntry(index)} className="text-destructive">
          <Trash2 aria-hidden />
          Bỏ dòng này
        </Button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={switchId} className="text-sm leading-snug">
              <span className="font-semibold">Bỏ ban khi bàn giao xong</span>
              <span className="block text-xs text-muted-foreground">Ban chuyển Đã đóng, không xóa, vẫn tra cứu được.</span>
            </label>
            <Controller
              control={control}
              name={`entries.${index}.dropped`}
              render={({ field }) => (
                <Switch
                  id={switchId}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={blocked !== null && !field.value}
                  aria-describedby={describedBy}
                  className="mt-0.5 cursor-pointer"
                />
              )}
            />
          </div>
          {blocked && (
            <p id={`${switchId}-blocked`} className="text-xs text-muted-foreground">
              {blocked}
            </p>
          )}
          {dropError && (
            <p id={`${switchId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {dropError}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function PlanForm({ term, onClose, onPendingChange }: { term: Term; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useDepartmentPlanViewModel(term, onClose)
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Kế hoạch ban"
      description={`${term.name}. Kế hoạch chỉ áp dụng khi bàn giao hoàn tất; cơ cấu đang chạy chưa đổi.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict}>
            Lưu kế hoạch
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Nhiệm kỳ vừa được người khác sửa. Tải lại để xem kế hoạch mới nhất rồi sửa lại." />
        <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
          {vm.summary}
        </p>
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
          <ul aria-label="Các ban trong kế hoạch" className="space-y-3">
            {vm.rows.map((row, index) => (
              <PlanRow key={row.id} vm={vm} index={index} />
            ))}
          </ul>
          {vm.canAdd && (
            <Button type="button" variant="outline" onClick={vm.addEntry} className="w-full">
              <Plus aria-hidden />
              Thêm ban mới
            </Button>
          )}
          <FormAlert message={vm.errorMessage} />
        </form>
      </div>
    </SheetContent>
  )
}

/** FR-TERM-01: sửa kế hoạch ban (giữ, đổi tên, thêm, bỏ) của nhiệm kỳ Chuẩn bị. */
export function DepartmentPlanSheet({ term, onClose }: { term: Term | null; onClose: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={term !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {term && <PlanForm key={term.id} term={term} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}
