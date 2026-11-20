import { http, HttpResponse } from 'msw'
import type { CoHostDecisionRequest, InviteCoHostRequest, RemoveCoHostRequest } from '@/features/event/model/eventTypes'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db } from '../db'
import { can, forbidden } from '../mockAccess'
import { clubNameOf, coHostDeciders, endCoHostClubStaff, openCoHostOf, toCoHost, toSharedEvent } from '../mockCoHosts'
import { API, currentUser, networkDelay, newId, problem, writer } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { eventTarget, notify, sharedEventsTarget } from '../mockNotifications'
import { EVENT_STAFF_ACTIVE, isBoardMember, positionHolderOf } from '../mockPermissions'
import { canViewEvent, canViewStaff } from '../mockStaffEvents'
import { nowIso } from '../mockTime'
import type { DbEvent, DbEventCoHost } from '../seed/eventSeed'

// FR-EVT-08, ST-COH: mời, trả lời, gỡ CLB đồng tổ chức. Quyền theo bảng ở kế hoạch đợt 7: mời và gỡ cần MANAGE_EVENT_STAFF ở
// phạm vi sự kiện (Trưởng tiểu ban không với tới), trả lời cần APPROVE_EVENT ở CLB được mời.

const MESSAGE_MAX = 500
const eventScope = (event: DbEvent) => ({ type: 'EVENT', id: event.id }) as const
const managesEvent = (userId: string, event: DbEvent) => can(userId, event.clubId, 'MANAGE_EVENT_STAFF', eventScope(event))
const reasonOk = (reason: string) => reason.length >= REASON_MIN && reason.length <= REASON_MAX
const readOnly = () => problem(422, 'Sự kiện không còn hoạt động nên không đổi ban tổ chức được.', 'EVENT_READ_ONLY')
const versionConflict = () => problem(409, 'Lời mời vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')

function findEvent(params: Record<string, string | readonly string[] | undefined>) {
  return db.events.find((event) => event.id === params.eventId && event.clubId === params.clubId)
}

const newestFirst = (a: DbEventCoHost, b: DbEventCoHost) => Date.parse(b.invitedAt) - Date.parse(a.invitedAt)

export const coHostHandlers = [
  http.get(`${API}/clubs/:clubId/events/:eventId/co-hosts`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!canViewStaff(user.value.id, event)) return problem(403, 'Chỉ ban tổ chức và ban chủ nhiệm được xem cơ cấu BTC.', 'FORBIDDEN')
    const canManage = EVENT_STAFF_ACTIVE.includes(event.status) && managesEvent(user.value.id, event)
    const rows = db.eventCoHosts.filter((coHost) => coHost.eventId === event.id).toSorted(newestFirst)
    return HttpResponse.json(rows.map((coHost) => toCoHost(coHost, canManage)))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/co-hosts`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!managesEvent(user.value.id, event)) return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'mời CLB đồng tổ chức', eventScope(event))
    if (!EVENT_STAFF_ACTIVE.includes(event.status)) return readOnly()
    const body = (await request.json()) as Partial<InviteCoHostRequest>
    const club = db.clubs.find((candidate) => candidate.id === body.clubId)
    const message = (body.message ?? '').trim()
    const errors = [
      ...(!club ? [{ field: 'clubId', message: 'Chọn CLB cần mời.' }] : []),
      ...(club?.id === event.clubId ? [{ field: 'clubId', message: 'Không mời chính CLB chủ trì.' }] : []),
      ...(message.length > MESSAGE_MAX ? [{ field: 'message', message: `Lời nhắn tối đa ${MESSAGE_MAX} ký tự.` }] : []),
    ]
    if (errors.length > 0 || !club) return problem(400, 'Thông tin lời mời chưa hợp lệ.', 'VALIDATION', errors)
    const existing = openCoHostOf(event.id, club.id)
    if (existing) {
      const state = existing.status === 'SENT' ? 'đang chờ trả lời' : 'đang đồng tổ chức'
      return problem(409, `${club.name} ${state} sự kiện này.`, 'CO_HOST_EXISTS')
    }
    const coHost: DbEventCoHost = {
      id: newId('ch'),
      eventId: event.id,
      hostClubId: event.clubId,
      clubId: club.id,
      status: 'SENT',
      message,
      invitedBy: user.value.id,
      invitedAt: nowIso(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      removedBy: null,
      removedAt: null,
      removeReason: null,
      version: 1,
    }
    db.eventCoHosts.push(coHost)
    notify(coHostDeciders(club.id), {
      clubId: club.id,
      category: 'EVENT',
      title: `${clubNameOf(event.clubId)} mời CLB đồng tổ chức ${event.name}`,
      body: message,
      target: sharedEventsTarget(club.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toCoHost(coHost, true), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/co-hosts/:coHostId/removal`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    const coHost = db.eventCoHosts.find((candidate) => candidate.id === params.coHostId && candidate.eventId === params.eventId)
    if (!event || !coHost || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy CLB đồng tổ chức.', 'CO_HOST_NOT_FOUND')
    if (!managesEvent(user.value.id, event)) return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'gỡ CLB đồng tổ chức', eventScope(event))
    const body = (await request.json()) as Partial<RemoveCoHostRequest>
    if (body.version !== coHost.version) return versionConflict()
    if (!EVENT_STAFF_ACTIVE.includes(event.status)) return readOnly()
    if (coHost.status !== 'ACCEPTED') return problem(422, 'Chỉ gỡ được CLB đang đồng tổ chức.', 'CO_HOST_NOT_ACTIVE')
    const reason = (body.reason ?? '').trim()
    if (!reasonOk(reason)) return problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    Object.assign(coHost, { status: 'REMOVED', removedBy: user.value.id, removedAt: nowIso(), removeReason: reason, version: coHost.version + 1 })
    const removedStaff = endCoHostClubStaff(coHost, reason)
    const clubName = clubNameOf(coHost.clubId)
    notify(coHostDeciders(coHost.clubId), {
      clubId: coHost.clubId,
      category: 'EVENT',
      title: `${clubName} không còn đồng tổ chức ${event.name}`,
      body: `Lý do: ${reason}`,
      target: sharedEventsTarget(coHost.clubId),
      actorId: user.value.id,
    })
    // Người bị gỡ không còn mở được trang sự kiện nên thông báo không có trang đích.
    notify(removedStaff, {
      clubId: event.clubId,
      category: 'EVENT',
      title: `Bạn thôi làm nhân sự ${event.name}`,
      body: `${clubName} không còn đồng tổ chức. Lý do: ${reason}`,
      actorId: user.value.id,
    })
    return HttpResponse.json(toCoHost(coHost, true))
  }),

  http.get(`${API}/clubs/:clubId/co-host-invitations`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    // Sự kiện chung là việc của ban chủ nhiệm CLB được mời (SRS 3.5).
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm xem được lời mời đồng tổ chức.', 'FORBIDDEN')
    const rows = db.eventCoHosts.filter((coHost) => coHost.clubId === clubId).toSorted(newestFirst)
    return HttpResponse.json(rows.map((coHost) => toSharedEvent(coHost, user.value.id)))
  }),

  http.post(`${API}/clubs/:clubId/co-host-invitations/:invitationId/decision`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const coHost = db.eventCoHosts.find((candidate) => candidate.id === params.invitationId && candidate.clubId === clubId)
    if (!coHost || !isBoardMember(user.value.id, clubId)) return problem(404, 'Không tìm thấy lời mời.', 'CO_HOST_NOT_FOUND')
    if (!can(user.value.id, clubId, 'APPROVE_EVENT')) return forbidden(clubId, 'APPROVE_EVENT', 'trả lời lời mời đồng tổ chức')
    const body = (await request.json()) as Partial<CoHostDecisionRequest>
    if (body.version !== coHost.version) return versionConflict()
    // ST-COH: chỉ trả lời lời mời Đã gửi; lời mời đã từ chối không chấp nhận lại được, CLB chủ trì phải mời lần mới.
    if (coHost.status !== 'SENT') return problem(422, 'Lời mời này đã được trả lời hoặc đã bị gỡ.', 'CO_HOST_NOT_PENDING')
    const event = db.events.find((candidate) => candidate.id === coHost.eventId)
    if (!event || !EVENT_STAFF_ACTIVE.includes(event.status)) return problem(422, 'Sự kiện không còn hoạt động nên không nhận lời được.', 'EVENT_READ_ONLY')
    const decision = body.decision
    const note = (body.note ?? '').trim()
    if (decision !== 'ACCEPT' && decision !== 'DECLINE') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (decision === 'DECLINE' && !reasonOk(note)) {
      return problem(400, 'Vui lòng nhập lý do từ chối.', 'VALIDATION', [{ field: 'note', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    Object.assign(coHost, {
      status: decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      decidedBy: user.value.id,
      decidedAt: nowIso(),
      decisionNote: decision === 'DECLINE' ? note : null,
      version: coHost.version + 1,
    })
    const clubName = clubNameOf(clubId)
    notify([coHost.invitedBy, positionHolderOf('EVENT_LEAD', event.id)], {
      clubId: event.clubId,
      category: 'EVENT',
      title: decision === 'ACCEPT' ? `${clubName} nhận lời đồng tổ chức ${event.name}` : `${clubName} từ chối đồng tổ chức ${event.name}`,
      body: decision === 'DECLINE' ? `Lý do: ${note}` : 'Bạn có thể thêm thành viên của CLB này vào tiểu ban.',
      target: eventTarget(event.clubId, event.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toSharedEvent(coHost, user.value.id))
  }),
]
