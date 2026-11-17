import { ClipboardList, Info } from 'lucide-react'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { Spinner } from '@/shared/ui/Spinner'
import { BOARD_LIMIT, type TaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { TaskActionDialogs } from './TaskActionDialogs'
import { TaskBoard } from './TaskBoard'
import { TaskDetailSheet } from './TaskDetailSheet'
import { TaskFiltersBar } from './TaskFiltersBar'
import { TaskListView } from './TaskListView'

function BoardSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Đang tải công việc">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="space-y-2.5 rounded-2xl border bg-muted/40 p-2.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}

export function TaskWorkspace({ vm, showClub }: { vm: TaskWorkspaceViewModel; showClub: boolean }) {
  const wide = useMediaQuery('(min-width: 768px)')
  const empty = !vm.loading && !vm.error && vm.tasks.length === 0

  return (
    <div>
      <TaskFiltersBar vm={vm} hideStatusChips={vm.view === 'board' && !wide} />
      <ConflictBanner show={vm.transition.conflict} onReload={vm.transition.reloadAfterConflict} />

      {vm.refreshing && (
        <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Spinner className="size-3.5" />
          Đang cập nhật…
        </p>
      )}

      {vm.truncated && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-status-info-soft p-3 text-sm text-status-info">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Bảng hiển thị {BOARD_LIMIT} việc gần hạn nhất. Chuyển sang dạng danh sách để xem tất cả {vm.totalElements} việc.
        </p>
      )}

      {vm.visibleStatuses.length === 0 && (
        <EmptyState icon={ClipboardList} title="Chưa chọn trạng thái nào" description="Bật ít nhất một trạng thái trong bộ lọc để xem công việc." />
      )}
      {vm.loading && (vm.view === 'board' ? <BoardSkeleton /> : <Skeleton className="h-64 w-full rounded-2xl" />)}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {empty && vm.visibleStatuses.length > 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Không có công việc phù hợp"
          description={vm.filters.activeCount > 0 ? 'Thử bỏ bớt bộ lọc.' : 'Chưa có việc nào ở đây.'}
          action={
            vm.filters.activeCount > 0 ? (
              <Button variant="outline" size="sm" onClick={vm.filters.clear}>
                Xóa bộ lọc
              </Button>
            ) : undefined
          }
        />
      )}
      {!vm.loading && !vm.error && vm.tasks.length > 0 && (vm.view === 'board' ? <TaskBoard vm={vm} showClub={showClub} /> : <TaskListView vm={vm} showClub={showClub} />)}

      <TaskDetailSheet selection={vm.selected} onClose={vm.closeTask} transition={vm.transition} />
      <TaskActionDialogs transition={vm.transition} />
    </div>
  )
}
