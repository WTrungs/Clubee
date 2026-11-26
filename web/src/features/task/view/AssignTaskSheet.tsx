import { Check } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { FilterChip } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { toneVariants } from '@/shared/ui/tone'
import { scopeKeyOf } from '../viewModel/assignTaskSchema'
import { PRIORITIES, taskPriorityDisplay } from '../viewModel/taskDisplay'
import { useAssignTaskViewModel } from '../viewModel/useAssignTaskViewModel'
import { WarningNote } from '@/shared/ui/WarningNote'

const quickDue = [
  { days: 1, label: 'Ngày mai' },
  { days: 3, label: '3 ngày' },
  { days: 7, label: '1 tuần' },
]

interface AssignTaskSheetProps {
  clubId: string
  clubName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** FR-TASK-01: giao việc trong CLB hiện hành; clubId lấy từ route, không cho nhập. */
export function AssignTaskSheet({ clubId, clubName, open, onOpenChange }: AssignTaskSheetProps) {
  const formId = useId()
  const vm = useAssignTaskViewModel(clubId, () => onOpenChange(false))
  const { register, formState } = vm.form
  const errors = formState.errors

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (vm.pending) return
        if (!next) vm.reset()
        onOpenChange(next)
      }}
    >
      <SheetContent
        title="Giao việc"
        description={`CLB hiện hành: ${clubName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending} disabled={!vm.canAssign}>
              Giao việc
            </Button>
          </>
        }
      >
        <div className="p-5">
          {vm.scopesLoading && (
            <div className="space-y-3" role="status" aria-label="Đang tải phạm vi giao việc">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {vm.scopesError && <ErrorState error={vm.scopesError} />}
          {!vm.scopesLoading && !vm.scopesError && (
            <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5">
              <FormField label="Tên việc" required error={errors.title?.message}>
                <Input placeholder="Ví dụ: Thiết kế poster sự kiện" maxLength={200} {...register('title')} />
              </FormField>
              <FormField label="Mô tả" error={errors.description?.message}>
                <Textarea placeholder="Yêu cầu, tiêu chí nghiệm thu…" maxLength={2000} {...register('description')} />
              </FormField>
              <FormField label="Thuộc ban / tiểu ban" required error={errors.scopeKey?.message} hint="Chỉ hiện phạm vi bạn đang phụ trách.">
                <NativeSelect value={vm.scopeKey} onChange={(event) => vm.selectScope(event.target.value)}>
                  <option value="">Chọn phạm vi…</option>
                  {vm.scopes.map((scope) => (
                    <option key={scopeKeyOf(scope)} value={scopeKeyOf(scope)}>
                      {scope.eventName ? `${scope.eventName} · ${scope.name}` : scope.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>

              <FormField label="Người chính" required error={errors.ownerId?.message} hint={vm.members.length === 0 ? 'Chọn phạm vi trước.' : undefined}>
                <NativeSelect value={vm.ownerId} onChange={(event) => vm.selectOwner(event.target.value)} disabled={vm.members.length === 0}>
                  <option value="">Chọn người chính…</option>
                  {vm.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              {vm.ownerWarning && <WarningNote>{vm.ownerWarning}</WarningNote>}

              {vm.collaboratorCandidates.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Người phối hợp</legend>
                  <div className="flex flex-wrap gap-2">
                    {vm.collaboratorCandidates.map((member) => {
                      const selected = vm.collaboratorIds.includes(member.id)
                      return (
                        <button
                          key={member.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => vm.toggleCollaborator(member.id)}
                          className={cn(
                            'inline-flex h-10 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition-colors',
                            selected ? 'border-primary bg-primary-soft text-on-primary-soft' : 'bg-card hover:border-input/70',
                          )}
                        >
                          <Avatar name={member.fullName} size="sm" />
                          {member.fullName}
                          {selected && <Check aria-hidden className="size-4" />}
                        </button>
                      )
                    })}
                  </div>
                  {errors.collaboratorIds?.message && <p className="text-xs font-medium text-destructive">{errors.collaboratorIds.message}</p>}
                </fieldset>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <FormField label="Hạn (ngày)" required error={errors.dueDate?.message}>
                    <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('dueDate')} />
                  </FormField>
                  <FormField label="Giờ" required error={errors.dueTime?.message}>
                    <Input inputMode="numeric" placeholder="hh:mm" maxLength={5} {...register('dueTime')} />
                  </FormField>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn nhanh hạn">
                  {quickDue.map((option) => (
                    <FilterChip key={option.days} label={option.label} selected={false} onToggle={() => vm.setDueInDays(option.days)} />
                  ))}
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Mức ưu tiên</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PRIORITIES.map((priority) => {
                    const display = taskPriorityDisplay[priority]
                    const selected = vm.priority === priority
                    return (
                      <label
                        key={priority}
                        className={cn(
                          'flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                          selected ? cn(toneVariants({ tone: display.tone }), 'border-current') : 'bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <input type="radio" value={priority} className="sr-only" {...register('priority')} />
                        {display.label}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <FormAlert message={vm.errorMessage} />
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
