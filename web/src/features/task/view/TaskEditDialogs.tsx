import { Check } from 'lucide-react'
import { useId } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { REASON_MAX } from '@/shared/lib/reasonRules'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect, Textarea } from '@/shared/ui/Input'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { TaskDetail } from '../model/taskTypes'
import type { TaskEditViewModel } from '../viewModel/useTaskEditViewModel'
import { WarningNote } from '@/shared/ui/WarningNote'

const OUT_OF_SCOPE = 'không còn trong phạm vi'

function Footer({ formId, vm, label }: { formId: string; vm: TaskEditViewModel; label: string }) {
  return (
    <>
      <Button variant="ghost" onClick={vm.close} disabled={vm.pending}>
        Hủy bỏ
      </Button>
      <Button type="submit" form={formId} loading={vm.pending}>
        {label}
      </Button>
    </>
  )
}

function ReassignForm({ task, vm, formId }: { task: TaskDetail; vm: TaskEditViewModel; formId: string }) {
  const collaboratorErrorId = useId()
  const errors = vm.reassignForm.formState.errors
  if (vm.scopeLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Đang tải người trong phạm vi">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }
  if (vm.scopeError) return <ErrorState error={vm.scopeError} onRetry={vm.retryScope} />
  if (vm.scopeUnavailable) {
    return <FormAlert message={`Bạn không còn giao việc được trong ${task.scope.name}, nên không đổi người được. Đổi hạn hoặc hủy việc vẫn làm được.`} />
  }
  return (
    <form id={formId} noValidate onSubmit={vm.submitReassign} className="space-y-5">
      <FormField label="Người chính" required error={errors.ownerId?.message}>
        <NativeSelect value={vm.ownerId} onChange={(event) => vm.selectOwner(event.target.value)}>
          {vm.ownerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.outOfScope ? `${option.fullName} (${OUT_OF_SCOPE})` : option.fullName}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {vm.ownerWarning && <WarningNote>{vm.ownerWarning}</WarningNote>}
      <fieldset className="space-y-2" aria-describedby={errors.collaboratorIds?.message ? collaboratorErrorId : undefined}>
        <legend className="text-sm font-semibold">Người phối hợp</legend>
        {vm.collaboratorOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Phạm vi không còn ai khác để phối hợp.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {vm.collaboratorOptions.map((option) => {
              const selected = vm.collaboratorIds.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => vm.toggleCollaborator(option.id)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-left text-sm font-medium transition-colors',
                    selected ? 'border-primary bg-primary-soft text-on-primary-soft' : 'bg-card hover:border-input/70',
                  )}
                >
                  <Avatar name={option.fullName} size="sm" />
                  <span>
                    {option.fullName}
                    {option.outOfScope && <span className="block text-xs font-normal text-muted-foreground">{OUT_OF_SCOPE}</span>}
                  </span>
                  {selected && <Check aria-hidden className="size-4" />}
                </button>
              )
            })}
          </div>
        )}
        {errors.collaboratorIds?.message && (
          <p id={collaboratorErrorId} role="alert" className="text-xs font-medium text-destructive">
            {errors.collaboratorIds.message}
          </p>
        )}
      </fieldset>
      <FormField label="Lý do" required error={errors.reason?.message} hint="Người cũ và người mới đều thấy lý do này.">
        <Textarea rows={3} maxLength={REASON_MAX} {...vm.reassignForm.register('reason')} />
      </FormField>
      <FormAlert message={vm.errorMessage} />
    </form>
  )
}

function ChangeDueForm({ task, vm, formId }: { task: TaskDetail; vm: TaskEditViewModel; formId: string }) {
  const { register, formState } = vm.dueForm
  return (
    <form id={formId} noValidate onSubmit={vm.submitDue} className="space-y-5">
      <p className="text-sm text-muted-foreground">Hạn hiện tại: {formatDateTime(task.dueAt)}. Lịch sử quá hạn đã ghi vẫn giữ nguyên.</p>
      <DateTimeRow label="Hạn mới" date={register('dueDate')} time={register('dueTime')} error={formState.errors.dueDate?.message ?? formState.errors.dueTime?.message} />
      <FormField label="Lý do" required error={formState.errors.reason?.message} hint="Người chính và người phối hợp thấy lý do này.">
        <Textarea rows={3} maxLength={REASON_MAX} {...register('reason')} />
      </FormField>
      <FormAlert message={vm.errorMessage} />
    </form>
  )
}

/** FR-TASK-05: hộp đổi người và hộp đổi hạn của người giao việc. */
export function TaskEditDialogs({ task, vm }: { task: TaskDetail | null; vm: TaskEditViewModel }) {
  const reassignId = useId()
  const dueId = useId()
  if (!task) return null
  const onOpenChange = (open: boolean) => !open && vm.close()
  return (
    <>
      <Dialog open={vm.mode === 'reassign'} onOpenChange={onOpenChange}>
        <DialogContent
          title="Đổi người làm"
          description={`“${task.title}” giữ nguyên trạng thái; người mới nhận thông báo.`}
          footer={vm.scopeLoading || vm.scopeUnavailable || vm.scopeError ? undefined : <Footer formId={reassignId} vm={vm} label="Lưu người làm" />}
        >
          <ReassignForm task={task} vm={vm} formId={reassignId} />
        </DialogContent>
      </Dialog>
      <Dialog open={vm.mode === 'due'} onOpenChange={onOpenChange}>
        <DialogContent title="Đổi hạn" description={`“${task.title}”`} footer={<Footer formId={dueId} vm={vm} label="Lưu hạn mới" />}>
          <ChangeDueForm task={task} vm={vm} formId={dueId} />
        </DialogContent>
      </Dialog>
    </>
  )
}
