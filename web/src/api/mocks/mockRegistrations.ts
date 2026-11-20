import type { EventStatus, MyRegistration, RegistrationAction } from '@/features/event/model/eventTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { db } from './db'
import { eventTarget, notify } from './mockNotifications'
import { registerJob, SYSTEM_ACTOR } from './mockSchedule'
import { nowIso, toVnIso } from './mockTime'
import { defaultClubSettings } from './seed/clubSeed'
import type { DbEvent, DbRegistration } from './seed/eventSeed'

const HOUR_MS = 60 * 60 * 1000

/** Đăng ký còn hiệu lực: chưa Đã hủy (BR-EVT-04). */
export const activeRegistrations = (eventId: string) => db.registrations.filter((registration) => registration.eventId === eventId && registration.status !== 'CANCELLED')

/** Người đang giữ chỗ: Nhận chỗ và Chờ xác nhận lại (chỗ vẫn giữ tới hạn xác nhận, ST-REG). */
export const holdsSeat = (registration: Pick<DbRegistration, 'status'>) => registration.status === 'CONFIRMED' || registration.status === 'RECONFIRM_PENDING'

export const seatsTaken = (eventId: string) => activeRegistrations(eventId).filter(holdsSeat).length

/** Danh sách chờ theo thứ tự thời điểm đăng ký (BR-EVT-03); trùng giây thì ai ghi vào trước đứng trước. */
export function waitlistOf(eventId: string): DbRegistration[] {
  const arrival = (registration: DbRegistration) => db.registrations.indexOf(registration)
  return activeRegistrations(eventId)
    .filter((registration) => registration.status === 'WAITLISTED')
    .toSorted((a, b) => Date.parse(a.registeredAt) - Date.parse(b.registeredAt) || arrival(a) - arrival(b))
}

export function waitlistPosition(registration: DbRegistration): number | null {
  if (registration.status !== 'WAITLISTED') return null
  return waitlistOf(registration.eventId).findIndex((candidate) => candidate.id === registration.id) + 1
}

const clubSettingsOf = (clubId: string) => db.clubs.find((club) => club.id === clubId) ?? defaultClubSettings()

/** Hạn tự hủy (FR-EVT-13); người Chờ xác nhận lại được từ chối giờ mới tới hạn xác nhận vì đó không phải giờ họ đã nhận. */
export function cancelDeadlineOf(event: DbEvent, registration: Pick<DbRegistration, 'status' | 'reconfirmDeadline'>): string {
  if (registration.status === 'RECONFIRM_PENDING' && registration.reconfirmDeadline) return registration.reconfirmDeadline
  if (!holdsSeat(registration)) return event.startAt
  return toVnIso(Date.parse(event.startAt) - clubSettingsOf(event.clubId).registrationCancelHours * HOUR_MS)
}

/** Còn đổi được đăng ký: sự kiện chưa bắt đầu, chưa hủy, chưa đóng. */
export const registrationsEditable = (event: DbEvent) => (event.status === 'APPROVED' || event.status === 'REGISTRATION_OPEN') && Date.parse(event.startAt) > Date.now()

export function registrationActions(event: DbEvent, registration: DbRegistration): RegistrationAction[] {
  if (registration.status === 'CANCELLED' || !registrationsEditable(event)) return []
  const now = Date.now()
  const actions: RegistrationAction[] = []
  if (registration.status === 'RECONFIRM_PENDING' && Date.parse(registration.reconfirmDeadline ?? '') > now) actions.push('RECONFIRM')
  if (Date.parse(cancelDeadlineOf(event, registration)) > now) actions.push('CANCEL')
  return actions
}

export function toMyRegistration(event: DbEvent, registration: DbRegistration): MyRegistration {
  return {
    id: registration.id,
    status: registration.status,
    waitlistPosition: waitlistPosition(registration),
    registeredAt: registration.registeredAt,
    promotedAt: registration.promotedAt,
    cancelDeadline: cancelDeadlineOf(event, registration),
    reconfirmDeadline: registration.status === 'RECONFIRM_PENDING' ? registration.reconfirmDeadline : null,
    allowedActions: registrationActions(event, registration),
  }
}

/** Đôn người đầu danh sách chờ vào chỗ trống theo thứ tự đăng ký, báo từng người được nhận chỗ (FR-EVT-13, BR-EVT-03). */
export function promoteWaitlist(event: DbEvent, actorId: string): DbRegistration[] {
  if (event.capacity === null || !registrationsEditable(event)) return []
  const promoted: DbRegistration[] = []
  for (const next of waitlistOf(event.id)) {
    if (seatsTaken(event.id) >= event.capacity) break
    Object.assign(next, { status: 'CONFIRMED', promotedAt: nowIso() })
    promoted.push(next)
    notify([next.userId], { clubId: event.clubId, category: 'EVENT', title: `Bạn đã được nhận chỗ: ${event.name}`, body: 'Một chỗ vừa trống nên bạn được đôn từ danh sách chờ.', target: eventTarget(event.clubId, event.id), actorId })
  }
  return promoted
}

/** FR-EVT-14, ST-REG: người giữ chỗ sang Chờ xác nhận lại, hạn là mốc sớm hơn giữa lúc dời + số giờ CLB và giờ bắt đầu mới. */
export function requireReconfirmation(event: DbEvent, actorId: string): { seated: DbRegistration[]; deadline: string } {
  const hours = clubSettingsOf(event.clubId).rescheduleConfirmHours
  const deadline = toVnIso(Math.min(Date.now() + hours * HOUR_MS, Date.parse(event.startAt)))
  const holders = activeRegistrations(event.id).filter(holdsSeat)
  // Người dời đã chọn giờ mới nên giữ Nhận chỗ; họ không nhận thông báo của chính mình nên nếu phải xác nhận sẽ dễ mất chỗ.
  for (const own of holders.filter((registration) => registration.userId === actorId)) Object.assign(own, { status: 'CONFIRMED', reconfirmDeadline: null })
  const seated = holders.filter((registration) => registration.userId !== actorId)
  for (const registration of seated) Object.assign(registration, { status: 'RECONFIRM_PENDING', reconfirmDeadline: deadline })
  return { seated, deadline }
}

/** Sự kiện đã hủy hoặc đã đóng giữ nguyên danh sách đăng ký để tra cứu, nên không tự hủy đăng ký của chúng. */
const EXPIRES_IN: EventStatus[] = ['APPROVED', 'REGISTRATION_OPEN', 'ONGOING']

/** FR-EVT-14: quá hạn xác nhận lại thì đăng ký bị hủy, người đó được báo, rồi chỗ trống được đôn cho danh sách chờ. */
export function expireReconfirmations(): void {
  const now = Date.now()
  const touched = new Set<DbEvent>()
  for (const registration of db.registrations) {
    if (registration.status !== 'RECONFIRM_PENDING' || Date.parse(registration.reconfirmDeadline ?? '') > now) continue
    const event = db.events.find((candidate) => candidate.id === registration.eventId)
    if (!event || !EXPIRES_IN.includes(event.status)) continue
    Object.assign(registration, { status: 'CANCELLED', cancelledAt: nowIso(), cancelKind: 'EXPIRED' })
    notify([registration.userId], {
      clubId: event.clubId,
      category: 'EVENT',
      title: `Đăng ký đã bị hủy: ${event.name}`,
      body: `Bạn chưa xác nhận tham dự trước hạn ${formatDateTime(registration.reconfirmDeadline ?? event.startAt)} sau khi sự kiện dời thời gian.`,
      target: eventTarget(event.clubId, event.id),
      actorId: SYSTEM_ACTOR,
    })
    touched.add(event)
  }
  for (const event of touched) promoteWaitlist(event, SYSTEM_ACTOR)
}

registerJob('registrationReconfirmExpiry', expireReconfirmations)
