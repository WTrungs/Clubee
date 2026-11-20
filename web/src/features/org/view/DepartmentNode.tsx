import { UsersRound } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import type { Department } from '../model/orgTypes'
import { currentHead, departmentHealth, departmentHealthDisplay, positionRoleLabel } from '../viewModel/orgDisplay'

interface DepartmentNodeProps {
  department: Department
  selected: boolean
  onSelect: () => void
}

/** Một ban trong sơ đồ hoặc danh sách: trưởng ban, số người, badge trạng thái (FR-ORG-07); bấm để mở chi tiết. */
export function DepartmentNode({ department, selected, onSelect }: DepartmentNodeProps) {
  const head = currentHead(department.leads)
  const health = departmentHealthDisplay[departmentHealth(department)]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        // Thiếu min-w-0 thì dòng truncate làm thẻ giãn quá cột ở màn hẹp hoặc trong sơ đồ.
        'flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-bold break-words">Ban {department.name}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
          <UsersRound aria-hidden className="size-3.5" />
          {department.memberCount} người
        </span>
      </span>
      <span className={cn('block truncate text-sm', head ? 'text-foreground' : 'text-muted-foreground')}>
        {head ? `${positionRoleLabel.DEPARTMENT_HEAD}: ${head.holder.fullName}` : department.status === 'CLOSED' ? (department.closeReason ?? '—') : 'Chưa có trưởng ban'}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={health.tone} dot>
          {health.label}
        </Badge>
        {department.status === 'CLOSED' && department.closedOn && <span className="text-xs text-muted-foreground">Đóng ngày {formatDate(department.closedOn)}</span>}
        {department.status === 'ACTIVE' && department.openTaskCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {department.openTaskCount} việc đang mở{department.overdueTaskCount > 0 ? `, ${department.overdueTaskCount} quá hạn` : ''}
          </span>
        )}
      </span>
    </button>
  )
}
