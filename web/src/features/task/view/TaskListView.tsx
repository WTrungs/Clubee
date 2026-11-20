import { motion } from 'motion/react'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Pagination } from '@/shared/ui/ListControls'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import type { TaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { TaskCard } from './TaskCard'
import { DueLabel, DueSoonBadge, TaskPriorityBadge, TaskStatusBadge } from './TaskMeta'

/** Dạng danh sách có phân trang (FR-RPT-01); bảng ở màn rộng, thẻ ở màn hẹp. */
export function TaskListView({ vm, showClub }: { vm: TaskWorkspaceViewModel; showClub: boolean }) {
  const wide = useMediaQuery('(min-width: 1024px)')

  return (
    <div className="space-y-4">
      {wide ? (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Việc
                </th>
                <th scope="col" className="px-4 py-3">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3">
                  Ưu tiên
                </th>
                <th scope="col" className="px-4 py-3">
                  Hạn
                </th>
                <th scope="col" className="px-4 py-3">
                  Người chính
                </th>
              </tr>
            </thead>
            <motion.tbody variants={listVariants} initial="initial" animate="animate" key={`${vm.page}-${vm.tasks.length}`}>
              {vm.tasks.map((task) => (
                <motion.tr key={task.id} variants={itemVariants} className="border-t transition-colors hover:bg-muted/40">
                  <td className="max-w-md px-4 py-3">
                    <button type="button" onClick={() => vm.openTask(task)} className="text-left font-semibold hover:text-primary">
                      {task.title}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {showClub ? `${task.clubName} · ` : ''}
                      {task.scope.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <TaskStatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3">
                    <TaskPriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <DueLabel dueAt={task.dueAt} overdue={task.overdue} dueSoon={task.dueSoon} done={task.status === 'DONE' || task.status === 'CANCELLED'} />
                      {task.dueSoon && <DueSoonBadge />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={task.owner.fullName} size="xs" />
                      {task.owner.fullName}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      ) : (
        <motion.div variants={listVariants} initial="initial" animate="animate" className="flex flex-col gap-2.5" key={`${vm.page}-${vm.tasks.length}`}>
          {vm.tasks.map((task) => (
            <motion.div key={task.id} variants={itemVariants} className="space-y-1.5">
              <TaskStatusBadge status={task.status} />
              <TaskCard
                task={task}
                showClub={showClub}
                pending={vm.transition.pendingTaskId === task.id}
                onOpen={vm.openTask}
                onAction={vm.transition.requestAction}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </div>
  )
}
