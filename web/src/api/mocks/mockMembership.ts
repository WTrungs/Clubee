import type { LeaveRequest, MyMembership, MyMembershipAction, ResignBlocker } from '@/features/member/model/memberTypes'
import { db, type DbLeaveRequest, type DbMembership, type DbPosition } from './db'
import { can } from './mockAccess'
import { advanceResignBlockers } from './mockAdvances'
import { problem } from './mockHttp'
import { coHostResignBlockers, endCoHostStaffOf } from './mockCoHosts'
import { closeDepartmentStint, personRef } from './mockMembers'
import { isPositionOpen, positionTitleOf, STANDING_ROLES } from './mockPermissions'
import { isTaskActive } from './mockScopes'
import { openHandoverOf } from './mockTerms'
import { nowIso, vnToday } from './mockTime'

// Luật tạm nghỉ, xin rời dùng chung cho ban chủ nhiệm chuyển trạng thái và thành viên tự xin (FR-MEM-06, 07).

const departmentRef = (departmentId: string | null) => {
  const department = db.departments.find((candidate) => candidate.id === departmentId)
  return department ? { id: department.id, name: department.name } : null
}

/** Chức vụ thường trực chưa kết thúc, kể cả chưa tới ngày bắt đầu, để chức vụ không tự có hiệu lực khi người đó quay lại (BR-MEM-05). */
export function openStandingTitles(membership: Pick<DbMembership, 'userId' | 'clubId'>): string[] {
  return db.positions
    .filter((position) => position.userId === membership.userId && position.clubId === membership.clubId && STANDING_ROLES.includes(position.role) && isPositionOpen(position))
    .map((position) => `${positionTitleOf(position)}${position.startOn > vnToday() ? ' (chưa hiệu lực)' : ''}`)
}

/** Người có tên trong kết quả bầu của phiên bàn giao đang mở sẽ giữ chức vụ thường trực khi bàn giao xong. */
export function isHandoverAppointee(membership: Pick<DbMembership, 'userId' | 'clubId'>): boolean {
  return openHandoverOf(membership.clubId)?.appointments.some((appointment) => appointment.userId === membership.userId) ?? false
}

/** Lý do chưa tạm nghỉ được (BR-MEM-05); rỗng là tạm nghỉ được. */
export function leaveBlockers(membership: DbMembership): string[] {
  const titles = openStandingTitles(membership)
  return [
    ...(titles.length > 0 ? [`Đang giữ chức vụ thường trực: ${titles.join(', ')}. Cần thu hồi chức vụ trước.`] : []),
    ...(isHandoverAppointee(membership) ? ['Có tên trong kết quả bầu của nhiệm kỳ mới.'] : []),
  ]
}

/** BR-MEM-05 ở dạng câu trả về: dùng chung cho ban chủ nhiệm chuyển sang Tạm nghỉ và duyệt yêu cầu tạm nghỉ; null là cho tạm nghỉ được. */
export function putOnLeaveBlock(membership: DbMembership, name: string): Response | null {
  const titles = openStandingTitles(membership)
  if (titles.length > 0) {
    return problem(422, `${name} đang giữ chức vụ thường trực (${titles.join(', ')}). Thu hồi chức vụ trước khi cho tạm nghỉ.`, 'HOLDS_STANDING_POSITION')
  }
  if (isHandoverAppointee(membership)) {
    return problem(422, `${name} có trong kết quả bầu của nhiệm kỳ mới. Bỏ khỏi kết quả bầu trước khi cho tạm nghỉ.`, 'HANDOVER_APPOINTEE')
  }
  return null
}

const eventOfSubcommittee = (subcommitteeId: string) => {
  const eventId = db.subcommittees.find((subcommittee) => subcommittee.id === subcommitteeId)?.eventId
  return db.events.find((event) => event.id === eventId)
}

function positionLabel(position: DbPosition): string {
  if (STANDING_ROLES.includes(position.role)) return positionTitleOf(position)
  if (position.role === 'EVENT_LEAD') return `Trưởng BTC ${db.events.find((event) => event.id === position.scopeId)?.name ?? ''}`.trim()
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === position.scopeId)
  const event = eventOfSubcommittee(position.scopeId)
  return `Trưởng tiểu ban ${subcommittee?.name ?? ''}${event ? ` (${event.name})` : ''}`
}

/** BR-MEM-03: còn chức vụ chưa kết thúc, việc còn cần làm (làm hoặc chờ mình nghiệm thu; việc của sự kiện đã đóng, hủy không tính), hoặc có tên trong kết quả bầu thì chưa tự rời được. */
export function resignBlockers(membership: DbMembership): ResignBlocker[] {
  const { userId, clubId } = membership
  const positions: ResignBlocker[] = db.positions
    .filter((position) => position.userId === userId && position.clubId === clubId && isPositionOpen(position))
    .map((position) => ({ kind: 'POSITION', refId: position.id, clubId, title: positionLabel(position) }))
  const tasks = db.tasks.filter((task) => task.clubId === clubId && isTaskActive(task))
  const owned: ResignBlocker[] = tasks.filter((task) => task.ownerId === userId).map((task) => ({ kind: 'TASK', refId: task.id, clubId, title: task.title }))
  const reviewing: ResignBlocker[] = tasks
    .filter((task) => task.assignerId === userId && task.ownerId !== userId)
    .map((task) => ({ kind: 'TASK_REVIEW', refId: task.id, clubId, title: task.title }))
  const appointment: ResignBlocker[] = isHandoverAppointee(membership)
    ? [{ kind: 'APPOINTMENT', refId: openHandoverOf(clubId)?.id ?? '', clubId, title: 'Kết quả bầu của nhiệm kỳ mới' }]
    : []
  // Trưởng tiểu ban, việc ở sự kiện chung của CLB khác mà người này tham gia nhờ CLB này (FR-EVT-08).
  return [...positions, ...owned, ...reviewing, ...coHostResignBlockers(userId, clubId), ...advanceResignBlockers(userId, clubId), ...appointment]
}

/** Đóng yêu cầu tạm nghỉ đang chờ khi tư cách đổi ở chỗ khác (ban chủ nhiệm cho tạm nghỉ, đưa ra, hoặc người đó tự rời). */
export function closePendingLeaveRequest(membershipId: string, status: 'APPROVED' | 'WITHDRAWN' | 'CLOSED', actorId: string, note: string | null): void {
  const pending = db.leaveRequests.find((request) => request.membershipId === membershipId && request.status === 'PENDING')
  if (!pending) return
  Object.assign(pending, { status, decidedBy: actorId, decidedAt: nowIso(), decisionNote: note, version: pending.version + 1 })
}

/** FR-MEM-07: tự xin rời có hiệu lực ngay; rút khỏi BTC các sự kiện của CLB và sự kiện chung ở CLB khác, tên vẫn giữ trong lịch sử (BR-MEM-02). */
export function resignFromClub(membership: DbMembership, reason: string): void {
  const today = vnToday()
  const at = nowIso()
  const fromStatus = membership.status
  Object.assign(membership, { status: 'LEFT', leftOn: today, exitKind: 'RESIGNED', leaveReason: reason })
  closeDepartmentStint(membership, today)
  const clubEvents = new Set(db.events.filter((event) => event.clubId === membership.clubId).map((event) => event.id))
  for (const staff of db.eventStaff) {
    if (staff.userId === membership.userId && clubEvents.has(staff.eventId) && staff.leftAt === null) staff.leftAt = at
  }
  endCoHostStaffOf(membership.userId, membership.clubId, membership.userId)
  closePendingLeaveRequest(membership.id, 'WITHDRAWN', membership.userId, 'Người gửi đã rời CLB.')
  membership.history.push({ at, actorId: membership.userId, fromStatus, toStatus: 'LEFT', reason })
  membership.version += 1
}

export function toLeaveRequest(request: DbLeaveRequest, viewerId: string): LeaveRequest {
  const membership = db.memberships.find((candidate) => candidate.id === request.membershipId)
  const pending = request.status === 'PENDING'
  const decides = pending && request.userId !== viewerId && can(viewerId, request.clubId, 'MANAGE_MEMBERS')
  return {
    id: request.id,
    membershipId: request.membershipId,
    member: personRef(request.userId),
    department: departmentRef(membership?.departmentId ?? null),
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt,
    decidedBy: request.decidedBy ? personRef(request.decidedBy) : null,
    decidedAt: request.decidedAt,
    decisionNote: request.decisionNote,
    blockers: pending && membership ? leaveBlockers(membership) : [],
    allowedActions: decides ? ['APPROVE', 'REJECT'] : [],
    version: request.version,
  }
}

/** Yêu cầu gần nhất của lần sinh hoạt này; lần sinh hoạt trước có mã tư cách khác. */
export const latestLeaveRequestOf = (membershipId: string) => db.leaveRequests.filter((request) => request.membershipId === membershipId).at(-1)

export function toMyMembership(membership: DbMembership): MyMembership {
  const latest = latestLeaveRequestOf(membership.id)
  const pending = latest?.status === 'PENDING'
  const active = membership.status !== 'LEFT' && membership.status !== 'PENDING'
  const actions: MyMembershipAction[] = [
    ...(membership.status === 'ACTIVE' && !pending ? (['REQUEST_LEAVE'] as const) : []),
    ...(pending ? (['WITHDRAW_LEAVE_REQUEST'] as const) : []),
    ...(membership.status === 'ON_LEAVE' ? (['RETURN'] as const) : []),
    ...(active ? (['RESIGN'] as const) : []),
  ]
  return {
    membershipId: membership.id,
    status: membership.status,
    department: departmentRef(membership.departmentId),
    joinedOn: membership.joinedOn,
    leaveRequest: latest ? toLeaveRequest(latest, membership.userId) : null,
    leaveBlockers: membership.status === 'ACTIVE' ? leaveBlockers(membership) : [],
    resignBlockers: active ? resignBlockers(membership) : [],
    allowedActions: actions,
    version: membership.version,
  }
}
