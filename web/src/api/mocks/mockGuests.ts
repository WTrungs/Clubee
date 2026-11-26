import type { GuestPass, GuestRegistrationRow } from '@/features/event/model/eventTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { maskContact } from '@/shared/lib/guestRules'
import { matchesKeyword } from '@/shared/lib/searchText'
import { db } from './db'
import { newId } from './mockHttp'
import { toPublicEventSummary } from './mockPublicEvents'
import { activeRegistrations, holdsSeat, registrationsEditable, waitlistPosition } from './mockRegistrations'
import { nowIso } from './mockTime'
import type { DbEvent, DbRegistration } from './seed/eventSeed'

/** Thư gửi khách mời (mock không gửi email thật); trang đăng ký có "Hộp thư demo" để mở vé như bấm trong email. */
export interface DbGuestMail {
  id: string
  to: string
  registrationId: string
  subject: string
  body: string
  sentAt: string
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Mã tham dự 8 ký tự, bỏ chữ dễ nhầm (O/0, I/1); không trùng mã đã có. */
export function newGuestCode(): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const code = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
    if (!db.registrations.some((registration) => registration.guest?.code === code)) return code
  }
}

export const guestRegistrationByCode = (code: string) => db.registrations.find((registration) => registration.guest?.code === code.trim().toUpperCase())

/** BR-EVT-04: mỗi email hoặc SĐT của khách có tối đa một đăng ký đang hoạt động cho một sự kiện. */
export function activeGuestRegistration(eventId: string, email: string | null, phone: string | null): DbRegistration | undefined {
  return activeRegistrations(eventId).find(
    (registration) => registration.guest !== null && ((email !== null && registration.guest.email === email) || (phone !== null && registration.guest.phone === phone)),
  )
}

/** Ghi thư vào hộp thư demo; khách chỉ có SĐT thì không có thư (mã hiện ngay trên màn hình sau khi đăng ký). */
export function mailGuest(registration: DbRegistration, subject: string, body: string): void {
  const to = registration.guest?.email
  if (!to) return
  db.guestMails.push({ id: newId('gm'), to, registrationId: registration.id, subject, body, sentAt: nowIso() })
}

/** Thư mới nhất gửi tới một email (chỉ dùng ở chế độ mock). */
export const latestGuestMailFor = (email: string) => db.guestMails.filter((mail) => mail.to === email.trim().toLowerCase()).at(-1) ?? null

export function mailGuestPass(event: DbEvent, registration: DbRegistration): void {
  const seat = registration.status === 'WAITLISTED' ? 'Bạn đang ở danh sách chờ; khi có chỗ trống hệ thống sẽ báo qua email.' : 'Bạn đã được nhận chỗ.'
  mailGuest(registration, `Mã tham dự ${event.name}`, `${seat} Mã tham dự: ${registration.guest?.code ?? ''}. Thời gian: ${formatDateTime(event.startAt)}.`)
}

/** Khách tự hủy tới trước giờ bắt đầu, khi sự kiện còn nhận thay đổi đăng ký. */
export const guestCanCancel = (event: DbEvent, registration: DbRegistration) => registration.status !== 'CANCELLED' && registrationsEditable(event)

export function toGuestPass(event: DbEvent, registration: DbRegistration): GuestPass {
  const guest = registration.guest
  return {
    code: guest?.code ?? '',
    fullName: guest?.fullName ?? '',
    emailHint: maskContact(guest?.email ?? null),
    phoneHint: maskContact(guest?.phone ?? null),
    status: registration.status,
    waitlistPosition: waitlistPosition(registration),
    registeredAt: registration.registeredAt,
    checkedInDays: guest?.checkIns.map((checkIn) => checkIn.day) ?? [],
    event: toPublicEventSummary(event),
    allowedActions: guestCanCancel(event, registration) ? ['CANCEL'] : [],
  }
}

/** BTC tra theo mã, email hoặc SĐT (FR-ATT-07); khớp email, SĐT phải trọn vẹn để không dò ra liên hệ của khách. */
export function matchesGuest(registration: DbRegistration, keyword: string): boolean {
  const guest = registration.guest
  if (!guest) return false
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return true
  return guest.code.toLowerCase() === needle || guest.email === needle || guest.phone === needle.replace(/[\s.-]/g, '') || matchesKeyword(guest.fullName, keyword)
}

export function toGuestRow(registration: DbRegistration, day: string | null): GuestRegistrationRow {
  const guest = registration.guest
  const checkIn = guest?.checkIns.find((candidate) => candidate.day === day) ?? null
  return {
    id: registration.id,
    fullName: guest?.fullName ?? '',
    emailHint: maskContact(guest?.email ?? null),
    phoneHint: maskContact(guest?.phone ?? null),
    code: guest?.code ?? '',
    status: registration.status,
    checkedIn: checkIn !== null,
    checkedInAt: checkIn?.at ?? null,
  }
}

/** Đếm cho báo cáo sự kiện (FR-RPT-05): khách còn đăng ký và khách đã có mặt ít nhất một ngày. */
export function guestStats(eventId: string): { guests: number; guestsCheckedIn: number } {
  const guests = activeRegistrations(eventId).filter((registration) => registration.guest !== null)
  return { guests: guests.length, guestsCheckedIn: guests.filter((registration) => (registration.guest?.checkIns.length ?? 0) > 0).length }
}

export const guestHoldsSeat = (registration: DbRegistration) => registration.guest !== null && holdsSeat(registration)
