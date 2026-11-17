import { formatDateTime } from '@/shared/format/formatDate'
import { db } from './db'
import { notify, taskTarget } from './mockNotifications'
import { registerJob, SYSTEM_ACTOR } from './mockSchedule'
import { hasTaskAccess, isTaskActive, isTaskOverdue } from './mockScopes'
import { nowIso, vnStartOfDay } from './mockTime'
import type { DbTask } from './seed/taskSeed'

const DAY_MS = 24 * 60 * 60 * 1000

const reminderDaysOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.taskReminderDays ?? 0

/** Nhắc trước N ngày: hạn rơi vào hôm nay đến hết N ngày tới (giờ Việt Nam) và chưa qua (FR-TASK-06, SRS 9.2); CLB đặt 0 thì không nhắc. */
export function isDueSoon(task: DbTask, now = Date.now()): boolean {
  const days = reminderDaysOf(task.clubId)
  const due = Date.parse(task.dueAt)
  return days > 0 && isTaskActive(task) && due >= now && due < vnStartOfDay(now) + (days + 1) * DAY_MS
}

/** FR-TASK-06: nhắc người chính một lần cho mỗi hạn; quá hạn ghi một mốc và báo người chính, người giao một lần cho mỗi hạn. */
export function runTaskDeadlines(): void {
  const now = Date.now()
  for (const task of db.tasks) {
    if (!isTaskActive(task)) continue
    const input = { clubId: task.clubId, category: 'TASK' as const, target: taskTarget(task.clubId, task.id), actorId: SYSTEM_ACTOR }
    // Người đã mất quyền với việc (bị đưa ra khỏi CLB, rời tiểu ban) không nhận tin về việc nội bộ (BR-MEM-04).
    const stillOn = (userIds: string[]) => userIds.filter((userId) => hasTaskAccess(task, userId))
    // So mốc thời gian chứ không so chuỗi, vì cùng một hạn có thể ghi bằng múi giờ khác nhau.
    const sameDue = (value: string | null) => value !== null && Date.parse(value) === Date.parse(task.dueAt)
    if (isDueSoon(task, now) && !sameDue(task.remindedFor)) {
      task.remindedFor = task.dueAt
      notify(stillOn([task.ownerId]), { ...input, title: `Việc sắp đến hạn: ${task.title}`, body: `Hạn: ${formatDateTime(task.dueAt)}.` })
    }
    if (isTaskOverdue(task) && !task.overdueLog.some((mark) => sameDue(mark.dueAt))) {
      task.overdueLog.push({ dueAt: task.dueAt, flaggedAt: nowIso() })
      notify(stillOn([task.ownerId, task.assignerId]), { ...input, title: `Việc quá hạn: ${task.title}`, body: `Hạn: ${formatDateTime(task.dueAt)}.` })
    }
  }
}

registerJob('taskDeadlines', runTaskDeadlines)
