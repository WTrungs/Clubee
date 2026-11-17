import { CircleCheck, Inbox, Info, UserRoundCog, UserX, X } from 'lucide-react'
import { taskStatusDisplay } from '@/features/task/viewModel/taskDisplay'
import { formatDateTime } from '@/shared/format/formatDate'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { BacklogItem } from '../model/backlogTypes'
import { backlogActionLabel, backlogKindDisplay, backlogOutcome, backlogStatusDisplay } from '../viewModel/backlogDisplay'
import { useBacklogViewModel, type BacklogViewModel } from '../viewModel/useBacklogViewModel'
import { ResolveBacklogSheet } from './ResolveBacklogSheet'

function ItemDetails({ item }: { item: BacklogItem }) {
  if (item.task) {
    return (
      <div className="space-y-0.5 text-sm text-muted-foreground">
        <p>
          {item.task.scopeName}
          {item.task.eventName && ` · ${item.task.eventName}`} · {taskStatusDisplay[item.task.status].label}
        </p>
        <p>
          {item.kind === 'TASK' ? 'Người giao' : 'Người làm'} {item.task.counterpart.fullName} · Hạn {formatDateTime(item.task.dueAt)}
          {item.task.overdue && <span className="font-medium text-status-danger"> · Quá hạn</span>}
        </p>
      </div>
    )
  }
  if (item.position) {
    return (
      <p className="text-sm text-muted-foreground">
        {item.position.role === 'EVENT_LEAD' ? `Sự kiện ${item.position.scopeName}` : item.position.scopeName}
        {item.position.eventName && item.position.eventName !== item.position.scopeName && ` · ${item.position.eventName}`}
      </p>
    )
  }
  return null
}

function ItemRow({ item, vm }: { item: BacklogItem; vm: BacklogViewModel }) {
  const outcome = backlogOutcome(item)
  const status = backlogStatusDisplay[item.status]
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold break-words">{item.title}</p>
          <Badge tone={backlogKindDisplay[item.kind].tone}>{backlogKindDisplay[item.kind].label}</Badge>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        <ItemDetails item={item} />
        {outcome && (
          <p className="flex items-start gap-2 text-sm">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-success" />
            {outcome}
          </p>
        )}
        {item.appointBlockedReason && (
          <p className="flex items-start gap-2 rounded-lg bg-muted p-2.5 text-sm text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {item.appointBlockedReason}
          </p>
        )}
      </div>
      {item.allowedActions.length > 0 && (
        <div className="flex flex-col gap-2 sm:items-end">
          {item.allowedActions.map((action) =>
            action === 'DISMISS' ? (
              <Button key={action} variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => vm.openDismiss(item)} aria-label={`Không cần thay: ${item.title}`}>
                <UserX aria-hidden />
                {backlogActionLabel(action, item.kind)}
              </Button>
            ) : (
              <Button key={action} size="sm" className="w-full sm:w-auto" onClick={() => vm.openResolve(item, action)} aria-label={`${backlogActionLabel(action, item.kind)}: ${item.title}`}>
                <UserRoundCog aria-hidden />
                {backlogActionLabel(action, item.kind)}
              </Button>
            ),
          )}
        </div>
      )}
    </li>
  )
}

function Groups({ vm }: { vm: BacklogViewModel }) {
  if (vm.loading) {
    return (
      <div role="status" aria-label="Đang tải tồn đọng" className="space-y-2.5">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    )
  }
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.empty) {
    return (
      <EmptyState
        icon={Inbox}
        title={vm.status === 'OPEN' ? 'Không còn tồn đọng chờ xử lý' : 'Chưa có mục nào đã xử lý'}
        description="Khi một người bị đưa ra khỏi CLB, việc dở và chức vụ của họ sẽ nằm ở đây để ban chủ nhiệm gán lại."
      />
    )
  }
  return (
    <div className="space-y-5">
      {vm.groups.map((group) => (
        <section key={group.person.id} aria-labelledby={`backlog-${group.person.id}`} className="space-y-2">
          <h3 id={`backlog-${group.person.id}`} className="flex items-center gap-2 text-sm font-bold">
            <Avatar name={group.person.fullName} size="sm" />
            {group.person.fullName}
            <span className="font-normal text-muted-foreground">· {group.items.length} mục</span>
          </h3>
          <ul aria-label={`Tồn đọng của ${group.person.fullName}`} className="divide-y rounded-2xl border bg-card">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} vm={vm} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** FR-MEM-09: ban chủ nhiệm xử lý việc dở và chức vụ của người bị đưa ra khỏi CLB. */
export function BacklogPanel({ formerMemberId, clearFormer }: { formerMemberId: string | null; clearFormer: () => void }) {
  const vm = useBacklogViewModel(formerMemberId, clearFormer)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
        {vm.statusFilters.map((filter) => (
          <FilterChip key={filter.value} label={filter.label} selected={vm.status === filter.value} onToggle={() => vm.setStatus(filter.value)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo loại">
        {vm.kindFilters.map((filter) => (
          <FilterChip key={filter.value || 'ALL'} label={filter.label} selected={vm.kind === filter.value} onToggle={() => vm.setKind(filter.value)} />
        ))}
      </div>
      {vm.formerMemberId && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Chỉ hiện tồn đọng của <span className="font-semibold">{vm.formerName ?? 'người đã chọn'}</span>
          <Button variant="ghost" size="sm" onClick={vm.clearFormer}>
            <X aria-hidden />
            Xem của mọi người
          </Button>
        </p>
      )}
      <Groups vm={vm} />
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      <ResolveBacklogSheet target={vm.resolving} onClose={vm.closeResolve} />
      <ReasonDialog
        open={vm.dismissing !== null}
        onOpenChange={(open) => !open && vm.closeDismiss()}
        title="Không cần người thay"
        description={vm.dismissing ? `${vm.dismissing.title} của ${vm.dismissing.formerMember.fullName} sẽ được ghi là đã xử lý mà không chỉ định ai.` : undefined}
        confirmLabel="Ghi nhận"
        pending={vm.dismissPending}
        onConfirm={vm.confirmDismiss}
      />
    </div>
  )
}
