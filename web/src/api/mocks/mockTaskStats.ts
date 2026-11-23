import type { TaskTally } from '@/features/report/model/myReportTypes'
import { toVnDateKey } from '@/shared/format/formatDate'
import type { DbTask } from './seed/taskSeed'

const OPEN_STATUSES = new Set<DbTask['status']>(['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW'])

/** Lúc việc chuyển sang Hoàn thành gần nhất. */
const doneAtOf = (task: DbTask) => task.history.filter((change) => change.toStatus === 'DONE').at(-1)?.at ?? null

/** FR-RPT-02, 03: việc người dùng là người chính; xong trong kỳ tách đúng hạn, trễ hạn; còn mở và quá hạn tính tới `now`. */
export function taskTallyOf(tasks: readonly DbTask[], userId: string, range: { from: string; to: string }, now = Date.now()): TaskTally {
  const owned = tasks.filter((task) => task.ownerId === userId)
  const done = owned
    .filter((task) => task.status === 'DONE')
    .map((task) => ({ task, at: doneAtOf(task) }))
    .filter((row): row is { task: DbTask; at: string } => row.at !== null && toVnDateKey(row.at) >= range.from && toVnDateKey(row.at) <= range.to)
  const open = owned.filter((task) => OPEN_STATUSES.has(task.status))
  return {
    doneOnTime: done.filter((row) => Date.parse(row.at) <= Date.parse(row.task.dueAt)).length,
    doneLate: done.filter((row) => Date.parse(row.at) > Date.parse(row.task.dueAt)).length,
    open: open.length,
    overdue: open.filter((task) => Date.parse(task.dueAt) < now).length,
  }
}
