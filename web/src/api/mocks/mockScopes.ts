import type { AssignableMember, AssignableScope, TaskScope, TaskScopeType } from '@/features/task/model/taskTypes'
import { db } from './db'
import type { DbTask } from './seed/taskSeed'
import { can } from './mockAccess'
import { canAccessClub, departmentNameOf, eligibleMembers, isActiveMember, personRef } from './mockMembers'
import { EVENT_STAFF_ACTIVE, hasPosition, isBoardMember } from './mockPermissions'

/** Việc của tiểu ban thuộc sự kiện Đã đóng, Đã hủy chỉ còn để tra cứu (FR-EVT-16); null là việc không bị khóa. */
export function lockedEventStatusOf(task: Pick<DbTask, 'scopeType' | 'scopeId'>): 'CLOSED' | 'CANCELLED' | null {
  if (task.scopeType !== 'SUBCOMMITTEE') return null
  const eventId = db.subcommittees.find((subcommittee) => subcommittee.id === task.scopeId)?.eventId
  const status = db.events.find((event) => event.id === eventId)?.status
  return status === 'CLOSED' || status === 'CANCELLED' ? status : null
}

/** Việc còn cần làm: chưa Hoàn thành, chưa Đã hủy và sự kiện của nó chưa khóa. */
export function isTaskActive(task: Pick<DbTask, 'status' | 'scopeType' | 'scopeId'>): boolean {
  return task.status !== 'DONE' && task.status !== 'CANCELLED' && lockedEventStatusOf(task) === null
}

/** Mất tư cách thành viên thì mất quyền với việc ngay (BR-MEM-04); CTV, nhân sự CLB đồng tổ chức vẫn làm việc của tiểu ban. */
export function hasTaskAccess(task: Pick<DbTask, 'clubId' | 'scopeType' | 'scopeId'>, userId: string): boolean {
  if (canAccessClub(userId, task.clubId)) return true
  return (
    task.scopeType === 'SUBCOMMITTEE' &&
    db.eventStaff.some((staff) => staff.subcommitteeId === task.scopeId && staff.userId === userId && staff.leftAt === null && staff.kind !== 'MEMBER')
  )
}

/** Việc đang làm (cùng nghĩa ở báo cáo, khối lượng việc, cảnh báo quá tải): Mới giao, Đang làm, Chờ nghiệm thu. */
export const OPEN_TASK_STATUSES: ReadonlySet<DbTask['status']> = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW'])

/** FR-TASK-09: số việc đang làm chính của một người trong CLB; việc của sự kiện đã đóng, hủy không tính. */
export const openTaskCountOf = (userId: string, clubId: string) =>
  db.tasks.filter((task) => task.clubId === clubId && task.ownerId === userId && OPEN_TASK_STATUSES.has(task.status) && isTaskActive(task)).length

/** BR-TASK-03: quá hạn khi đã qua hạn mà việc còn cần làm; việc của sự kiện đã đóng, hủy không bị gắn cờ. */
export function isTaskOverdue(task: Pick<DbTask, 'status' | 'dueAt' | 'scopeType' | 'scopeId'>): boolean {
  return isTaskActive(task) && Date.parse(task.dueAt) < Date.now()
}

/** Nhân sự còn trong tiểu ban; thành viên CLB phải còn Thử việc hoặc Chính thức (BR-TASK-01, BR-MEM-05). */
export function subcommitteeMembers(subcommitteeId: string, clubId: string): AssignableMember[] {
  return db.eventStaff
    .filter((staff) => staff.subcommitteeId === subcommitteeId && staff.leftAt === null)
    // Thành viên CLB chủ trì, nhân sự CLB đồng tổ chức phải còn Thử việc, Chính thức ở CLB của họ; CTV thì không xét.
    .filter((staff) => staff.kind === 'COLLABORATOR' || isActiveMember(staff.userId, staff.kind === 'CO_HOST' ? (staff.homeClubId ?? '') : clubId))
    .map((staff) => ({ ...personRef(staff.userId), departmentName: departmentNameOf(staff.userId, staff.homeClubId ?? clubId), openTaskCount: openTaskCountOf(staff.userId, clubId) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}

const departmentLabel = (name: string) => `Ban ${name}`

export function resolveScope(type: TaskScopeType, id: string): TaskScope {
  if (type === 'DEPARTMENT') {
    const department = db.departments.find((candidate) => candidate.id === id)
    return { type, id, name: department ? departmentLabel(department.name) : 'Ban không còn tồn tại', eventId: null, eventName: null }
  }
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === id)
  const event = db.events.find((candidate) => candidate.id === subcommittee?.eventId)
  return {
    type,
    id,
    name: subcommittee ? `Tiểu ban ${subcommittee.name}` : 'Tiểu ban',
    eventId: event?.id ?? null,
    eventName: event?.name ?? null,
  }
}

const overloadThresholdOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.taskOverloadThreshold ?? 5

/** Phạm vi người dùng được giao việc trong CLB (FR-TASK-01, BR-TASK-01, SRS 3.1); ban đã đóng không nhận việc mới. */
export function assignableScopes(userId: string, clubId: string): AssignableScope[] {
  const departments: AssignableScope[] = db.departments
    .filter((department) => department.clubId === clubId && department.status === 'ACTIVE')
    .filter((department) => can(userId, clubId, 'ASSIGN_TASK', { type: 'DEPARTMENT', id: department.id }))
    .map((department) => ({
      type: 'DEPARTMENT',
      id: department.id,
      name: departmentLabel(department.name),
      eventName: null,
      members: eligibleMembers(clubId, { departmentId: department.id }).map((member) => ({ ...member, openTaskCount: openTaskCountOf(member.id, clubId) })),
      overloadThreshold: overloadThresholdOf(clubId),
    }))

  const subcommittees: AssignableScope[] = db.subcommittees.flatMap((subcommittee) => {
    const event = db.events.find((candidate) => candidate.id === subcommittee.eventId)
    if (!event || event.clubId !== clubId || !EVENT_STAFF_ACTIVE.includes(event.status)) return []
    if (!can(userId, clubId, 'ASSIGN_TASK', { type: 'SUBCOMMITTEE', id: subcommittee.id })) return []
    return [
      {
        type: 'SUBCOMMITTEE' as const,
        id: subcommittee.id,
        name: `Tiểu ban ${subcommittee.name}`,
        eventName: event.name,
        members: subcommitteeMembers(subcommittee.id, clubId),
        overloadThreshold: overloadThresholdOf(clubId),
      },
    ]
  })
  return [...departments, ...subcommittees]
}

/** Ai xem được mọi việc trong một phạm vi; không xét ban còn mở hay sự kiện còn chạy để tra cứu lịch sử (BR-TERM-04, SRS 3.5). */
export function managesScope(userId: string, clubId: string, type: TaskScopeType, scopeId: string): boolean {
  if (isBoardMember(userId, clubId)) return true
  if (type === 'DEPARTMENT') return hasPosition(userId, 'DEPARTMENT_HEAD', scopeId) || hasPosition(userId, 'DEPARTMENT_VICE_HEAD', scopeId)
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === scopeId)
  return subcommittee !== undefined && (hasPosition(userId, 'EVENT_LEAD', subcommittee.eventId) || hasPosition(userId, 'SUBCOMMITTEE_LEAD', scopeId))
}
