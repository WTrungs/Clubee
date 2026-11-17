import { http, HttpResponse } from 'msw'
import type { AttendanceStatus, CloseAttendanceRequest, MarkAttendanceRequest } from '@/features/attendance/model/attendanceTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { db } from '../db'
import {
  ATTENDANCE_FILTERS,
  ATTENDANCE_STATUSES,
  buildSheet,
  closeAttendance,
  currentCode,
  defaultDay,
  eventActivity,
  eventAttendanceAvailable,
  isAttendanceOpen,
  recordsOf,
  sessionActivity,
  sheetEntries,
  sheetStateOf,
  writeAttendance,
  type AttendanceActivity,
} from '../mockAttendance'
import { API, currentUser, networkDelay, problem, writer } from '../mockHttp'
import { canAccessClub, eligibleMembers, ROSTER_STATUSES } from '../mockMembers'

type Resolved = { ok: true; activity: AttendanceActivity } | { ok: false; response: Response }
type Params = Record<string, string | readonly string[] | undefined>

function resolveSession(params: Params, userId: string): Resolved {
  const clubId = String(params.clubId)
  if (!canAccessClub(userId, clubId)) return { ok: false, response: problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER') }
  const session = db.sessions.find((candidate) => candidate.id === params.sessionId && candidate.clubId === clubId)
  if (!session) return { ok: false, response: problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND') }
  return { ok: true, activity: sessionActivity(session) }
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

export const attendanceHandlers = [
  ...attendanceRoutes('/clubs/:clubId/sessions/:sessionId', resolveSession),
  ...attendanceRoutes('/clubs/:clubId/events/:eventId', resolveEvent),
]
