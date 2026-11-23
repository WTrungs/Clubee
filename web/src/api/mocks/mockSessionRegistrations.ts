import type { MySessionRegistration, SessionSeats } from '@/features/attendance/model/sessionTypes'
import { db, type DbSession, type DbSessionRegistration } from './db'
import { notify, sessionTarget } from './mockNotifications'
import { byArrival } from './mockQueue'
import { nowIso, toVnIso } from './mockTime'
import { defaultClubSettings } from './seed/clubSeed'

const HOUR_MS = 60 * 60 * 1000

/** Đăng ký còn hiệu lực của buổi (FR-ATT-03). */
export const activeSessionRegistrations = (sessionId: string) =>
  db.sessionRegistrations.filter((registration) => registration.sessionId === sessionId && registration.status !== 'CANCELLED')

export const sessionSeatsTaken = (sessionId: string) => activeSessionRegistrations(sessionId).filter((registration) => registration.status === 'CONFIRMED').length

export const sessionWaitlist = (sessionId: string) =>
  byArrival(
    activeSessionRegistrations(sessionId).filter((registration) => registration.status === 'WAITLISTED'),
    db.sessionRegistrations,
  )

export function sessionWaitlistPosition(registration: DbSessionRegistration): number | null {
  if (registration.status !== 'WAITLISTED') return null
  return sessionWaitlist(registration.sessionId).findIndex((candidate) => candidate.id === registration.id) + 1
}

export const mySessionRegistration = (userId: string, sessionId: string) => activeSessionRegistrations(sessionId).find((registration) => registration.userId === userId)

export function sessionSeats(session: DbSession): SessionSeats | null {
  if (session.capacity === null) return null
  return { capacity: session.capacity, taken: sessionSeatsTaken(session.id), waitlist: sessionWaitlist(session.id).length }
}

/** Hạn nhận đăng ký: hạn đã đặt, không có thì tới giờ bắt đầu. */
export const sessionRegistrationClosesAt = (session: DbSession) => session.registrationDeadline ?? session.startAt

/** Còn nhận đăng ký mới: có số chỗ, chưa hủy, chưa qua hạn đăng ký và chưa bắt đầu. */
export function sessionRegistrationOpen(session: DbSession, now = Date.now()): boolean {
  return session.capacity !== null && session.cancelledAt === null && Date.parse(sessionRegistrationClosesAt(session)) > now && Date.parse(session.startAt) > now
}

/** Hạn tự hủy: người giữ chỗ trước giờ bắt đầu số giờ CLB cấu hình (như sự kiện, FR-EVT-13); người chờ tới giờ bắt đầu. */
export function sessionCancelDeadline(session: DbSession, registration: Pick<DbSessionRegistration, 'status'>): string {
  if (registration.status !== 'CONFIRMED') return session.startAt
  const hours = (db.clubs.find((club) => club.id === session.clubId) ?? defaultClubSettings()).registrationCancelHours
  return toVnIso(Date.parse(session.startAt) - hours * HOUR_MS)
}

export function toMySessionRegistration(session: DbSession, registration: DbSessionRegistration): MySessionRegistration {
  const cancelDeadline = sessionCancelDeadline(session, registration)
  const canCancel = registration.status !== 'CANCELLED' && session.cancelledAt === null && Date.parse(cancelDeadline) > Date.now()
  return {
    id: registration.id,
    status: registration.status,
    waitlistPosition: sessionWaitlistPosition(registration),
    registeredAt: registration.registeredAt,
    promotedAt: registration.promotedAt,
    cancelDeadline,
    allowedActions: canCancel ? ['CANCEL'] : [],
  }
}

/** Đôn người đầu danh sách chờ vào chỗ trống theo thứ tự đăng ký và báo từng người (BR-EVT-03); chỉ khi buổi chưa bắt đầu, chưa hủy. */
export function promoteSessionWaitlist(session: DbSession, actorId: string): DbSessionRegistration[] {
  if (session.capacity === null || session.cancelledAt !== null || Date.parse(session.startAt) <= Date.now()) return []
  const promoted: DbSessionRegistration[] = []
  for (const next of sessionWaitlist(session.id)) {
    if (sessionSeatsTaken(session.id) >= session.capacity) break
    Object.assign(next, { status: 'CONFIRMED', promotedAt: nowIso() })
    promoted.push(next)
    notify([next.userId], {
      clubId: session.clubId,
      category: 'SESSION',
      title: `Bạn đã được nhận chỗ: ${session.title}`,
      body: 'Một chỗ vừa trống nên bạn được đôn từ danh sách chờ.',
      target: sessionTarget(session.clubId, session.id),
      actorId,
    })
  }
  return promoted
}
