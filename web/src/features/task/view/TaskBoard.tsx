import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { spring } from '@/shared/motion/presets'
import { toneDotClass } from '@/shared/ui/tone'
import type { TaskStatus, TaskSummary, TaskTransitionAction } from '../model/taskTypes'
import { getDropTargets, taskStatusDisplay } from '../viewModel/taskDisplay'
import type { TaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { TaskCard } from './TaskCard'

const statusLabel = (status: TaskStatus) => taskStatusDisplay[status].label

const announcements = (tasks: TaskSummary[]): Announcements => {
  const title = (id: string | number) => tasks.find((task) => task.id === id)?.title ?? 'việc'
  const column = (id: string | number | undefined) => (id ? statusLabel(id as TaskStatus) : '')
  return {
    onDragStart: ({ active }) => `Đã nhấc “${title(active.id)}”.`,
    onDragOver: ({ active, over }) => (over ? `“${title(active.id)}” đang ở trên cột ${column(over.id)}.` : 'Không ở trên cột nào.'),
    onDragEnd: ({ active, over }) => (over ? `Đã thả “${title(active.id)}” vào cột ${column(over.id)}.` : 'Đã thả ra ngoài, không đổi trạng thái.'),
    onDragCancel: ({ active }) => `Đã hủy kéo “${title(active.id)}”.`,
  }
}

function DraggableTask({ task, vm, showClub }: { task: TaskSummary; vm: TaskWorkspaceViewModel; showClub: boolean }) {
  const pending = vm.transition.pendingTaskId === task.id
  const canDrag = getDropTargets(task).size > 0 && !vm.transition.pending
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id, data: { task }, disabled: !canDrag })
  const { onKeyDown, ...pointerListeners } = listeners ?? {}
  return (
    <TaskCard
      task={task}
      showClub={showClub}
      pending={pending}
      ghost={isDragging}
      drag={{
        ref: setNodeRef,
        canDrag,
        pointerListeners,
        handleListeners: onKeyDown ? { onKeyDown } : undefined,
        handleAttributes: attributes,
      }}
      onOpen={vm.openTask}
      onAction={vm.transition.requestAction}
    />
  )
}

interface ColumnProps {
  status: TaskStatus
  tasks: TaskSummary[]
  dropState: 'idle' | 'valid' | 'invalid'
  vm: TaskWorkspaceViewModel
  showClub: boolean
}

function TaskColumn({ status, tasks, dropState, vm, showClub }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dropState === 'invalid' })
  const display = taskStatusDisplay[status]
  return (
    <section
      aria-label={`Cột ${display.label}, ${tasks.length} việc`}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border bg-muted/40 transition-[opacity,background-color,border-color,box-shadow] duration-200',
        dropState === 'invalid' && 'opacity-45',
        dropState === 'valid' && 'border-dashed border-primary/60 bg-primary-soft/40',
        dropState === 'valid' && isOver && 'bg-primary-soft shadow-lg ring-2 ring-primary/40',
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span aria-hidden className={cn('size-2 rounded-full', toneDotClass[display.tone])} />
        <h2 className="text-sm font-bold">{display.label}</h2>
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums shadow-sm">{tasks.length}</span>
      </header>
      <div ref={setNodeRef} className="flex min-h-40 flex-1 flex-col gap-2.5 p-2.5 pt-1">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <DraggableTask key={task.id} task={task} vm={vm} showClub={showClub} />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <p className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed py-6 text-xs text-muted-foreground">
            <Inbox aria-hidden className="size-5 opacity-60" />
            {dropState === 'valid' ? 'Thả vào đây' : 'Không có việc'}
          </p>
        )}
      </div>
    </section>
  )
}

/** Ở màn hình hẹp chỉ hiện một cột, chọn bằng thanh trạng thái, không cuộn ngang (NFR-USA-01). */
function MobileColumnPicker({ statuses, active, counts, onChange }: { statuses: TaskStatus[]; active: TaskStatus; counts: Record<TaskStatus, number>; onChange: (status: TaskStatus) => void }) {
  return (
    <div role="group" aria-label="Chọn cột trạng thái" className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl border bg-card p-1.5 sm:grid-cols-4">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={status === active}
          onClick={() => onChange(status)}
          className={cn(
            'relative flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-colors',
            status === active ? 'text-on-primary-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {status === active && <motion.span layoutId="mobile-column" transition={spring} className="absolute inset-0 rounded-xl bg-primary-soft" />}
          <span className="relative truncate">{statusLabel(status)}</span>
          <span className="relative tabular-nums opacity-80">{counts[status]}</span>
        </button>
      ))}
    </div>
  )
}

export function TaskBoard({ vm, showClub }: { vm: TaskWorkspaceViewModel; showClub: boolean }) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null)
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('IN_PROGRESS')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))
  const statuses = vm.visibleStatuses
  const dropTargets = useMemo(() => (activeTask ? getDropTargets(activeTask) : null), [activeTask])
  const counts = useMemo(
    () => Object.fromEntries((Object.keys(vm.columns) as TaskStatus[]).map((status) => [status, vm.columns[status].length])) as Record<TaskStatus, number>,
    [vm.columns],
  )

  const dropStateOf = (status: TaskStatus): ColumnProps['dropState'] => {
    if (!dropTargets || !activeTask) return 'idle'
    if (status === activeTask.status) return 'idle'
    return dropTargets.has(status) ? 'valid' : 'invalid'
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask((event.active.data.current?.task as TaskSummary | undefined) ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const task = event.active.data.current?.task as TaskSummary | undefined
    setActiveTask(null)
    if (!task || !event.over) return
    const action: TaskTransitionAction | undefined = getDropTargets(task).get(event.over.id as TaskStatus)
    if (action) vm.transition.requestAction(task, action)
  }

  if (!wide) {
    const shown = statuses.includes(mobileStatus) ? mobileStatus : (statuses[0] ?? 'ASSIGNED')
    return (
      <div>
        <MobileColumnPicker statuses={statuses} active={shown} counts={counts} onChange={setMobileStatus} />
        <LayoutGroup>
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {vm.columns[shown].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  showClub={showClub}
                  pending={vm.transition.pendingTaskId === task.id}
                  onOpen={vm.openTask}
                  onAction={vm.transition.requestAction}
                />
              ))}
            </AnimatePresence>
            {vm.columns[shown].length === 0 && (
              <p className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed py-10 text-sm text-muted-foreground">
                <Inbox aria-hidden className="size-6 opacity-60" />
                Không có việc ở cột này
              </p>
            )}
          </div>
        </LayoutGroup>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
      accessibility={{
        announcements: announcements(vm.tasks),
        screenReaderInstructions: {
          draggable: 'Nhấn Space hoặc Enter để nhấc việc, dùng phím mũi tên để di chuyển sang cột khác, nhấn Space hoặc Enter để thả, Esc để hủy.',
        },
      }}
    >
      <LayoutGroup>
        <div className={cn('grid gap-3', statuses.length >= 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3', statuses.length === 5 && '2xl:grid-cols-5')}>
          {statuses.map((status) => (
            <TaskColumn key={status} status={status} tasks={vm.columns[status]} dropState={dropStateOf(status)} vm={vm} showClub={showClub} />
          ))}
        </div>
      </LayoutGroup>
      <DragOverlay dropAnimation={null}>
        {activeTask && <TaskCard task={activeTask} showClub={showClub} overlay onOpen={() => undefined} onAction={() => undefined} />}
      </DragOverlay>
    </DndContext>
  )
}
