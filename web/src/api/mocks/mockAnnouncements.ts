import type { AnnouncementAudience, AnnouncementAudienceRef } from '@/features/notification/model/notificationTypes'
import { db } from './db'
import { canAccessClub, ROSTER_STATUSES } from './mockMembers'
import { can, type AccessScope } from './mockAccess'
import { EVENT_STAFF_ACTIVE, positionHolderOf } from './mockPermissions'

interface AudienceGroup extends AnnouncementAudienceRef {
  label: string
  recipients: string[]
}

const unique = (userIds: Array<string | null>) => [...new Set(userIds.filter((userId): userId is string => userId !== null))]

function clubRoster(clubId: string, departmentId?: string): string[] {
  return db.memberships
    .filter((membership) => membership.clubId === clubId && ROSTER_STATUSES.includes(membership.status))
    .filter((membership) => departmentId === undefined || membership.departmentId === departmentId)
    .map((membership) => membership.userId)
}

/** Ban tổ chức: Trưởng BTC, trưởng các tiểu ban và nhân sự còn hiệu lực. */
function eventStaffOf(eventId: string): string[] {
  return unique([
    positionHolderOf('EVENT_LEAD', eventId),
    ...db.subcommittees.filter((subcommittee) => subcommittee.eventId === eventId).map((subcommittee) => positionHolderOf('SUBCOMMITTEE_LEAD', subcommittee.id)),
    ...db.eventStaff.filter((staff) => staff.eventId === eventId && staff.leftAt === null).map((staff) => staff.userId),
  ])
}

/** FR-NOT-01: nhóm nhận nằm trong phạm vi chức vụ có quyền gửi; mặc định ban chủ nhiệm chọn mọi nhóm, Trưởng, Phó ban chọn ban mình, Trưởng BTC chọn BTC sự kiện mình. */
function audienceGroups(userId: string, clubId: string): AudienceGroup[] {
  const club = db.clubs.find((candidate) => candidate.id === clubId)
  if (!club || !canAccessClub(userId, clubId)) return []
  const sends = (scope: AccessScope) => can(userId, clubId, 'SEND_ANNOUNCEMENT', scope)
  const clubGroup: AudienceGroup[] = sends({ type: 'CLUB' }) ? [{ kind: 'CLUB', scopeId: clubId, label: 'Toàn CLB', recipients: clubRoster(clubId) }] : []
  const departments: AudienceGroup[] = db.departments
    .filter((department) => department.clubId === clubId && department.status === 'ACTIVE')
    .filter((department) => sends({ type: 'DEPARTMENT', id: department.id }))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((department) => ({ kind: 'DEPARTMENT', scopeId: department.id, label: `Ban ${department.name}`, recipients: clubRoster(clubId, department.id) }))
  const events: AudienceGroup[] = db.events
    .filter((event) => event.clubId === clubId && EVENT_STAFF_ACTIVE.includes(event.status))
    .filter((event) => sends({ type: 'EVENT', id: event.id }))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .map((event) => ({ kind: 'EVENT_STAFF', scopeId: event.id, label: `BTC ${event.name}`, recipients: eventStaffOf(event.id) }))
  return [...clubGroup, ...departments, ...events]
}

export function announcementAudiences(userId: string, clubId: string): AnnouncementAudience[] {
  return audienceGroups(userId, clubId).map(({ recipients, ...group }) => ({
    ...group,
    recipientCount: recipients.filter((recipient) => recipient !== userId).length,
  }))
}

/** BR-SEC-02: người nhận còn thuộc nhóm nhận lúc mở; BTC gồm cả CTV, nhân sự CLB đồng tổ chức khi sự kiện còn hoạt động. */
export function isInAudience(userId: string, clubId: string, audience: AnnouncementAudienceRef): boolean {
  if (audience.kind === 'CLUB') return canAccessClub(userId, clubId)
  if (audience.kind === 'DEPARTMENT') return clubRoster(clubId, audience.scopeId).includes(userId)
  const event = db.events.find((candidate) => candidate.id === audience.scopeId && candidate.clubId === clubId)
  if (!event || !eventStaffOf(event.id).includes(userId)) return false
  return canAccessClub(userId, clubId) || EVENT_STAFF_ACTIVE.includes(event.status)
}

/** Nhóm nhận nằm trong phạm vi chức vụ của người gửi thì trả danh sách người nhận, ngoài phạm vi thì trả null. */
export function audienceRecipients(userId: string, clubId: string, audience: AnnouncementAudienceRef): string[] | null {
  const group = audienceGroups(userId, clubId).find((candidate) => candidate.kind === audience.kind && candidate.scopeId === audience.scopeId)
  return group ? group.recipients : null
}
