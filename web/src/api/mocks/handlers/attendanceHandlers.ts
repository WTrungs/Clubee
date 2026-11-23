import { http, HttpResponse } from 'msw'
import type {
  AttendanceCheckIn,
  AttendanceCheckInRequest,
  AttendanceStatus,
  CloseAttendanceRequest,
  MarkAttendanceRequest,
} from '@/features/attendance/model/attendanceTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db } from '../db'
import {
  ATTENDANCE_FILTERS,
  ATTENDANCE_STATUSES,
  buildSheet,
  closeAttendance,
  closedEditBlocker,
  currentCode,
  defaultDay,
  editClosedAttendance,
  eventActivity,
  eventAttendanceAvailable,
  isAttendanceOpen,
  isCurrentCode,
  recordsOf,
  sessionActivity,
  sheetEntries,
  sheetStateOf,
  writeAttendance,
  type AttendanceActivity,
} from '../mockAttendance'
import { API, currentUser, networkDelay, problem, writer } from '../mockHttp'
import { canAccessClub, eligibleMembers, ROSTER_STATUSES } from '../mockMembers'
import { matchesGuest, toGuestRow } from '../mockGuests'
import { nowIso } from '../mockTime'
import { activeRegistrations, holdsSeat } from '../mockRegistrations'

type Resolved = { ok: true; activity: AttendanceActivity } | { ok: false; response: Response }
type Params = Record<string, string | readonly string[] | undefined>

function resolveSession(params: Params, userId: string): Resolved {
  const clubId = String(params.clubId)
  if (!canAccessClub(userId, clubId)) return { ok: false, response: problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER') }
  const session = db.sessions.find((candidate) => candidate.id === params.sessionId && candidate.clubId === clubId)
  if (!session) return { ok: false, response: problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND') }
  const activity = sessionActivity(session)
  if (activity.cancelled) {
    if (!activity.canView(userId)) return { ok: false, response: problem(403, activity.forbidden.view, 'FORBIDDEN') }
    return { ok: false, response: problem(422, 'Buổi sinh hoạt đã hủy nên không có điểm danh.', 'SESSION_CANCELLED') }
  }
  return { ok: true, activity }
}

function resolveEvent(params: Params, userId: string): Resolved {
  const event = db.events.find((candidate) => candidate.id === params.eventId && candidate.clubId === String(params.clubId))
  if (!event) return { ok: false, response: problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND') }
  const activity = eventActivity(event)
  if (!activity.canView(userId)) return { ok: false, response: problem(403, activity.forbidden.view, 'FORBIDDEN') }
  if (!eventAttendanceAvailable(event)) {
    return { ok: false, response: problem(422, 'Sự kiện chưa được duyệt hoặc đã hủy nên không có điểm danh.', 'ATTENDANCE_UNAVAILABLE') }
  }
  return { ok: true, activity }
}

/** Ngày gửi lên phải là một ngày của sự kiện; buổi sinh hoạt không có ngày. */
function dayOf(activity: AttendanceActivity, day: unknown): { ok: true; day: string | null } | { ok: false; response: Response } {
  if (activity.days.length === 0) return { ok: true, day: null }
  if (typeof day === 'string' && activity.days.includes(day)) return { ok: true, day }
  return { ok: false, response: problem(400, 'Ngày điểm danh không thuộc sự kiện.', 'VALIDATION', [{ field: 'day', message: 'Chọn một ngày của sự kiện.' }]) }
}

/** Kiểm tra chung cho thao tác ghi: chỉ đọc, khung giờ, đã chốt. */
function writeGuard(activity: AttendanceActivity, day: string | null): Response | null {
  if (activity.readOnlyReason) return problem(422, activity.readOnlyReason, 'EVENT_READ_ONLY')
  if (!isAttendanceOpen(activity, day)) return problem(422, `Điểm danh mở lúc ${formatDateTime(activity.opensAt(day))}.`, 'ATTENDANCE_NOT_OPEN')
  if (sheetStateOf(activity, day).closedAt) return problem(422, 'Điểm danh đã chốt nên danh sách chỉ xem được.', 'ATTENDANCE_CLOSED')
  return null
}

/** FR-ATT-08, BR-ATT-04: sửa sau khi chốt; quyền theo hạn sửa → version → trạng thái không đổi → lý do. */
function editClosed(activity: AttendanceActivity, day: string | null, targetId: string, body: Partial<MarkAttendanceRequest>, actorId: string): Response {
  const blocker = closedEditBlocker(activity, actorId, day)
  if (blocker) return problem(403, blocker, 'FORBIDDEN')
  const current = recordsOf(activity, day).find((record) => record.userId === targetId)
  if ((current?.version ?? 0) !== body.version) return problem(409, 'Bản ghi vừa được người khác sửa. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
  if (current?.status === body.status) return problem(422, 'Trạng thái mới trùng trạng thái đang ghi.', 'ATTENDANCE_UNCHANGED')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return problem(400, 'Sửa điểm danh đã chốt cần lý do.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
  }
  return HttpResponse.json(editClosedAttendance(activity, day, targetId, body.status as AttendanceStatus, reason, actorId))
}

function attendanceRoutes(path: string, resolve: (params: Params, userId: string) => Resolved) {
  return [
    http.get(`${API}${path}/attendance`, async ({ request, params }) => {
      await networkDelay()
      const user = currentUser()
      if (!user.ok) return user.response
      const resolved = resolve(params, user.value.id)
      if (!resolved.ok) return resolved.response
      const { activity } = resolved
      if (!activity.canView(user.value.id)) return problem(403, activity.forbidden.view, 'FORBIDDEN')
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      if (status && !ATTENDANCE_FILTERS.includes(status)) return problem(400, 'Bộ lọc trạng thái không hợp lệ.', 'VALIDATION', [{ field: 'status', message: 'Chọn một trạng thái.' }])
      const requested = url.searchParams.get('day')
      const day = requested ? dayOf(activity, requested) : { ok: true as const, day: defaultDay(activity) }
      if (!day.ok) return day.response
      return HttpResponse.json(buildSheet(activity, user.value.id, day.day, url))
    }),

    http.put(`${API}${path}/attendance/records/:userId`, async ({ request, params }) => {
      await networkDelay()
      const user = writer(request)
      if (!user.ok) return user.response
      const resolved = resolve(params, user.value.id)
      if (!resolved.ok) return resolved.response
      const { activity } = resolved
      if (!activity.canView(user.value.id)) return problem(403, activity.forbidden.view, 'FORBIDDEN')
      if (activity.readOnlyReason) return problem(422, activity.readOnlyReason, 'EVENT_READ_ONLY')
      if (!activity.canMark(user.value.id)) return problem(403, activity.forbidden.mark, 'FORBIDDEN')
      const body = (await request.json()) as Partial<MarkAttendanceRequest>
      const day = dayOf(activity, body.day)
      if (!day.ok) return day.response
      if (!body.status || !ATTENDANCE_STATUSES.includes(body.status as AttendanceStatus)) {
        return problem(400, 'Trạng thái điểm danh không hợp lệ.', 'VALIDATION', [{ field: 'status', message: 'Chọn một trạng thái.' }])
      }
      const targetId = String(params.userId)
      const expected = sheetEntries(activity, day.day).some((entry) => entry.userId === targetId)
      if (!expected && !canAccessClub(targetId, activity.clubId)) return problem(404, 'Người này không thuộc CLB.', 'MEMBER_NOT_FOUND')
      if (sheetStateOf(activity, day.day).closedAt) return editClosed(activity, day.day, targetId, body, user.value.id)
      const blocked = writeGuard(activity, day.day)
      if (blocked) return blocked
      const current = recordsOf(activity, day.day).find((record) => record.userId === targetId)
      if ((current?.version ?? 0) !== body.version) {
        return problem(409, 'Người này vừa được điểm danh ở nơi khác. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
      }
      return HttpResponse.json(writeAttendance(activity, day.day, targetId, body.status, user.value.id, 'MANUAL'))
    }),

    http.get(`${API}${path}/attendance/candidates`, async ({ request, params }) => {
      await networkDelay()
      const user = currentUser()
      if (!user.ok) return user.response
      const resolved = resolve(params, user.value.id)
      if (!resolved.ok) return resolved.response
      const { activity } = resolved
      if (!activity.canMark(user.value.id)) return problem(403, activity.forbidden.mark, 'FORBIDDEN')
      // Tên và ban của thành viên chỉ người cùng CLB xem được (SRS 3.5); CTV, nhân sự CLB đồng tổ chức không dò được.
      if (!canAccessClub(user.value.id, activity.clubId)) return problem(403, 'Chỉ thành viên CLB được tìm thành viên để thêm người phát sinh.', 'FORBIDDEN')
      const url = new URL(request.url)
      const requested = url.searchParams.get('day')
      const day = requested ? dayOf(activity, requested) : { ok: true as const, day: defaultDay(activity) }
      if (!day.ok) return day.response
      const listed = new Set(sheetEntries(activity, day.day).map((entry) => entry.userId))
      // Người phát sinh là thành viên CLB (kể cả Tạm nghỉ) chưa có trong danh sách (FR-ATT-07).
      const candidates = eligibleMembers(activity.clubId, { statuses: ROSTER_STATUSES, keyword: url.searchParams.get('q') })
        .filter((member) => !listed.has(member.id))
        .slice(0, 20)
      return HttpResponse.json(candidates)
    }),

    http.get(`${API}${path}/attendance/code`, async ({ request, params }) => {
      await networkDelay()
      const user = currentUser()
      if (!user.ok) return user.response
      const resolved = resolve(params, user.value.id)
      if (!resolved.ok) return resolved.response
      const { activity } = resolved
      if (!activity.canMark(user.value.id)) return problem(403, activity.forbidden.qr, 'FORBIDDEN')
      if (activity.readOnlyReason) return problem(422, activity.readOnlyReason, 'EVENT_READ_ONLY')
      const requested = new URL(request.url).searchParams.get('day')
      const day = requested ? dayOf(activity, requested) : { ok: true as const, day: defaultDay(activity) }
      if (!day.ok) return day.response
      // Mã chỉ hợp lệ từ giờ mở tới khi chốt (BR-ATT-02).
      const blocked = writeGuard(activity, day.day)
      if (blocked) return blocked
      return HttpResponse.json(currentCode(activity, day.day), { headers: { 'Cache-Control': 'no-store' } })
    }),

    http.post(`${API}${path}/attendance/transitions`, async ({ request, params }) => {
      await networkDelay()
      const user = writer(request)
      if (!user.ok) return user.response
      const resolved = resolve(params, user.value.id)
      if (!resolved.ok) return resolved.response
      const { activity } = resolved
      if (!activity.canView(user.value.id)) return problem(403, activity.forbidden.view, 'FORBIDDEN')
      if (activity.readOnlyReason) return problem(422, activity.readOnlyReason, 'EVENT_READ_ONLY')
      if (!activity.canClose(user.value.id)) return problem(403, activity.forbidden.close, 'FORBIDDEN')
      const body = (await request.json()) as Partial<CloseAttendanceRequest>
      if (body.action !== 'CLOSE') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
      const day = dayOf(activity, body.day)
      if (!day.ok) return day.response
      const blocked = writeGuard(activity, day.day)
      if (blocked) return blocked
      if (sheetStateOf(activity, day.day).version !== body.version) {
        return problem(409, 'Danh sách điểm danh vừa thay đổi. Kiểm tra lại số người trước khi chốt.', 'VERSION_CONFLICT')
      }
      closeAttendance(activity, day.day, user.value.id)
      return HttpResponse.json(buildSheet(activity, user.value.id, day.day, new URL(request.url)))
    }),
  ]
}

/** Tìm buổi hoặc sự kiện cho người quét, chưa xét quyền: mọi lỗi tới đây đều trả như mã sai để không lộ buổi có tồn tại hay không. */
function locateSession(params: Params): AttendanceActivity | null {
  const session = db.sessions.find((candidate) => candidate.id === params.sessionId && candidate.clubId === String(params.clubId))
  return session ? sessionActivity(session) : null
}

function locateEvent(params: Params): AttendanceActivity | null {
  const event = db.events.find((candidate) => candidate.id === params.eventId && candidate.clubId === String(params.clubId))
  return event && eventAttendanceAvailable(event) ? eventActivity(event) : null
}

/** FR-ATT-06: kiểm đăng nhập, mã (422 `INVALID_CODE`), thành viên (403), đã chốt, chưa mở (422); quét lại trả bản ghi cũ (BR-ATT-01). */
function checkInRoute(path: string, locate: (params: Params) => AttendanceActivity | null) {
  return http.post(`${API}${path}/attendance/check-ins`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const body = (await request.json()) as Partial<AttendanceCheckInRequest>
    const activity = locate(params)
    const day = activity && activity.days.length > 0 ? (typeof body.day === 'string' && activity.days.includes(body.day) ? body.day : undefined) : null
    if (!activity || day === undefined || typeof body.code !== 'string' || !isCurrentCode(activity, day, body.code)) {
      return problem(422, 'Mã điểm danh không đúng hoặc đã hết hạn. Quét lại mã đang chiếu.', 'INVALID_CODE')
    }
    const userId = user.value.id
    if (!canAccessClub(userId, activity.clubId)) return problem(403, 'Chỉ thành viên CLB tự điểm danh được bằng mã QR.', 'NOT_A_MEMBER')
    if (activity.cancelled) return problem(422, 'Buổi sinh hoạt đã hủy nên không điểm danh được.', 'SESSION_CANCELLED')
    if (activity.readOnlyReason || sheetStateOf(activity, day).closedAt) return problem(422, 'Điểm danh đã chốt, không ghi nhận thêm.', 'ATTENDANCE_CLOSED')
    if (!isAttendanceOpen(activity, day)) return problem(422, `Điểm danh mở lúc ${formatDateTime(activity.opensAt(day))}.`, 'ATTENDANCE_NOT_OPEN')
    const result = (status: AttendanceStatus, recordedAt: string, alreadyRecorded: boolean): AttendanceCheckIn => ({
      activity: { type: activity.type, id: activity.id, name: activity.name },
      clubName: db.clubs.find((club) => club.id === activity.clubId)?.name ?? '',
      day,
      status,
      recordedAt,
      alreadyRecorded,
    })
    const existing = recordsOf(activity, day).find((record) => record.userId === userId)
    if (existing) return HttpResponse.json(result(existing.status, existing.recordedAt, true))
    const status: AttendanceStatus = Date.now() > Date.parse(activity.startsAt(day)) ? 'LATE' : 'PRESENT'
    const row = writeAttendance(activity, day, userId, status, userId, 'QR')
    return HttpResponse.json(result(status, row.record?.recordedAt ?? '', false), { status: 201 })
  })
}

/** FR-EVT-12, FR-ATT-07: BTC tra khách mời theo mã, email, SĐT rồi ghi có mặt từng ngày của sự kiện. */
const guestRoutes = [
  http.get(`${API}/clubs/:clubId/events/:eventId/guest-registrations`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const resolved = resolveEvent(params, user.value.id)
    if (!resolved.ok) return resolved.response
    const url = new URL(request.url)
    const day = url.searchParams.get('day')
    const rows = activeRegistrations(String(params.eventId))
      .filter((registration) => matchesGuest(registration, url.searchParams.get('q') ?? ''))
      .toSorted((a, b) => (a.guest?.fullName ?? '').localeCompare(b.guest?.fullName ?? '', 'vi'))
      .map((registration) => toGuestRow(registration, day && resolved.activity.days.includes(day) ? day : (resolved.activity.days[0] ?? null)))
    return HttpResponse.json(rows)
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/guest-registrations/:registrationId/check-ins`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const resolved = resolveEvent(params, user.value.id)
    if (!resolved.ok) return resolved.response
    const { activity } = resolved
    const registration = db.registrations.find((candidate) => candidate.id === params.registrationId && candidate.eventId === params.eventId && candidate.guest !== null)
    if (!registration?.guest) return problem(404, 'Không tìm thấy khách mời.', 'GUEST_NOT_FOUND')
    if (!activity.canMark(user.value.id)) return problem(403, 'Chỉ ban tổ chức ghi có mặt cho khách mời.', 'FORBIDDEN')
    const body = (await request.json()) as { day?: unknown }
    const day = dayOf(activity, body.day)
    if (!day.ok) return day.response
    const blocked = writeGuard(activity, day.day)
    if (blocked) return blocked
    if (!holdsSeat(registration)) return problem(422, 'Khách chưa được nhận chỗ nên chưa ghi có mặt được.', 'GUEST_NOT_SEATED')
    if (registration.guest.checkIns.some((checkIn) => checkIn.day === day.day)) return problem(422, 'Khách đã được ghi có mặt ngày này.', 'ALREADY_CHECKED_IN')
    registration.guest.checkIns.push({ day: day.day ?? '', at: nowIso(), by: user.value.id })
    return HttpResponse.json(toGuestRow(registration, day.day))
  }),
]

export const attendanceHandlers = [
  ...attendanceRoutes('/clubs/:clubId/sessions/:sessionId', resolveSession),
  ...attendanceRoutes('/clubs/:clubId/events/:eventId', resolveEvent),
  checkInRoute('/clubs/:clubId/sessions/:sessionId', locateSession),
  checkInRoute('/clubs/:clubId/events/:eventId', locateEvent),
  ...guestRoutes,
]
