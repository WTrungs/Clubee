import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { motion } from 'motion/react'
import { ArrowRightLeft, Eye, GripVertical, MoreHorizontal } from 'lucide-react'
import type { Ref } from 'react'
import { cn } from '@/shared/lib/cn'
import { spring } from '@/shared/motion/presets'
import { Avatar, AvatarStack } from '@/shared/ui/Avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu'
import { Spinner } from '@/shared/ui/Spinner'
import type { TaskSummary, TaskTransitionAction } from '../model/taskTypes'
import { actionLabel, transitionActions } from '../viewModel/taskDisplay'
import { DueLabel, DueSoonBadge, TaskPriorityBadge } from './TaskMeta'

/** Kéo bằng chuột trên cả thẻ; kéo bằng bàn phím qua tay nắm, để phím trên các nút khác trong thẻ không kích hoạt kéo. */
export interface DragBindings {
  ref: Ref<HTMLDivElement>
  pointerListeners: DraggableSyntheticListeners
  handleListeners: DraggableSyntheticListeners
  handleAttributes: DraggableAttributes
  canDrag: boolean
}

interface TaskCardProps {
  task: TaskSummary
  showClub: boolean
  pending?: boolean
  /** Thẻ gốc đang được kéo (bản sao nổi trong DragOverlay). */
  ghost?: boolean
  overlay?: boolean
  drag?: DragBindings
  onOpen: (task: TaskSummary) => void
  onAction: (task: TaskSummary, action: TaskTransitionAction) => void
}

export function TaskCard({ task, showClub, pending = false, ghost = false, overlay = false, drag, onOpen, onAction }: TaskCardProps) {
  const actions = transitionActions(task)
  const done = task.status === 'DONE' || task.status === 'CANCELLED'

  return (
    <motion.div
      ref={drag?.ref}
      layoutId={overlay ? undefined : `task-${task.id}`}
      layout={!overlay}
      transition={spring}
      initial={overlay ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: ghost ? 0.35 : 1, y: 0, rotate: overlay ? 2 : 0, scale: overlay ? 1.03 : 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      whileHover={overlay || ghost || pending ? undefined : { y: -2 }}
      {...(drag?.canDrag ? drag.pointerListeners : {})}
      className={cn(
        'group relative rounded-xl border bg-card p-3 shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-input/50 hover:shadow-md',
        task.overdue && !done && 'border-l-4 border-l-status-danger',
        overlay && 'cursor-grabbing shadow-xl',
        drag?.canDrag && !overlay && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start gap-2">
        {drag && (
          <button
            type="button"
            {...drag.handleAttributes}
            {...(drag.canDrag ? drag.handleListeners : {})}
            disabled={!drag.canDrag}
            aria-label={drag.canDrag ? `Kéo thả “${task.title}” sang cột khác` : `“${task.title}” không có bước chuyển nào cho bạn`}
            className="-ml-1.5 hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 md:inline-flex"
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground">
              {showClub ? `${task.clubName} · ` : ''}
              {task.scope.eventName ? `${task.scope.eventName} · ` : ''}
              {task.scope.name}
            </span>
            <TaskPriorityBadge priority={task.priority} />
            {task.dueSoon && <DueSoonBadge />}
          </div>
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="block w-full text-left text-sm leading-snug font-semibold text-foreground hover:text-primary focus-visible:text-primary"
          >
            <span className="line-clamp-2">{task.title}</span>
          </button>
          <div className="flex items-center justify-between gap-2">
            <DueLabel dueAt={task.dueAt} overdue={task.overdue} dueSoon={task.dueSoon} done={done} />
            <span className="flex items-center gap-1.5">
              {task.collaborators.length > 0 && <AvatarStack names={task.collaborators.map((person) => person.fullName)} max={2} />}
              <span title={`Người chính: ${task.owner.fullName}`}>
                <Avatar name={task.owner.fullName} size="xs" />
              </span>
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-10"
            aria-label={`Thao tác với “${task.title}”`}
            disabled={pending || overlay}
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onOpen(task)}>
              <Eye aria-hidden />
              Xem chi tiết
            </DropdownMenuItem>
            {actions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Chuyển trạng thái</DropdownMenuLabel>
                {actions.map((action) => (
                  <DropdownMenuItem key={action} onSelect={() => onAction(task, action)}>
                    <ArrowRightLeft aria-hidden />
                    {actionLabel[action]}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pending && (
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-card/90 text-xs font-semibold text-muted-foreground">
          <Spinner />
          Đang cập nhật…
        </div>
      )}
    </motion.div>
  )
}
