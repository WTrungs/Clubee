import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type {
  CancelSessionRequest,
  CreateSessionRequest,
  CreateSessionSeriesRequest,
  SessionAction,
  SessionDetail,
  SessionSummary,
  UpdateSessionRequest,
} from '@/features/attendance/model/sessionTypes'
import { formatDate, formatTime, formatTimeRange } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { recurrenceDays, recurrenceError, seriesTimes, vnDayOf, type RecurrenceFrequency } from '@/shared/lib/sessionRecurrence'
import { db, type DbSession } from '../db'
import { managesSession, sessionAudience, sessionScopesFor } from '../mockAttendance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, isActiveMember, personRef } from '../mockMembers'
import { notify, sessionTarget } from '../mockNotifications'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const FREQUENCIES: RecurrenceFrequency[] = ['WEEKLY', 'MONTHLY']

const seriesOf = (seriesId: string) =>
  db.sessions.filter((session) => session.seriesId === seriesId).toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id))

function toSummary(session: DbSession): SessionSummary {
  const department = db.departments.find((candidate) => candidate.id === session.departmentId)
  const series = session.seriesId ? seriesOf(session.seriesId) : []
  return {
    id: session.id,
    clubId: session.clubId,
    title: session.title,
    scope: {
      type: session.departmentId ? 'DEPARTMENT' : 'CLUB',
      departmentId: session.departmentId,
      departmentName: department?.name ?? null,
    },
    startAt: session.startAt,
    endAt: session.endAt,
    location: session.location,
    capacity: session.capacity,
    registrationDeadline: session.registrationDeadline,
    attendanceClosed: db.attendanceSheets.some((sheet) => sheet.activityType === 'SESSION' && sheet.activityId === session.id && sheet.closedAt !== null),
    series: session.seriesId ? { id: session.seriesId, index: series.findIndex((item) => item.id === session.id) + 1, count: series.length } : null,
    cancelled: session.cancelledAt !== null,
  }
}

/** Buổi đã hủy không còn điểm danh; sửa, hủy chỉ trước giờ bắt đầu. */
function sessionActions(session: DbSession, userId: string): SessionAction[] {
  if (session.cancelledAt !== null || !managesSession(userId, session)) return []
  return ['VIEW_ATTENDANCE', ...(Date.parse(session.startAt) > Date.now() ? (['EDIT', 'CANCEL'] as const) : [])]
}

function toDetail(session: DbSession, userId: string): SessionDetail {
  return {
    ...toSummary(session),
    description: session.description,
    creator: personRef(session.createdBy),
    createdAt: session.createdAt,
    allowedActions: sessionActions(session, userId),
    cancellation:
      session.cancelledAt && session.cancelledBy ? { by: personRef(session.cancelledBy), at: session.cancelledAt, reason: session.cancelReason ?? '' } : null,
    version: session.version,
  }
}

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function validate(body: Partial<CreateSessionRequest>) {
  const title = (body.title ?? '').trim()
  const description = (body.description ?? '').trim()
  const location = (body.location ?? '').trim()
  const { startAt, endAt, capacity, registrationDeadline } = body
  const errors: FieldError[] = [
    ...(title.length < 3 || title.length > 150 ? [{ field: 'title', message: 'Tên buổi cần từ 3 đến 150 ký tự.' }] : []),
    ...(description.length > 3000 ? [{ field: 'description', message: 'Nội dung tối đa 3000 ký tự.' }] : []),
    ...(!location || location.length > 200 ? [{ field: 'location', message: 'Nhập địa điểm, tối đa 200 ký tự.' }] : []),
    ...(!isTimestamp(startAt) || Date.parse(startAt) <= Date.now() ? [{ field: 'startAt', message: 'Buổi phải bắt đầu sau thời điểm hiện tại.' }] : []),
    ...(!isTimestamp(endAt) || (isTimestamp(startAt) && Date.parse(endAt) <= Date.parse(startAt))
      ? [{ field: 'endAt', message: 'Kết thúc phải sau bắt đầu.' }]
      : []),
    ...(capacity !== null && capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 99_999)
      ? [{ field: 'capacity', message: 'Số chỗ là số nguyên dương, để trống nếu không giới hạn.' }]
      : []),
    ...(registrationDeadline !== null &&
    registrationDeadline !== undefined &&
    (!isTimestamp(registrationDeadline) || (isTimestamp(startAt) && Date.parse(registrationDeadline) > Date.parse(startAt)))
      ? [{ field: 'registrationDeadline', message: 'Hạn đăng ký phải trước giờ bắt đầu.' }]
      : []),
  ]
  return { title, description, location, errors }
}

/** Phạm vi người gửi được tạo buổi (FR-ATT-01); trả mã ban hoặc lỗi 403 kèm lý do. */
function creationScope(userId: string, clubId: string, body: Partial<CreateSessionRequest>): { ok: true; departmentId: string | null } | { ok: false; response: Response } {
  const departmentId = body.scopeType === 'DEPARTMENT' ? (body.departmentId ?? null) : null
  if (sessionScopesFor(userId, clubId).some((scope) => scope.type === body.scopeType && scope.departmentId === departmentId)) return { ok: true, departmentId }
  if (!isActiveMember(userId, clubId)) return { ok: false, response: problem(403, 'Thành viên Tạm nghỉ không tạo được buổi sinh hoạt.', 'FORBIDDEN') }
  return {
    ok: false,
    response: problem(
      403,
      body.scopeType === 'CLUB'
        ? 'Chỉ ban chủ nhiệm tạo được buổi sinh hoạt toàn CLB.'
        : 'Bạn chỉ tạo được buổi sinh hoạt cho ban đang hoạt động mà mình là Trưởng ban hoặc Phó ban.',
      'FORBIDDEN',
    ),
  }
}

function newSession(fields: Omit<DbSession, 'id' | 'createdAt' | 'cancelledAt' | 'cancelledBy' | 'cancelReason' | 'version'>): DbSession {
  const session: DbSession = { id: newId('s'), createdAt: nowIso(), cancelledAt: null, cancelledBy: null, cancelReason: null, version: 1, ...fields }
  db.sessions.push(session)
  return session
}

function findSession(params: Record<string, string | readonly string[] | undefined>) {
  return db.sessions.find((candidate) => candidate.id === params.sessionId && candidate.clubId === String(params.clubId))
}

/** Kiểm tra chung cho sửa, hủy: người phụ trách → version → đã hủy → đã bắt đầu. */
function editGuard(session: DbSession, userId: string, version: unknown, what: string): Response | null {
  if (!managesSession(userId, session)) return problem(403, `Chỉ người phụ trách buổi và ban chủ nhiệm được ${what} buổi sinh hoạt.`, 'FORBIDDEN')
  if (version !== session.version) return problem(409, 'Buổi sinh hoạt vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
  if (session.cancelledAt) return problem(422, 'Buổi sinh hoạt đã hủy.', 'SESSION_CANCELLED')
  if (Date.parse(session.startAt) <= Date.now()) return problem(422, `Buổi đã bắt đầu nên không ${what} được nữa.`, 'SESSION_STARTED')
  return null
}

export const sessionHandlers = [
  http.get(`${API}/clubs/:clubId/sessions`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const url = new URL(request.url)
    const past = url.searchParams.get('when') === 'PAST'
    const scopeType = url.searchParams.get('scopeType')
    const departmentId = url.searchParams.get('departmentId')
    const keyword = url.searchParams.get('q')
    const now = Date.now()
    const sessions = db.sessions
      .filter((session) => session.clubId === clubId)
      .filter((session) => (past ? Date.parse(session.endAt) < now : Date.parse(session.endAt) >= now))
      .filter((session) => scopeType !== 'CLUB' || session.departmentId === null)
      .filter((session) => scopeType !== 'DEPARTMENT' || (session.departmentId !== null && (!departmentId || session.departmentId === departmentId)))
      .filter((session) => matchesKeyword(`${session.title} ${session.location}`, keyword))
      .toSorted((a, b) => (past ? -1 : 1) * (Date.parse(a.startAt) - Date.parse(b.startAt)) || a.id.localeCompare(b.id))
    const page = paginate(sessions, url, 12)
    return HttpResponse.json({ ...page, content: page.content.map(toSummary) })
  }),

  http.get(`${API}/clubs/:clubId/session-scopes`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    return HttpResponse.json(sessionScopesFor(user.value.id, clubId))
  }),

  http.get(`${API}/clubs/:clubId/sessions/:sessionId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    return HttpResponse.json(toDetail(session, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/sessions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const body = (await request.json()) as Partial<CreateSessionRequest>
    const scope = creationScope(user.value.id, clubId, body)
    if (!scope.ok) return scope.response
    const { title, description, location, errors } = validate(body)
    if (errors.length > 0) return problem(400, 'Thông tin buổi sinh hoạt chưa hợp lệ.', 'VALIDATION', errors)
    const session = newSession({
      clubId,
      departmentId: scope.departmentId,
      title,
      description,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      location,
      capacity: body.capacity ?? null,
      registrationDeadline: body.registrationDeadline ?? null,
      createdBy: user.value.id,
      seriesId: null,
    })
    notify(sessionAudience(session), {
      clubId,
      category: 'SESSION',
      title: `Buổi sinh hoạt mới: ${session.title}`,
      body: `${formatTimeRange(session.startAt, session.endAt)} tại ${session.location}.`,
      target: sessionTarget(clubId, session.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toDetail(session, user.value.id), { status: 201 })
  }),

  // FR-ATT-02: tạo cả chuỗi trong một lần; mỗi buổi là một bản ghi riêng nên sửa một buổi không ảnh hưởng buổi khác.
  http.post(`${API}/clubs/:clubId/session-series`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const body = (await request.json()) as Partial<CreateSessionSeriesRequest>
    const scope = creationScope(user.value.id, clubId, body)
    if (!scope.ok) return scope.response
    const { title, description, location, errors } = validate(body)
    const frequency = FREQUENCIES.find((candidate) => candidate === body.recurrence?.frequency)
    const until = typeof body.recurrence?.until === 'string' ? body.recurrence.until : ''
    if (!frequency) errors.push({ field: 'recurrence.frequency', message: 'Chọn lặp hằng tuần hoặc hằng tháng.' })
    const firstDay = isTimestamp(body.startAt) ? vnDayOf(body.startAt) : null
    const seriesError = frequency && firstDay ? recurrenceError(firstDay, frequency, until) : null
    if (seriesError) errors.push({ field: 'recurrence.until', message: seriesError })
    if (errors.length > 0 || !frequency || !firstDay) return problem(400, 'Thông tin chuỗi buổi sinh hoạt chưa hợp lệ.', 'VALIDATION', errors)

    const seriesId = newId('ser')
    const times = seriesTimes(
      { startAt: body.startAt as string, endAt: body.endAt as string, registrationDeadline: body.registrationDeadline ?? null },
      recurrenceDays(firstDay, frequency, until),
    )
    const sessions = times.map((time) =>
      newSession({ clubId, departmentId: scope.departmentId, title, description, location, capacity: body.capacity ?? null, createdBy: user.value.id, seriesId, ...time }),
    )
    const first = sessions[0] as DbSession
    const last = sessions.at(-1) as DbSession
    // Một thông báo cho cả chuỗi thay vì mỗi buổi một tin.
    notify(sessionAudience(first), {
      clubId,
      category: 'SESSION',
      title: `Chuỗi buổi sinh hoạt mới: ${title}`,
      body: `${sessions.length} buổi ${frequency === 'WEEKLY' ? 'hằng tuần' : 'hằng tháng'} từ ${formatDate(first.startAt)} đến ${formatDate(last.startAt)}, bắt đầu lúc ${formatTime(first.startAt)} tại ${location}.`,
      target: sessionTarget(clubId, first.id),
      actorId: user.value.id,
    })
    return HttpResponse.json({ seriesId, sessions: sessions.map(toSummary) }, { status: 201 })
  }),

  http.patch(`${API}/clubs/:clubId/sessions/:sessionId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    const body = (await request.json()) as Partial<UpdateSessionRequest>
    const blocked = editGuard(session, user.value.id, body.version, 'sửa')
    if (blocked) return blocked
    const { title, description, location, errors } = validate(body)
    if (errors.length > 0) return problem(400, 'Thông tin buổi sinh hoạt chưa hợp lệ.', 'VALIDATION', errors)
    const sameTime = (a: string, b: unknown) => typeof b === 'string' && Date.parse(a) === Date.parse(b)
    const moved = !sameTime(session.startAt, body.startAt) || !sameTime(session.endAt, body.endAt) || session.location !== location
    Object.assign(session, {
      title,
      description,
      location,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      capacity: body.capacity ?? null,
      registrationDeadline: body.registrationDeadline ?? null,
      version: session.version + 1,
    })
    if (moved) {
      notify(sessionAudience(session), {
        clubId,
        category: 'SESSION',
        title: `Buổi sinh hoạt đổi giờ hoặc địa điểm: ${session.title}`,
        body: `Lịch mới: ${formatTimeRange(session.startAt, session.endAt)} tại ${session.location}.`,
        target: sessionTarget(clubId, session.id),
        actorId: user.value.id,
      })
    }
    return HttpResponse.json(toDetail(session, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/sessions/:sessionId/cancellation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    const body = (await request.json()) as Partial<CancelSessionRequest>
    const blocked = editGuard(session, user.value.id, body.version, 'hủy')
    if (blocked) return blocked
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return problem(400, 'Vui lòng nhập lý do hủy buổi.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    Object.assign(session, { cancelledAt: nowIso(), cancelledBy: user.value.id, cancelReason: reason, version: session.version + 1 })
    notify(sessionAudience(session), {
      clubId,
      category: 'SESSION',
      title: `Buổi sinh hoạt bị hủy: ${session.title}`,
      body: `${formatTimeRange(session.startAt, session.endAt)}. Lý do: ${reason}`,
      target: sessionTarget(clubId, session.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toDetail(session, user.value.id))
  }),
]
