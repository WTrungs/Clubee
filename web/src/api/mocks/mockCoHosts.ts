import type { CoHost, SharedEvent, StaffCandidate } from '@/features/event/model/eventTypes'
import type { ResignBlocker } from '@/features/member/model/memberTypes'
import { db } from './db'
import { can, holdersOf } from './mockAccess'
import { eligibleMembers, membershipOf, personRef } from './mockMembers'
import { eventTarget, notify } from './mockNotifications'
import { endPositions, EVENT_STAFF_ACTIVE, isPositionOpen, positionHolderOf } from './mockPermissions'
import { isTaskActive } from './mockScopes'
import { nowIso } from './mockTime'
import type { DbEvent, DbEventCoHost, DbEventStaff } from './seed/eventSeed'

// Đồng tổ chức theo FR-EVT-08 và ST-COH: CLB chủ trì mời, ban chủ nhiệm CLB được mời trả lời, CLB chủ trì gỡ.

export const clubNameOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.name ?? 'CLB không còn tồn tại'

/** Lời mời còn hiệu lực (Đã gửi, Chấp nhận) của một CLB ở sự kiện; mỗi cặp chỉ có một (409 khi mời trùng). */
export function openCoHostOf(eventId: string, clubId: string): DbEventCoHost | undefined {
  return db.eventCoHosts.find((coHost) => coHost.eventId === eventId && coHost.clubId === clubId && (coHost.status === 'SENT' || coHost.status === 'ACCEPTED'))
}

export function acceptedCoHost(eventId: string, coHostId: string): DbEventCoHost | undefined {
  return db.eventCoHosts.find((coHost) => coHost.id === coHostId && coHost.eventId === eventId && coHost.status === 'ACCEPTED')
}

export const hasAcceptedCoHost = (eventId: string) => db.eventCoHosts.some((coHost) => coHost.eventId === eventId && coHost.status === 'ACCEPTED')

const coHostRows = (coHost: DbEventCoHost) =>
  db.eventStaff.filter((staff) => staff.eventId === coHost.eventId && staff.kind === 'CO_HOST' && staff.homeClubId === coHost.clubId && staff.leftAt === null)

const staffCountOf = (coHost: DbEventCoHost) => new Set(coHostRows(coHost).map((staff) => staff.userId)).size

/** Ứng viên của CLB đồng tổ chức: thành viên Thử việc, Chính thức của CLB đó, chỉ tên và ban (SRS 3.5); ai có tư cách ở CLB chủ trì thì mời như thành viên. */
export function coHostCandidates(event: DbEvent, coHost: DbEventCoHost, keyword: string | null): StaffCandidate[] {
  return eligibleMembers(coHost.clubId, { keyword }).filter((member) => membershipOf(member.id, event.clubId) === undefined)
}

/** Thôi làm nhân sự ngay và kết thúc chức trưởng tiểu ban kèm lý do; việc và dữ liệu họ tạo giữ nguyên (BR-DATA-01). */
function endRows(rows: DbEventStaff[], reason: string): void {
  const at = nowIso()
  for (const row of rows) row.leftAt = at
  const held = new Set(rows.map((row) => `${row.userId}|${row.subcommitteeId}`))
  endPositions((position) => position.role === 'SUBCOMMITTEE_LEAD' && held.has(`${position.userId}|${position.scopeId}`), { reason })
}

/** Gỡ CLB đồng tổ chức: mọi nhân sự của CLB đó ở sự kiện thôi ngay; trả về những người bị gỡ. */
export function endCoHostClubStaff(coHost: DbEventCoHost, reason: string): string[] {
  const rows = coHostRows(coHost)
  endRows(rows, `${clubNameOf(coHost.clubId)} thôi đồng tổ chức: ${reason}`)
  return [...new Set(rows.map((row) => row.userId))]
}

/** Rời CLB gốc thì hết tư cách nhân sự CLB đồng tổ chức ở sự kiện của CLB khác; báo Trưởng BTC (BR-MEM-04, FR-NOT-02). */
export function endCoHostStaffOf(userId: string, homeClubId: string, actorId: string): void {
  const rows = db.eventStaff.filter((staff) => staff.userId === userId && staff.kind === 'CO_HOST' && staff.homeClubId === homeClubId && staff.leftAt === null)
  if (rows.length === 0) return
  const homeName = clubNameOf(homeClubId)
  endRows(rows, `Đã rời ${homeName}.`)
  for (const eventId of new Set(rows.map((row) => row.eventId))) {
    const event = db.events.find((candidate) => candidate.id === eventId)
    if (!event || !EVENT_STAFF_ACTIVE.includes(event.status)) continue
    notify([positionHolderOf('EVENT_LEAD', event.id)], {
      clubId: event.clubId,
      category: 'EVENT',
      title: `${personRef(userId).fullName} thôi làm nhân sự ${event.name}`,
      body: `Người này đã rời ${homeName} nên không còn là nhân sự CLB đồng tổ chức.`,
      target: eventTarget(event.clubId, event.id),
      actorId,
    })
  }
}

/** BR-MEM-03: chức trưởng tiểu ban và việc còn cần làm ở sự kiện chung cũng chặn tự rời CLB gốc. */
export function coHostResignBlockers(userId: string, homeClubId: string): ResignBlocker[] {
  const rows = db.eventStaff.filter((staff) => staff.userId === userId && staff.kind === 'CO_HOST' && staff.homeClubId === homeClubId && staff.leftAt === null)
  const subcommitteeIds = new Set(rows.map((row) => row.subcommitteeId))
  const label = (subcommitteeId: string) => {
    const subcommittee = db.subcommittees.find((candidate) => candidate.id === subcommitteeId)
    const event = db.events.find((candidate) => candidate.id === subcommittee?.eventId)
    return `tiểu ban ${subcommittee?.name ?? ''} (${event?.name ?? ''}, ${clubNameOf(event?.clubId ?? '')})`
  }
  const positions: ResignBlocker[] = db.positions
    .filter((position) => position.userId === userId && position.role === 'SUBCOMMITTEE_LEAD' && subcommitteeIds.has(position.scopeId) && isPositionOpen(position))
    .map((position) => ({ kind: 'POSITION', refId: position.id, clubId: position.clubId, title: `Trưởng ${label(position.scopeId)}` }))
  const tasks = db.tasks.filter((task) => task.scopeType === 'SUBCOMMITTEE' && subcommitteeIds.has(task.scopeId) && isTaskActive(task))
  const owned: ResignBlocker[] = tasks.filter((task) => task.ownerId === userId).map((task) => ({ kind: 'TASK', refId: task.id, clubId: task.clubId, title: task.title }))
  const reviewing: ResignBlocker[] = tasks
    .filter((task) => task.assignerId === userId && task.ownerId !== userId)
    .map((task) => ({ kind: 'TASK_REVIEW', refId: task.id, clubId: task.clubId, title: task.title }))
  return [...positions, ...owned, ...reviewing]
}

/** Ban chủ nhiệm CLB được mời: người có quyền duyệt sự kiện ở CLB đó nhận thông báo và trả lời. */
export const coHostDeciders = (clubId: string) => holdersOf(clubId, 'APPROVE_EVENT')

const refOrNull = (userId: string | null) => (userId ? personRef(userId) : null)

export function toCoHost(coHost: DbEventCoHost, canManage: boolean): CoHost {
  return {
    id: coHost.id,
    club: { id: coHost.clubId, name: clubNameOf(coHost.clubId) },
    status: coHost.status,
    message: coHost.message,
    invitedBy: personRef(coHost.invitedBy),
    invitedAt: coHost.invitedAt,
    decidedAt: coHost.decidedAt,
    decisionNote: coHost.decisionNote,
    removedAt: coHost.removedAt,
    removeReason: coHost.removeReason,
    staffCount: staffCountOf(coHost),
    allowedActions: canManage && coHost.status === 'ACCEPTED' ? ['REMOVE'] : [],
    version: coHost.version,
  }
}

export function toSharedEvent(coHost: DbEventCoHost, viewerId: string): SharedEvent {
  const event = db.events.find((candidate) => candidate.id === coHost.eventId)
  const decides = coHost.status === 'SENT' && event !== undefined && EVENT_STAFF_ACTIVE.includes(event.status) && can(viewerId, coHost.clubId, 'APPROVE_EVENT')
  return {
    id: coHost.id,
    event: {
      id: coHost.eventId,
      name: event?.name ?? 'Sự kiện không còn tồn tại',
      clubId: coHost.hostClubId,
      clubName: clubNameOf(coHost.hostClubId),
      startAt: event?.startAt ?? coHost.invitedAt,
      endAt: event?.endAt ?? coHost.invitedAt,
      status: event?.status ?? 'CANCELLED',
    },
    status: coHost.status,
    message: coHost.message,
    invitedBy: personRef(coHost.invitedBy),
    invitedAt: coHost.invitedAt,
    decidedBy: refOrNull(coHost.decidedBy),
    decidedAt: coHost.decidedAt,
    decisionNote: coHost.decisionNote,
    removedAt: coHost.removedAt,
    removeReason: coHost.removeReason,
    staffCount: staffCountOf(coHost),
    allowedActions: decides ? ['ACCEPT', 'DECLINE'] : [],
    version: coHost.version,
  }
}
