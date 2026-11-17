import { motion } from 'motion/react'
import { FilterX, KanbanSquare, List } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { FilterChip, SearchInput } from '@/shared/ui/ListControls'
import type { DueFilter, TaskPriority } from '../model/taskTypes'
import { ALL_STATUSES, PRIORITIES, taskPriorityDisplay, taskStatusDisplay } from '../viewModel/taskDisplay'
import type { TaskView, TaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'

const dueOptions: Array<{ value: DueFilter | ''; label: string }> = [
  { value: '', label: 'Mọi hạn' },
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'THIS_WEEK', label: 'Trong 7 ngày' },
  { value: 'LATER', label: 'Sau 7 ngày' },
]

function ViewToggle({ view, onChange }: { view: TaskView; onChange: (view: TaskView) => void }) {
  const options: Array<{ value: TaskView; label: string; icon: typeof List }> = [
    { value: 'board', label: 'Bảng', icon: KanbanSquare },
    { value: 'list', label: 'Danh sách', icon: List },
  ]
  return (
    <div role="group" aria-label="Kiểu hiển thị" className="inline-flex shrink-0 rounded-xl border bg-card p-1 shadow-sm">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={cn('relative inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors', view === value ? 'text-on-primary-soft' : 'text-muted-foreground hover:text-foreground')}
        >
          {view === value && <motion.span layoutId="task-view-toggle" transition={spring} className="absolute inset-0 rounded-lg bg-primary-soft" />}
          <Icon aria-hidden className="relative size-4" />
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  )
}

export function TaskFiltersBar({ vm, hideStatusChips }: { vm: TaskWorkspaceViewModel; hideStatusChips: boolean }) {
  const { filters } = vm
  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput label="Tìm công việc" placeholder="Tìm theo tên, mô tả…" value={filters.keyword} onValueChange={filters.setKeyword} className="flex-1" />
        <ViewToggle view={vm.view} onChange={vm.setView} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <NativeSelect
          aria-label="Lọc theo mức ưu tiên"
          value={filters.priority}
          onChange={(event) => filters.setPriority(event.target.value as TaskPriority | '')}
          className="sm:w-44"
        >
          <option value="">Mọi mức ưu tiên</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {taskPriorityDisplay[priority].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo hạn" value={filters.due} onChange={(event) => filters.setDue(event.target.value as DueFilter | '')} className="sm:w-40">
          {dueOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        {vm.source.kind === 'mine' && filters.clubOptions.length > 1 && (
          <NativeSelect aria-label="Lọc theo CLB" value={filters.clubId} onChange={(event) => filters.setClubId(event.target.value)} className="sm:w-52">
            <option value="">Mọi CLB</option>
            {filters.clubOptions.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {filters.eventOptions.length > 0 && (
          <NativeSelect aria-label="Lọc theo sự kiện" value={filters.eventId} onChange={(event) => filters.setEventId(event.target.value)} className="sm:w-52">
            <option value="">Mọi sự kiện</option>
            {filters.eventOptions.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {filters.activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={filters.clear} className="col-span-2 justify-self-start">
            <FilterX aria-hidden />
            Xóa bộ lọc
          </Button>
        )}
      </div>
      {!hideStatusChips && (
        <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((status) => (
            <FilterChip
              key={status}
              label={taskStatusDisplay[status].label}
              selected={filters.statuses.includes(status)}
              onToggle={() => filters.toggleStatus(status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
