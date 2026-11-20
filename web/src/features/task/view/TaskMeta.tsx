import { AlarmClock, CalendarClock } from 'lucide-react'
import { describeDueDate, formatDateTime } from '@/shared/format/formatDate'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import type { TaskPriority, TaskStatus } from '../model/taskTypes'
import { taskPriorityDisplay, taskStatusDisplay } from '../viewModel/taskDisplay'

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const display = taskStatusDisplay[status]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const display = taskPriorityDisplay[priority]
  return <Badge tone={display.tone}>{display.label}</Badge>
}

/** Hạn kèm cờ quá hạn hoặc sắp đến hạn (BR-TASK-03, FR-TASK-06); chỗ không có nhãn Sắp đến hạn thì bật `announceDueSoon` để trình đọc màn hình biết. */
export function DueLabel({
  dueAt,
  overdue,
  dueSoon = false,
  announceDueSoon = false,
  done,
  className,
}: {
  dueAt: string
  overdue: boolean
  dueSoon?: boolean
  announceDueSoon?: boolean
  done: boolean
  className?: string
}) {
  const now = useNow()
  const Icon = overdue || dueSoon ? AlarmClock : CalendarClock
  // Hạn đã qua mà máy chủ không gắn cờ (việc của sự kiện đã đóng, hủy) thì chỉ ghi ngày giờ, không nói quá hạn.
  const absolute = done || (!overdue && Date.parse(dueAt) < now)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold',
        overdue ? 'text-status-danger' : dueSoon ? 'text-status-warning' : 'text-muted-foreground',
        className,
      )}
      title={formatDateTime(dueAt)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{absolute ? formatDateTime(dueAt) : describeDueDate(dueAt, new Date(now))}</span>
      {overdue && <span className="sr-only">(quá hạn)</span>}
      {announceDueSoon && dueSoon && !overdue && <span className="sr-only">(sắp đến hạn)</span>}
    </span>
  )
}

/** Nhãn nhắc việc sắp đến hạn theo số ngày CLB cấu hình (FR-TASK-06). */
export function DueSoonBadge() {
  return (
    <Badge tone="warning" dot>
      Sắp đến hạn
    </Badge>
  )
}
