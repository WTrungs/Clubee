import { http, HttpResponse } from 'msw'
import type { StaffSignupRequest, StaffSignupSetting } from '@/features/event/model/eventTypes'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db } from '../db'
import { can, forbidden } from '../mockAccess'
import { API, currentUser, networkDelay, newId, problem, writer } from '../mockHttp'
import { canAccessClub, isActiveMember, personRef } from '../mockMembers'
import { eventTarget, notify } from '../mockNotifications'
import { positionHolderOf } from '../mockPermissions'
import { isEventLead, isEventStaff } from '../mockStaffEvents'
import { isFull, pendingRequestOf, signupAccepting, SIGNUP_STATUSES, staffSignupInfo, toPendingSignup } from '../mockStaffSignup'
import { nowIso } from '../mockTime'
import type { DbEvent } from '../seed/eventSeed'

type Params = Record<string, string | readonly string[] | undefined>

const eventOf = (params: Params) => db.events.find((event) => event.id === params.eventId && event.clubId === String(params.clubId))
const notFound = () => problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
const eventScope = (event: DbEvent) => ({ type: 'EVENT', id: event.id }) as const
const leadOf = (event: DbEvent) => positionHolderOf('EVENT_LEAD', event.id)

/** Trưởng BTC duyệt ngoại lệ vượt chỉ tiêu (BR-EVT-07). */
function decidable(params: Params, request: Request) {
  const user = writer(request)
  if (!user.ok) return user
  const event = eventOf(params)
  const signup = db.staffSignupRequests.find((candidate) => candidate.id === params.requestId && candidate.eventId === params.eventId)
  if (!event || !signup) return { ok: false as const, response: problem(404, 'Không tìm thấy yêu cầu.', 'NOT_FOUND') }
  if (!isEventLead(user.value.id, event)) return { ok: false as const, response: problem(403, 'Chỉ Trưởng BTC duyệt yêu cầu vượt chỉ tiêu.', 'FORBIDDEN') }
  if (signup.status !== 'PENDING') return { ok: false as const, response: problem(422, 'Yêu cầu này đã được xử lý.', 'REQUEST_DECIDED') }
  return { ok: true as const, event, signup, userId: user.value.id }
}

export const staffSignupHandlers = [
  http.put(`${API}/clubs/:clubId/events/:eventId/staff-signup`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = eventOf(params)
    if (!event || !canAccessClub(user.value.id, event.clubId)) return notFound()
    if (!can(user.value.id, event.clubId, 'MANAGE_EVENT_STAFF', eventScope(event))) {
      return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'mở đăng ký nhân sự', eventScope(event))
    }
    const body = (await request.json()) as Partial<StaffSignupSetting>
    if (body.version !== event.version) return problem(409, 'Sự kiện vừa thay đổi. Tải lại rồi thử lại.', 'VERSION_CONFLICT')
    if (!SIGNUP_STATUSES.includes(event.status)) return problem(422, 'Sự kiện không còn nhận nhân sự mới.', 'EVENT_READ_ONLY')
    if (typeof body.open !== 'boolean') return problem(400, 'Chọn mở hoặc đóng đăng ký.', 'VALIDATION', [{ field: 'open', message: 'Chọn mở hoặc đóng.' }])
    if (event.staffSignupOpen !== body.open) Object.assign(event, { staffSignupOpen: body.open, version: event.version + 1 })
    const setting: StaffSignupSetting = { open: event.staffSignupOpen, version: event.version }
    return HttpResponse.json(setting)
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId/staff-signup`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = eventOf(params)
    if (!event || !canAccessClub(user.value.id, event.clubId)) return notFound()
    return HttpResponse.json(staffSignupInfo(event, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/staff-signups`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = eventOf(params)
    if (!event || !canAccessClub(user.value.id, event.clubId)) return notFound()
    if (!isActiveMember(user.value.id, event.clubId)) return problem(403, 'Chỉ thành viên Thử việc hoặc Chính thức tự đăng ký vào tiểu ban.', 'FORBIDDEN')
    if (isEventStaff(user.value.id, event)) return problem(409, 'Bạn đã là nhân sự của sự kiện này.', 'ALREADY_STAFF')
    if (pendingRequestOf(event.id, user.value.id)) return problem(409, 'Bạn đã có yêu cầu đang chờ Trưởng BTC duyệt.', 'REQUEST_PENDING')
    if (!signupAccepting(event)) return problem(422, 'Ban tổ chức chưa mở hoặc đã đóng đăng ký nhân sự.', 'SIGNUP_CLOSED')
    const body = (await request.json()) as Partial<StaffSignupRequest>
    const subcommittee = db.subcommittees.find((candidate) => candidate.id === body.subcommitteeId && candidate.eventId === event.id)
    if (!subcommittee) return problem(400, 'Chọn một tiểu ban của sự kiện.', 'VALIDATION', [{ field: 'subcommitteeId', message: 'Chọn tiểu ban.' }])
    const lead = leadOf(event)
    if (!isFull(subcommittee)) {
      db.eventStaff.push({ userId: user.value.id, eventId: event.id, subcommitteeId: subcommittee.id, kind: 'MEMBER', joinedAt: nowIso(), leftAt: null })
      notify([lead], {
        clubId: event.clubId,
        category: 'EVENT',
        title: `${personRef(user.value.id).fullName} tự đăng ký vào tiểu ban ${subcommittee.name}`,
        target: eventTarget(event.clubId, event.id),
        actorId: user.value.id,
      })
      return HttpResponse.json(staffSignupInfo(event, user.value.id), { status: 201 })
    }
    const note = (body.note ?? '').trim()
    if (note.length < REASON_MIN || note.length > REASON_MAX) {
      return problem(400, 'Tiểu ban đã đủ chỉ tiêu.', 'VALIDATION', [{ field: 'note', message: `Tiểu ban đã đủ chỉ tiêu: nhập lời nhắn từ ${REASON_MIN} đến ${REASON_MAX} ký tự gửi Trưởng BTC.` }])
    }
    db.staffSignupRequests.push({
      id: newId('ssr'),
      eventId: event.id,
      subcommitteeId: subcommittee.id,
      userId: user.value.id,
      note,
      status: 'PENDING',
      createdAt: nowIso(),
      decidedBy: null,
      decidedAt: null,
      reason: null,
    })
    notify([lead], {
      clubId: event.clubId,
      category: 'EVENT',
      title: `Yêu cầu vào tiểu ban ${subcommittee.name} vượt chỉ tiêu`,
      body: `${personRef(user.value.id).fullName}: ${note}`,
      target: eventTarget(event.clubId, event.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(staffSignupInfo(event, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId/staff-signup-requests`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = eventOf(params)
    if (!event || !canAccessClub(user.value.id, event.clubId)) return notFound()
    if (!isEventLead(user.value.id, event)) return problem(403, 'Chỉ Trưởng BTC xem yêu cầu vượt chỉ tiêu.', 'FORBIDDEN')
    const rows = db.staffSignupRequests
      .filter((request) => request.eventId === event.id && request.status === 'PENDING')
      .map((request) => toPendingSignup(request, event))
    return HttpResponse.json(rows)
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/staff-signup-requests/:requestId/approval`, async ({ request, params }) => {
    await networkDelay()
    const target = decidable(params, request)
    if (!target.ok) return target.response
    const { event, signup, userId } = target
    if (isEventStaff(signup.userId, event)) return problem(422, 'Người này đã là nhân sự của sự kiện.', 'ALREADY_STAFF')
    if (!isActiveMember(signup.userId, event.clubId)) return problem(422, 'Người này không còn là thành viên Thử việc hoặc Chính thức.', 'NOT_ELIGIBLE')
    const at = nowIso()
    Object.assign(signup, { status: 'APPROVED', decidedBy: userId, decidedAt: at })
    db.eventStaff.push({ userId: signup.userId, eventId: event.id, subcommitteeId: signup.subcommitteeId, kind: 'MEMBER', joinedAt: at, leftAt: null, overQuota: true })
    const name = db.subcommittees.find((subcommittee) => subcommittee.id === signup.subcommitteeId)?.name ?? ''
    notify([signup.userId], { clubId: event.clubId, category: 'EVENT', title: `Trưởng BTC đã nhận bạn vào tiểu ban ${name}`, target: eventTarget(event.clubId, event.id), actorId: userId })
    return HttpResponse.json(toPendingSignup(signup, event))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/staff-signup-requests/:requestId/rejection`, async ({ request, params }) => {
    await networkDelay()
    const target = decidable(params, request)
    if (!target.ok) return target.response
    const { event, signup, userId } = target
    const reason = (((await request.json()) as { reason?: string }).reason ?? '').trim()
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return problem(400, 'Cần lý do từ chối.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    Object.assign(signup, { status: 'REJECTED', decidedBy: userId, decidedAt: nowIso(), reason })
    const name = db.subcommittees.find((subcommittee) => subcommittee.id === signup.subcommitteeId)?.name ?? ''
    notify([signup.userId], { clubId: event.clubId, category: 'EVENT', title: `Yêu cầu vào tiểu ban ${name} không được duyệt`, body: `Lý do: ${reason}`, target: eventTarget(event.clubId, event.id), actorId: userId })
    return HttpResponse.json(toPendingSignup(signup, event))
  }),
]
