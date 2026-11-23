import type { EventProgress, EventReport, EventStaffStats, TaskProgressCounts } from '@/features/event/model/eventTypes'
import { db } from './db'
import { eventActivity, eventAttendanceAvailable, isAttendanceOpen, sheetEntries, sheetStateOf } from './mockAttendance'
import { tallyAttendance } from './mockAttendanceStats'
import { openAdvanceCountOf } from './mockAdvances'
import { PENDING_STATUSES, canViewFund, canViewRequests, eventFundOf, flowFor, fundBalance } from './mockFinance'
import { personRef } from './mockMembers'
import { isBoardMember, positionHolderOf } from './mockPermissions'
import { isTaskOverdue } from './mockScopes'
import { isEventLead } from './mockStaffEvents'
import type { DbEvent } from './seed/eventSeed'
import type { DbTask } from './seed/taskSeed'

const OPEN_TASK: ReadonlySet<DbTask['status']> = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW'])
const emptyCounts = (): TaskProgressCounts => ({ total: 0, assigned: 0, inProgress: 0, pendingReview: 0, done: 0, overdue: 0 })

/** Đếm việc theo trạng thái, bỏ việc Đã hủy; quá hạn tính theo BR-TASK-03. */
function countTasks(tasks: readonly DbTask[]): TaskProgressCounts {
  const counts = emptyCounts()
  for (const task of tasks) {
    if (task.status === 'CANCELLED') continue
    counts.total += 1
    if (task.status === 'ASSIGNED') counts.assigned += 1
    if (task.status === 'IN_PROGRESS') counts.inProgress += 1
    if (task.status === 'PENDING_REVIEW') counts.pendingReview += 1
    if (task.status === 'DONE') counts.done += 1
    if (isTaskOverdue(task)) counts.overdue += 1
  }
  return counts
}

const subcommitteesOf = (event: DbEvent) => db.subcommittees.filter((subcommittee) => subcommittee.eventId === event.id)
const tasksOf = (subcommitteeId: string) => db.tasks.filter((task) => task.scopeType === 'SUBCOMMITTEE' && task.scopeId === subcommitteeId)

/** FR-EVT-09: số việc theo tiểu ban, không lộ nội dung việc. */
export function eventProgress(event: DbEvent): EventProgress {
  const subcommittees = subcommitteesOf(event)
  return {
    total: countTasks(subcommittees.flatMap((subcommittee) => tasksOf(subcommittee.id))),
    subcommittees: subcommittees.map((subcommittee) => ({ id: subcommittee.id, name: subcommittee.name, counts: countTasks(tasksOf(subcommittee.id)) })),
  }
}

/** Chi tiết theo người chỉ Trưởng BTC và ban chủ nhiệm CLB chủ trì xem (FR-RPT-03, phần BTC). */
export const canViewStaffStats = (userId: string, event: DbEvent) => isBoardMember(userId, event.clubId) || isEventLead(userId, event)

function registrationStats(event: DbEvent): EventReport['registrations'] {
  const count = (status: string) => db.registrations.filter((registration) => registration.eventId === event.id && registration.status === status).length
  return { capacity: event.capacity, confirmed: count('CONFIRMED'), waitlisted: count('WAITLISTED'), reconfirmPending: count('RECONFIRM_PENDING'), cancelled: count('CANCELLED') }
}

/** Mỗi ngày của sự kiện: đối tượng (người giữ chỗ, sau khi chốt là người có bản ghi) và đếm trạng thái của các bản ghi. */
function attendanceDays(event: DbEvent): EventReport['attendance'] {
  if (!eventAttendanceAvailable(event)) return []
  const activity = eventActivity(event)
  return activity.days.map((day) => {
    const entries = sheetEntries(activity, day)
    return {
      day,
      closed: sheetStateOf(activity, day).closedAt !== null,
      expected: entries.filter((entry) => !entry.extra).length,
      tally: tallyAttendance(entries.flatMap((entry) => (entry.record ? [entry.record.status] : []))),
    }
  })
}

/** Trưởng BTC rồi nhân sự còn trong tiểu ban; số việc là việc mình làm chính trong các tiểu ban của sự kiện. */
function staffStats(event: DbEvent): EventStaffStats[] {
  const subcommittees = subcommitteesOf(event)
  const tasks = subcommittees.flatMap((subcommittee) => tasksOf(subcommittee.id)).filter((task) => task.status !== 'CANCELLED')
  // Chỉ tính ngày đã mở điểm danh, để ngày chưa tới không đọc thành vắng.
  const activity = eventAttendanceAvailable(event) ? eventActivity(event) : null
  const days = activity ? activity.days.filter((day) => isAttendanceOpen(activity, day) || sheetStateOf(activity, day).closedAt !== null) : []
  const leadId = positionHolderOf('EVENT_LEAD', event.id, { includeEnded: true })
  const members = db.eventStaff.filter((staff) => staff.eventId === event.id && staff.leftAt === null && staff.userId !== leadId)
  const rows: Array<Pick<EventStaffStats, 'subcommitteeName' | 'role'> & { userId: string }> = [
    ...(leadId ? [{ userId: leadId, subcommitteeName: null, role: 'LEAD' as const }] : []),
    ...members.map((staff) => ({
      userId: staff.userId,
      subcommitteeName: subcommittees.find((subcommittee) => subcommittee.id === staff.subcommitteeId)?.name ?? null,
      role: staff.kind,
    })),
  ]
  return rows.map(({ userId, subcommitteeName, role }) => {
    const owned = tasks.filter((task) => task.ownerId === userId)
    const presentDays = days.filter((day) =>
      db.attendance.some(
        (record) =>
          record.activityType === 'EVENT' && record.activityId === event.id && record.day === day && record.userId === userId && (record.status === 'PRESENT' || record.status === 'LATE'),
      ),
    ).length
    return {
      person: personRef(userId),
      subcommitteeName,
      role,
      open: owned.filter((task) => OPEN_TASK.has(task.status)).length,
      done: owned.filter((task) => task.status === 'DONE').length,
      overdue: owned.filter((task) => isTaskOverdue(task)).length,
      presentDays,
      days: days.length,
    }
  })
}

function fundStats(event: DbEvent, userId: string): EventReport['fund'] {
  const fund = eventFundOf(event.id)
  if (!fund || !canViewFund(userId, fund)) return null
  const posted = db.transactions.filter((transaction) => transaction.status === 'POSTED' && (transaction.fundId === fund.id || transaction.targetFundId === fund.id))
  const sum = (flow: 'IN' | 'OUT') => posted.filter((transaction) => flowFor(transaction, fund.id) === flow).reduce((total, transaction) => total + transaction.amount, 0)
  // Khoản chờ theo cùng luật với tab Quỹ: chỉ ban chủ nhiệm và Trưởng BTC.
  const pending = canViewRequests(userId, fund) ? db.transactions.filter((transaction) => transaction.fundId === fund.id && PENDING_STATUSES.includes(transaction.status)) : null
  return {
    balance: fundBalance(fund.id),
    income: sum('IN'),
    expense: sum('OUT'),
    pendingCount: pending ? pending.length : null,
    pendingAmount: pending ? pending.reduce((total, transaction) => total + transaction.amount, 0) : null,
    openAdvanceCount: openAdvanceCountOf(fund.id),
  }
}

/** FR-RPT-05: báo cáo sự kiện; phần theo người và phần quỹ trả `null` với người không được xem. */
export function eventReport(event: DbEvent, userId: string): EventReport {
  return {
    registrations: registrationStats(event),
    attendance: attendanceDays(event),
    tasks: eventProgress(event),
    staff: canViewStaffStats(userId, event) ? staffStats(event) : null,
    fund: fundStats(event, userId),
  }
}
