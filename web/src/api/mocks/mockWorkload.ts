import type { Workload, WorkloadRow, WorkloadScope } from '@/features/task/model/taskTypes'
import { db } from './db'
import { leadsDepartment } from './mockClubReport'
import { canAccessClub, departmentNameOf, membershipOf, personRef, ROSTER_STATUSES } from './mockMembers'
import { EVENT_STAFF_ACTIVE, hasPosition, isBoardMember, positionHolderOf } from './mockPermissions'
import { isTaskActive, isTaskOverdue } from './mockScopes'
import type { DbTask } from './seed/taskSeed'

const OPEN_STATUSES = new Set<DbTask['status']>(['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW'])

/** FR-TASK-08: ban chủ nhiệm xem toàn CLB, từng ban, từng sự kiện; Trưởng ban, Phó ban xem ban mình; Trưởng BTC xem sự kiện mình. */
export function workloadScopesOf(userId: string, clubId: string): WorkloadScope[] {
  if (!canAccessClub(userId, clubId)) return []
  const board = isBoardMember(userId, clubId)
  const departments = db.departments
    .filter((department) => department.clubId === clubId && department.status === 'ACTIVE' && (board || leadsDepartment(userId, department)))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
  const events = db.events
    .filter((event) => event.clubId === clubId && EVENT_STAFF_ACTIVE.includes(event.status) && (board || hasPosition(userId, 'EVENT_LEAD', event.id)))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
  return [
    ...(board ? [{ type: 'CLUB' as const, id: null, name: 'Toàn CLB' }] : []),
    ...departments.map((department) => ({ type: 'DEPARTMENT' as const, id: department.id, name: `Ban ${department.name}` })),
    ...events.map((event) => ({ type: 'EVENT' as const, id: event.id, name: `Sự kiện ${event.name}` })),
  ]
}

const subcommitteeName = (id: string) => db.subcommittees.find((subcommittee) => subcommittee.id === id)?.name ?? 'Tiểu ban'

/** Việc còn cần làm trong phạm vi; việc của sự kiện đã đóng, hủy không tính (`isTaskActive`). */
function tasksIn(clubId: string, scope: WorkloadScope): DbTask[] {
  return db.tasks.filter((task) => {
    if (task.clubId !== clubId || !isTaskActive(task)) return false
    if (scope.type === 'CLUB') return true
    if (scope.type === 'DEPARTMENT') return task.scopeType === 'DEPARTMENT' && task.scopeId === scope.id
    return task.scopeType === 'SUBCOMMITTEE' && db.subcommittees.some((subcommittee) => subcommittee.id === task.scopeId && subcommittee.eventId === scope.id)
  })
}

/** Người thuộc phạm vi kèm ghi chú (ban chính hoặc vai trong BTC); người ngoài phạm vi còn giữ việc được thêm sau. */
function peopleIn(clubId: string, scope: WorkloadScope): Map<string, string | null> {
  const people = new Map<string, string | null>()
  if (scope.type === 'EVENT') {
    const leadId = positionHolderOf('EVENT_LEAD', scope.id ?? '')
    if (leadId) people.set(leadId, 'Trưởng BTC')
    for (const staff of db.eventStaff.filter((candidate) => candidate.eventId === scope.id && candidate.leftAt === null)) {
      if (people.has(staff.userId)) continue
      const kind = staff.kind === 'COLLABORATOR' ? ' · CTV' : staff.kind === 'CO_HOST' ? ' · CLB đồng tổ chức' : ''
      people.set(staff.userId, `Tiểu ban ${subcommitteeName(staff.subcommitteeId)}${kind}`)
    }
    return people
  }
  for (const membership of db.memberships) {
    if (membership.clubId !== clubId || !ROSTER_STATUSES.includes(membership.status)) continue
    if (scope.type === 'DEPARTMENT' && membership.departmentId !== scope.id) continue
    people.set(membership.userId, scope.type === 'CLUB' ? departmentNameOf(membership.userId, clubId) : null)
  }
  return people
}

/** Ghi chú cho người còn giữ việc mở trong phạm vi mà không còn thuộc phạm vi (chuyển ban, CTV, rời CLB). */
function outsiderNote(userId: string, clubId: string, scope: WorkloadScope): string {
  const membership = membershipOf(userId, clubId)
  if (!membership) return scope.type === 'CLUB' ? 'Không phải thành viên CLB (CTV hoặc nhân sự CLB đồng tổ chức)' : 'Không còn thuộc phạm vi'
  const department = departmentNameOf(userId, clubId)
  return department ? `Nay thuộc ban ${department}` : 'Không còn thuộc phạm vi'
}

export function workloadOf(clubId: string, scope: WorkloadScope): Workload {
  const tasks = tasksIn(clubId, scope)
  const people = peopleIn(clubId, scope)
  for (const task of tasks) {
    for (const userId of [task.ownerId, ...task.collaboratorIds]) if (!people.has(userId)) people.set(userId, outsiderNote(userId, clubId, scope))
  }
  const rows: WorkloadRow[] = [...people].map(([userId, detail]) => {
    const owned = tasks.filter((task) => task.ownerId === userId && OPEN_STATUSES.has(task.status))
    return {
      person: personRef(userId),
      detail,
      onLeave: membershipOf(userId, clubId)?.status === 'ON_LEAVE',
      open: owned.length,
      overdue: owned.filter((task) => isTaskOverdue(task)).length,
      collaborating: tasks.filter((task) => task.collaboratorIds.includes(userId) && OPEN_STATUSES.has(task.status)).length,
    }
  })
  return {
    scope,
    rows: rows.toSorted((a, b) => b.open - a.open || b.overdue - a.overdue || a.person.fullName.localeCompare(b.person.fullName, 'vi')),
  }
}
