import { motion } from 'motion/react'
import { AlarmClock, Ban, CalendarClock, CheckCircle2, Ellipsis, FileText, History, Info, Lock, MessageSquareText, Send, UserRoundPen } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { formatFileSize } from '@/shared/lib/validateUploadFile'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { actionLabel, overdueSummary, taskTimeline, type TaskMenuAction } from '../viewModel/taskDisplay'
import { useTaskDetailViewModel, type ViewerRole } from '../viewModel/useTaskDetailViewModel'
import { useTaskEditViewModel } from '../viewModel/useTaskEditViewModel'
import type { TaskTransitionController } from '../viewModel/useTaskTransition'
import { TaskEditDialogs } from './TaskEditDialogs'
import { DueLabel, DueSoonBadge, TaskPriorityBadge, TaskStatusBadge } from './TaskMeta'

const menuItem: Record<TaskMenuAction, { label: string; icon: ReactNode }> = {
  REASSIGN: { label: 'Đổi người làm', icon: <UserRoundPen aria-hidden /> },
  CHANGE_DUE: { label: 'Đổi hạn', icon: <CalendarClock aria-hidden /> },
  CANCEL: { label: 'Hủy việc', icon: <Ban aria-hidden /> },
}

const roleHint: Record<ViewerRole, string | null> = {
  owner: 'Bạn là người chính: cập nhật tiến độ và nộp kết quả.',
  assigner: 'Bạn là người giao việc: nghiệm thu khi việc được nộp.',
  collaborator: 'Bạn là người phối hợp: theo dõi việc; chỉ người chính được nộp kết quả.',
  viewer: null,
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} size="xs" />
      {name}
    </span>
  )
}

interface TaskDetailSheetProps {
  selection: { clubId: string; taskId: string } | null
  onClose: () => void
  transition: TaskTransitionController
}

export function TaskDetailSheet({ selection, onClose, transition }: TaskDetailSheetProps) {
  const vm = useTaskDetailViewModel(selection)
  const task = vm.task
  const edit = useTaskEditViewModel(task)
  const pending = task !== null && transition.pendingTaskId === task.id
  const runMenuAction = (action: TaskMenuAction) => {
    if (!task) return
    if (action === 'CANCEL') transition.requestAction(task, 'CANCEL')
    else edit.open(action === 'REASSIGN' ? 'reassign' : 'due')
  }

  return (
    <Sheet open={selection !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={task?.title ?? 'Chi tiết công việc'}
        description={task ? `${task.clubName} · ${task.scope.eventName ? `${task.scope.eventName} · ` : ''}${task.scope.name}` : undefined}
        footer={
          task && vm.actions.length > 0 ? (
            vm.actions.map((action) => (
              <Button
                key={action}
                variant={action === 'REQUEST_CHANGES' ? 'outline' : 'primary'}
                loading={pending && transition.dialog === null}
                disabled={transition.pending}
                onClick={() => transition.requestAction(task, action)}
              >
                {action === 'SUBMIT' ? <Send aria-hidden /> : action === 'APPROVE' ? <CheckCircle2 aria-hidden /> : null}
                {actionLabel[action]}
              </Button>
            ))
          ) : undefined
        }
      >
        {vm.loading && (
          <div className="space-y-4 p-5" role="status" aria-label="Đang tải công việc">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {vm.error && (
          <div className="p-5">
            <ErrorState error={vm.error} onRetry={vm.refetch} />
          </div>
        )}
        {task && (
          <motion.div variants={listVariants} initial="initial" animate="animate" className="space-y-6 p-5">
            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              <DueLabel dueAt={task.dueAt} overdue={task.overdue} dueSoon={task.dueSoon} done={task.status === 'DONE' || task.status === 'CANCELLED'} />
              {task.dueSoon && <DueSoonBadge />}
              {vm.menuActions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-auto" disabled={transition.pending || edit.pending}>
                      <Ellipsis aria-hidden />
                      Thao tác khác
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {vm.menuActions.map((action) => (
                      <DropdownMenuItem key={action} destructive={action === 'CANCEL'} onSelect={() => runMenuAction(action)}>
                        {menuItem[action].icon}
                        {menuItem[action].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </motion.div>

            {task.cancelReason && (
              <motion.section variants={itemVariants} className="space-y-1 rounded-2xl bg-muted p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Ban aria-hidden className="size-4 text-muted-foreground" />
                  Lý do hủy
                </h3>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{task.cancelReason}</p>
              </motion.section>
            )}

            {task.readOnlyReason ? (
              <motion.p variants={itemVariants} className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm font-medium text-muted-foreground">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                {task.readOnlyReason}
              </motion.p>
            ) : (
              roleHint[vm.viewerRole] && (
                <motion.p variants={itemVariants} className="flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm font-medium text-on-primary-soft">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {roleHint[vm.viewerRole]}
                </motion.p>
              )
            )}

            <motion.dl variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Hạn">{formatDateTime(task.dueAt)}</Field>
              <Field label="Người giao (nghiệm thu)">
                <Person name={task.assigner.fullName} />
              </Field>
              <Field label="Người chính">
                <Person name={task.owner.fullName} />
              </Field>
              <Field label="Người phối hợp">
                {task.collaborators.length === 0 ? (
                  <span className="text-muted-foreground">Không có</span>
                ) : (
                  <span className="flex flex-col gap-1.5">
                    {task.collaborators.map((person) => (
                      <Person key={person.id} name={person.fullName} />
                    ))}
                  </span>
                )}
              </Field>
            </motion.dl>

            {task.description && (
              <motion.section variants={itemVariants} className="space-y-1.5">
                <h3 className="text-sm font-bold">Mô tả</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{task.description}</p>
              </motion.section>
            )}

            {task.submission && (
              <motion.section variants={itemVariants} className="space-y-2 rounded-2xl border bg-muted/40 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Send aria-hidden className="size-4 text-primary" />
                  Kết quả đã nộp · {formatDateTime(task.submission.submittedAt)}
                </h3>
                {task.submission.note && <p className="text-sm whitespace-pre-line">{task.submission.note}</p>}
                {task.submission.attachments.length > 0 && (
                  <ul className="space-y-1.5">
                    {task.submission.attachments.map((file) => (
                      <li key={file.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                        <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.section>
            )}

            {task.reviewComment && (
              <motion.section variants={itemVariants} className="space-y-1.5 rounded-2xl bg-status-warning-soft p-4 text-status-warning">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <MessageSquareText aria-hidden className="size-4" />
                  Nhận xét nghiệm thu
                </h3>
                <p className="text-sm whitespace-pre-line">{task.reviewComment}</p>
              </motion.section>
            )}

            <motion.section variants={itemVariants} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <History aria-hidden className="size-4 text-muted-foreground" />
                Lịch sử
              </h3>
              {overdueSummary(task.overdueHistory.length) && (
                <p className="flex items-start gap-2 rounded-xl bg-status-danger-soft px-3 py-2 text-sm font-medium text-status-danger">
                  <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {overdueSummary(task.overdueHistory.length)}
                </p>
              )}
              <ol className="relative space-y-4 border-l pl-5">
                {taskTimeline(task).map((entry) => (
                  <li key={entry.id} className="relative">
                    <span aria-hidden className={cn('absolute top-1 -left-6.5 size-2.5 rounded-full ring-4 ring-popover', entry.actor ? 'bg-primary' : 'bg-status-danger')} />
                    <p className="text-sm">
                      <span className="font-semibold">{entry.actor?.fullName ?? 'Hệ thống'}</span> {entry.text}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                    {entry.note && <p className="mt-1 rounded-lg bg-muted px-2.5 py-1.5 text-sm">{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </motion.section>
          </motion.div>
        )}
      </SheetContent>
      <TaskEditDialogs task={task} vm={edit} />
    </Sheet>
  )
}
