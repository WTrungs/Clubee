import type { ScheduleConflict } from '@/features/event/model/eventTypes'
import { db } from './db'
import { sessionAudience } from './mockAttendance'
import { isPositionOpen } from './mockPermissions'
import { activeRegistrations } from './mockRegistrations'
import { mySessionRegistration } from './mockSessionRegistrations'

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart)

const LIVE_EVENT = new Set(['APPROVED', 'REGISTRATION_OPEN', 'ONGOING'])

/** Người đó có mặt ở sự kiện: đăng ký còn hiệu lực, làm nhân sự hoặc Trưởng BTC. */
function joinsEvent(userId: string, eventId: string): boolean {
  return (
    activeRegistrations(eventId).some((registration) => registration.userId === userId) ||
    db.eventStaff.some((staff) => staff.eventId === eventId && staff.userId === userId && staff.leftAt === null) ||
    db.positions.some((position) => position.role === 'EVENT_LEAD' && position.scopeId === eventId && position.userId === userId && isPositionOpen(position))
  )
}

/** Buổi có số chỗ thì tính khi đã đăng ký; buổi không giới hạn chỗ thì tính cả đối tượng của buổi. */
function joinsSession(userId: string, session: (typeof db.sessions)[number]): boolean {
  if (mySessionRegistration(userId, session.id)) return true
  return session.capacity === null && sessionAudience(session).includes(userId)
}

/**
 * FR-TASK-09: buổi sinh hoạt, sự kiện chồng giờ với khoảng `window` mà người đó tham gia; chạm mốc (kết thúc đúng lúc bắt đầu)
 * không tính. Hoạt động ngoài CLB của người xem chỉ ghi loại và giờ.
 */
export function scheduleConflictsOf(userId: string, window: { startAt: string; endAt: string; excludeEventId?: string }, viewerClubId: string): ScheduleConflict[] {
  const sessions = db.sessions
    .filter((session) => session.cancelledAt === null && overlaps(session.startAt, session.endAt, window.startAt, window.endAt) && joinsSession(userId, session))
    .map((session): ScheduleConflict => ({ kind: 'SESSION', title: session.clubId === viewerClubId ? session.title : null, startAt: session.startAt, endAt: session.endAt }))
  const events = db.events
    .filter((event) => event.id !== window.excludeEventId && LIVE_EVENT.has(event.status) && overlaps(event.startAt, event.endAt, window.startAt, window.endAt) && joinsEvent(userId, event.id))
    .map((event): ScheduleConflict => ({ kind: 'EVENT', title: event.clubId === viewerClubId ? event.name : null, startAt: event.startAt, endAt: event.endAt }))
  return [...sessions, ...events].toSorted((a, b) => a.startAt.localeCompare(b.startAt))
}
