import { http, HttpResponse } from 'msw'
import type { GuestRegistrationRequest } from '@/features/event/model/eventTypes'
import { parseGuestContact } from '@/shared/lib/guestRules'
import { db } from '../db'
import type { DbRegistration } from '../seed/eventSeed'
import { activeGuestRegistration, guestCanCancel, guestRegistrationByCode, mailGuestPass, newGuestCode, toGuestPass } from '../mockGuests'
import { API, csrfRejected, networkDelay, newId, problem } from '../mockHttp'
import { acceptsRegistrations, publicEventOf } from '../mockPublicEvents'
import { promoteWaitlist, seatsTaken } from '../mockRegistrations'
import { SYSTEM_ACTOR } from '../mockSchedule'
import { hasValidCsrf } from '../mockSession'
import { nowIso } from '../mockTime'

// FR-EVT-12: khách mời không có tài khoản; route công khai không đọc phiên, lệnh ghi vẫn cần token CSRF.

const passNotFound = () => problem(404, 'Không tìm thấy vé. Kiểm tra lại mã tham dự trong email.', 'GUEST_PASS_NOT_FOUND')
const eventOfRegistration = (registration: DbRegistration) => db.events.find((event) => event.id === registration.eventId)

export const guestHandlers = [
  http.post(`${API}/public/events/:eventId/guest-registrations`, async ({ request, params }) => {
    await networkDelay()
    if (!hasValidCsrf(request)) return csrfRejected()
    const event = publicEventOf(String(params.eventId))
    if (!event) return problem(404, 'Không tìm thấy sự kiện mở cho khách.', 'EVENT_NOT_FOUND')
    const contact = parseGuestContact((await request.json()) as Partial<GuestRegistrationRequest>)
    if (activeGuestRegistration(event.id, contact.email, contact.phone)) {
      return problem(409, 'Email hoặc số điện thoại này đã đăng ký sự kiện. Mở vé trong email để xem lại mã tham dự.', 'ALREADY_REGISTERED')
    }
    if (!acceptsRegistrations(event)) return problem(422, 'Sự kiện chưa mở đăng ký hoặc đã hết hạn đăng ký.', 'REGISTRATION_CLOSED')
    if (contact.errors.length > 0) return problem(400, 'Thông tin đăng ký chưa hợp lệ.', 'VALIDATION', contact.errors)
    // BR-EVT-03: khách dùng chung số chỗ với thành viên; hết chỗ thì vào danh sách chờ theo thứ tự thời gian.
    const status = event.capacity === null || seatsTaken(event.id) < event.capacity ? 'CONFIRMED' : 'WAITLISTED'
    const registration: DbRegistration = {
      id: newId('r'),
      eventId: event.id,
      userId: null,
      guest: { fullName: contact.fullName, email: contact.email, phone: contact.phone, code: newGuestCode(), checkIns: [] },
      status,
      registeredAt: nowIso(),
      cancelledAt: null,
      cancelKind: null,
      promotedAt: null,
      reconfirmDeadline: null,
    }
    db.registrations.push(registration)
    mailGuestPass(event, registration)
    return HttpResponse.json(toGuestPass(event, registration), { status: 201 })
  }),

  http.get(`${API}/public/guest-passes/:code`, async ({ params }) => {
    await networkDelay()
    const registration = guestRegistrationByCode(String(params.code))
    const event = registration && eventOfRegistration(registration)
    if (!registration || !event) return passNotFound()
    return HttpResponse.json(toGuestPass(event, registration))
  }),

  http.post(`${API}/public/guest-passes/:code/cancellation`, async ({ request, params }) => {
    await networkDelay()
    if (!hasValidCsrf(request)) return csrfRejected()
    const registration = guestRegistrationByCode(String(params.code))
    const event = registration && eventOfRegistration(registration)
    if (!registration || !event) return passNotFound()
    if (registration.status === 'CANCELLED') return problem(422, 'Đăng ký này đã hủy.', 'REGISTRATION_CANCELLED')
    if (!guestCanCancel(event, registration)) return problem(422, 'Sự kiện đã bắt đầu hoặc không còn nhận thay đổi đăng ký.', 'REGISTRATION_LOCKED')
    Object.assign(registration, { status: 'CANCELLED', cancelledAt: nowIso(), cancelKind: 'SELF' })
    promoteWaitlist(event, SYSTEM_ACTOR)
    return HttpResponse.json(toGuestPass(event, registration))
  }),
]
