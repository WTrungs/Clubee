import type { StaffEventSummary } from '@/features/account/model/accountTypes'
import { db } from './db'
import { canAccessClub } from './mockMembers'
import { eventTarget, notify } from './mockNotifications'
import { endPositions, EVENT_STAFF_ACTIVE, grantPosition, hasPosition, positionHolderOf } from './mockPermissions'
import { nowIso } from './mockTime'
import type { DbEvent, DbSubcommittee } from './seed/eventSeed'

/** BR-ORG-04: mỗi người chỉ làm trưởng một tiểu ban trong cùng sự kiện. */
export function leadsOtherSubcommittee(eventId: string, userId: string, exceptSubcommitteeId?: string): boolean {
  return db.subcommittees.some((subcommittee) => subcommittee.eventId === eventId && subcommittee.id !== exceptSubcommitteeId && positionHolderOf('SUBCOMMITTEE_LEAD', subcommittee.id) === userId)
}

/** Chỉ định trưởng tiểu ban; người chưa là nhân sự của tiểu ban thì được thêm vào (FR-EVT-04). Nơi gọi kiểm BR-ORG-01, BR-ORG-04. */
export function assignSubcommitteeLead(event: DbEvent, subcommittee: DbSubcommittee, userId: string, actorId: string): void {
  const alreadyStaff = db.eventStaff.some((staff) => staff.subcommitteeId === subcommittee.id && staff.userId === userId && staff.leftAt === null)
  if (!alreadyStaff) db.eventStaff.push({ userId, eventId: event.id, subcommitteeId: subcommittee.id, kind: 'MEMBER', joinedAt: nowIso(), leftAt: null })
  grantPosition({ userId, clubId: event.clubId, role: 'SUBCOMMITTEE_LEAD', scopeId: subcommittee.id, assignedBy: actorId })
  notify([userId], { clubId: event.clubId, category: 'EVENT', title: `Bạn được chọn làm Trưởng tiểu ban ${subcommittee.name} của ${event.name}`, target: eventTarget(event.clubId, event.id), actorId })
}

/** Thay Trưởng BTC từ hôm nay: chức cũ kết thúc hôm qua, giữ bản ghi kèm lý do; báo cả người cũ và người mới (FR-NOT-02). */
export function replaceEventLead(event: DbEvent, newLeadId: string, actorId: string, reason: string): void {
  const previousId = positionHolderOf('EVENT_LEAD', event.id)
  if (previousId === newLeadId) return
  endPositions((position) => position.role === 'EVENT_LEAD' && position.scopeId === event.id, { reason })
  grantPosition({ userId: newLeadId, clubId: event.clubId, role: 'EVENT_LEAD', scopeId: event.id, assignedBy: actorId })
  const target = eventTarget(event.clubId, event.id)
  notify([previousId], { clubId: event.clubId, category: 'EVENT', title: `Bạn thôi làm Trưởng BTC ${event.name}`, body: `Lý do: ${reason}`, target, actorId })
  notify([newLeadId], { clubId: event.clubId, category: 'EVENT', title: `Bạn được chọn làm Trưởng BTC ${event.name}`, target, actorId })
}

/** Trưởng BTC còn hiệu lực; chức vụ sự kiện hết khi sự kiện Đã đóng hoặc Đã hủy (BR-ORG-03). */
export function isEventLead(userId: string, event: DbEvent): boolean {
  return EVENT_STAFF_ACTIVE.includes(event.status) && hasPosition(userId, 'EVENT_LEAD', event.id)
}

/** Nhân sự BTC còn trong tiểu ban; `outsideOnly` chỉ tính CTV và nhân sự CLB đồng tổ chức. */
export function isEventStaff(userId: string, event: DbEvent, { outsideOnly = false } = {}): boolean {
  return (
    EVENT_STAFF_ACTIVE.includes(event.status) &&
    db.eventStaff.some((staff) => staff.eventId === event.id && staff.userId === userId && staff.leftAt === null && (!outsideOnly || staff.kind !== 'MEMBER'))
  )
}

/** Sự kiện người dùng đang làm BTC ở CLB mà họ không là thành viên, ví dụ CTV (FR-ACC-06). */
export function staffEventsOf(userId: string): StaffEventSummary[] {
  return db.events
    .filter((event) => EVENT_STAFF_ACTIVE.includes(event.status) && !canAccessClub(userId, event.clubId))
    .flatMap((event) => {
      const staff = db.eventStaff.find(
        (candidate) => candidate.eventId === event.id && candidate.userId === userId && candidate.leftAt === null && candidate.kind !== 'MEMBER',
      )
      const lead = hasPosition(userId, 'EVENT_LEAD', event.id)
      if (!staff && !lead) return []
      const club = db.clubs.find((candidate) => candidate.id === event.clubId)
      return [
        {
          eventId: event.id,
          eventName: event.name,
          clubId: event.clubId,
          clubName: club?.name ?? '',
          roleTitle: lead ? 'Trưởng BTC' : staff?.kind === 'COLLABORATOR' ? 'Cộng tác viên' : 'Nhân sự BTC',
        },
      ]
    })
}
