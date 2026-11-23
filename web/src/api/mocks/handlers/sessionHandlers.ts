import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type {
  AbsenceDecisionRequest,
  CancelSessionRequest,
  CreateAbsenceRequest,
  CreateSessionRequest,
  CreateSessionSeriesRequest,
  SessionAction,
  SessionDetail,
  SessionRegistrationRow,
  SessionSummary,
  UpdateSessionRequest,
} from '@/features/attendance/model/sessionTypes'
import { formatDate, formatDateTime, formatTime, formatTimeRange } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { recurrenceDays, recurrenceError, seriesTimes, vnDayOf, type RecurrenceFrequency } from '@/shared/lib/sessionRecurrence'
import { db, type DbAbsenceRequest, type DbSession, type DbSessionRegistration } from '../db'
import {
  activeAbsenceRequest,
  canWithdrawAbsence,
  latestAbsenceRequest,
  pendingAbsenceCount,
  toAbsenceRequestRow,
  toMyAbsenceRequest,
} from '../mockAbsence'
import { managesSession, sessionActivity, sessionAudience, sessionScopesFor } from '../mockAttendance'
import {
  activeSessionRegistrations,
  mySessionRegistration,
  promoteSessionWaitlist,
  sessionCancelDeadline,
  sessionRegistrationClosesAt,
  sessionRegistrationOpen,
  sessionSeats,
  sessionSeatsTaken,
  sessionWaitlistPosition,
  toMySessionRegistration,
} from '../mockSessionRegistrations'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, isActiveMember, personRef } from '../mockMembers'
import { notify, sessionTarget } from '../mockNotifications'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const FREQUENCIES: RecurrenceFrequency[] = ['WEEKLY', 'MONTHLY']

const seriesOf = (seriesId: string) =>
  db.sessions.filter((session) => session.seriesId === seriesId).toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id))

const attendanceClosed = (sessionId: string) =>
  db.attendanceSheets.some((sheet) => sheet.activityType === 'SESSION' && sheet.activityId === sessionId && sheet.closedAt !== null)

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
    attendanceClosed: attendanceClosed(session.id),
    series: session.seriesId ? { id: session.seriesId, index: series.findIndex((item) => item.id === session.id) + 1, count: series.length } : null,
    cancelled: session.cancelledAt !== null,
  }
}

/** Người gọi tự đăng ký được (FR-ATT-03): thuộc đối tượng, buổi còn nhận đăng ký, chưa có đăng ký còn hiệu lực. */
const canRegister = (session: DbSession, userId: string) =>
  sessionRegistrationOpen(session) && sessionAudience(session).includes(userId) && !mySessionRegistration(userId, session.id)

/** Xin phép vắng (FR-ATT-04, BR-ATT-03): người thuộc đối tượng điểm danh (buổi có số chỗ: người giữ chỗ), trước giờ bắt đầu, chưa chốt, chưa có đơn còn hiệu lực. */
const canRequestAbsence = (session: DbSession, userId: string) =>
  session.cancelledAt === null &&
  Date.parse(session.startAt) > Date.now() &&
  !attendanceClosed(session.id) &&
  sessionActivity(session).expected(null).includes(userId) &&
  !activeAbsenceRequest(userId, session.id)

/** Buổi đã hủy không còn thao tác nào; sửa, hủy chỉ trước giờ bắt đầu. */
function sessionActions(session: DbSession, userId: string): SessionAction[] {
  if (session.cancelledAt !== null) return []
  const actions: SessionAction[] = []
  if (managesSession(userId, session)) {
    actions.push('VIEW_ATTENDANCE')
    if (session.capacity !== null) actions.push('VIEW_REGISTRATIONS')
    actions.push('VIEW_ABSENCE_REQUESTS')
    if (Date.parse(session.startAt) > Date.now()) actions.push('EDIT', 'CANCEL')
  }
  if (canRegister(session, userId)) actions.push('REGISTER')
  if (canRequestAbsence(session, userId)) actions.push('REQUEST_ABSENCE')
  return actions
}

function toDetail(session: DbSession, userId: string): SessionDetail {
  const mine = mySessionRegistration(userId, session.id)
  const absence = latestAbsenceRequest(userId, session.id)
  return {
    ...toSummary(session),
    description: session.description,
    creator: personRef(session.createdBy),
    createdAt: session.createdAt,
    allowedActions: sessionActions(session, userId),
    cancellation:
      session.cancelledAt && session.cancelledBy ? { by: personRef(session.cancelledBy), at: session.cancelledAt, reason: session.cancelReason ?? '' } : null,
    seats: sessionSeats(session),
    myRegistration: mine ? toMySessionRegistration(session, mine) : null,
    myAbsenceRequest: absence ? toMyAbsenceRequest(absence, session) : null,
    pendingAbsenceCount: managesSession(userId, session) ? pendingAbsenceCount(session.id) : null,
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

/** Người nhận đơn xin phép mới: người tạo buổi nếu còn phụ trách, không thì mọi người đang phụ trách buổi. */
function absenceReviewers(session: DbSession): string[] {
  if (managesSession(session.createdBy, session)) return [session.createdBy]
  const members = db.memberships.filter((membership) => membership.clubId === session.clubId).map((membership) => membership.userId)
  return [...new Set(members)].filter((userId) => managesSession(userId, session))
}

/** Luật số chỗ khi sửa buổi đã có người đăng ký (FR-ATT-03): không hạ dưới số chỗ đang giữ, không bỏ giới hạn. */
function capacityRule(session: DbSession, capacity: unknown): Response | null {
  const registered = activeSessionRegistrations(session.id).length
  if (registered === 0) return null
  if (capacity === null || capacity === undefined) {
    return problem(422, `Buổi đã có ${registered} người đăng ký nên không bỏ giới hạn chỗ được.`, 'CAPACITY_REQUIRED')
  }
  const taken = sessionSeatsTaken(session.id)
  if (typeof capacity === 'number' && Number.isInteger(capacity) && capacity < taken) {
    return problem(422, `Đã có ${taken} người giữ chỗ nên số chỗ không thể ít hơn ${taken}.`, 'CAPACITY_BELOW_TAKEN')
  }
  return null
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
    const seatRule = capacityRule(session, body.capacity)
    if (seatRule) return seatRule
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
    // Tăng số chỗ thì người đầu danh sách chờ được nhận chỗ ngay.
    promoteSessionWaitlist(session, user.value.id)
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

  // FR-ATT-03: tự đăng ký buổi có giới hạn chỗ; hết chỗ thì vào danh sách chờ theo thứ tự đăng ký (BR-EVT-03).
  http.post(`${API}/clubs/:clubId/sessions/:sessionId/registrations`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    if (!sessionAudience(session).includes(user.value.id)) {
      return problem(403, 'Chỉ thành viên Thử việc, Chính thức thuộc phạm vi của buổi được đăng ký.', 'FORBIDDEN')
    }
    if (mySessionRegistration(user.value.id, session.id)) return problem(409, 'Bạn đã đăng ký buổi này.', 'ALREADY_REGISTERED')
    if (session.cancelledAt) return problem(422, 'Buổi sinh hoạt đã hủy.', 'SESSION_CANCELLED')
    if (session.capacity === null) return problem(422, 'Buổi không giới hạn chỗ nên không cần đăng ký.', 'REGISTRATION_NOT_REQUIRED')
    if (!sessionRegistrationOpen(session)) {
      return problem(422, `Buổi đã hết hạn đăng ký (${formatDateTime(sessionRegistrationClosesAt(session))}).`, 'REGISTRATION_CLOSED')
    }
    db.sessionRegistrations.push({
      id: newId('sr'),
      sessionId: session.id,
      userId: user.value.id,
      status: sessionSeatsTaken(session.id) < session.capacity ? 'CONFIRMED' : 'WAITLISTED',
      registeredAt: nowIso(),
      cancelledAt: null,
      promotedAt: null,
    })
    return HttpResponse.json(toDetail(session, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/sessions/:sessionId/registrations/:registrationId/cancellation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    const registration = db.sessionRegistrations.find((candidate) => candidate.id === params.registrationId && candidate.sessionId === params.sessionId)
    // Chỉ chính người đăng ký hủy được; đăng ký của người khác coi như không tồn tại.
    if (!session || !registration || registration.userId !== user.value.id) return problem(404, 'Không tìm thấy đăng ký.', 'REGISTRATION_NOT_FOUND')
    if (registration.status === 'CANCELLED') return problem(422, 'Đăng ký này đã hủy.', 'REGISTRATION_CANCELLED')
    if (session.cancelledAt) return problem(422, 'Buổi sinh hoạt đã hủy.', 'SESSION_CANCELLED')
    const deadline = sessionCancelDeadline(session, registration)
    if (Date.parse(deadline) <= Date.now()) {
      return problem(422, `Đã qua hạn hủy đăng ký (${formatDateTime(deadline)}). Báo người phụ trách buổi nếu bạn không đến được.`, 'CANCEL_DEADLINE_PASSED')
    }
    const freesSeat = registration.status === 'CONFIRMED'
    Object.assign(registration, { status: 'CANCELLED', cancelledAt: nowIso() })
    if (freesSeat) promoteSessionWaitlist(session, user.value.id)
    return HttpResponse.json(toDetail(session, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/sessions/:sessionId/registrations`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    if (!managesSession(user.value.id, session)) return problem(403, 'Chỉ người phụ trách buổi và ban chủ nhiệm xem được danh sách đăng ký.', 'FORBIDDEN')
    const url = new URL(request.url)
    const keyword = url.searchParams.get('q')
    const order = (registration: DbSessionRegistration) => (registration.status === 'CONFIRMED' ? 0 : 1)
    const rows: SessionRegistrationRow[] = activeSessionRegistrations(session.id)
      .filter((registration) => matchesKeyword(personRef(registration.userId).fullName, keyword))
      .toSorted((a, b) => order(a) - order(b) || (sessionWaitlistPosition(a) ?? 0) - (sessionWaitlistPosition(b) ?? 0) || Date.parse(a.registeredAt) - Date.parse(b.registeredAt))
      .map((registration) => ({
        id: registration.id,
        attendee: personRef(registration.userId),
        status: registration.status as SessionRegistrationRow['status'],
        waitlistPosition: sessionWaitlistPosition(registration),
        registeredAt: registration.registeredAt,
        promotedAt: registration.promotedAt,
      }))
    return HttpResponse.json(paginate(rows, url, 20))
  }),

  // FR-ATT-04, BR-ATT-03: xin phép vắng trước giờ bắt đầu; người phụ trách duyệt trước khi chốt điểm danh.
  http.post(`${API}/clubs/:clubId/sessions/:sessionId/absence-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    if (!sessionActivity(session).expected(null).includes(user.value.id)) {
      const message =
        session.capacity === null
          ? 'Bạn không thuộc đối tượng của buổi này.'
          : 'Buổi có giới hạn chỗ: chỉ người đang giữ chỗ cần xin phép vắng; người đang chờ có thể hủy đăng ký.'
      return problem(403, message, 'FORBIDDEN')
    }
    if (activeAbsenceRequest(user.value.id, session.id)) return problem(409, 'Bạn đã có đơn xin phép cho buổi này.', 'ALREADY_REQUESTED')
    if (session.cancelledAt) return problem(422, 'Buổi sinh hoạt đã hủy.', 'SESSION_CANCELLED')
    if (Date.parse(session.startAt) <= Date.now() || attendanceClosed(session.id)) {
      return problem(422, 'Buổi đã bắt đầu nên không xin phép vắng được nữa. Báo người phụ trách buổi để được ghi đúng.', 'SESSION_STARTED')
    }
    const body = (await request.json()) as Partial<CreateAbsenceRequest>
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return problem(400, 'Vui lòng nhập lý do xin phép.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    const created: DbAbsenceRequest = {
      id: newId('ab'),
      sessionId: session.id,
      userId: user.value.id,
      reason,
      status: 'PENDING',
      createdAt: nowIso(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      version: 1,
    }
    db.absenceRequests.push(created)
    notify(absenceReviewers(session), {
      clubId,
      category: 'SESSION',
      title: `Đơn xin phép vắng: ${session.title}`,
      body: `${personRef(user.value.id).fullName}: ${reason}`,
      target: sessionTarget(clubId, session.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toDetail(session, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/sessions/:sessionId/absence-requests/:requestId/withdrawal`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const session = findSession(params)
    const found = db.absenceRequests.find((candidate) => candidate.id === params.requestId && candidate.sessionId === params.sessionId)
    // Chỉ người gửi rút được; đơn của người khác coi như không tồn tại.
    if (!session || !found || found.userId !== user.value.id) return problem(404, 'Không tìm thấy đơn xin phép.', 'ABSENCE_REQUEST_NOT_FOUND')
    const body = (await request.json()) as { version?: unknown }
    if (body.version !== found.version) return problem(409, 'Đơn vừa được người phụ trách xử lý. Tải lại để xem kết quả.', 'VERSION_CONFLICT')
    if (!canWithdrawAbsence(found, session)) {
      return problem(422, 'Đơn đã bị từ chối, đã rút hoặc buổi đã bắt đầu nên không rút được.', 'ABSENCE_NOT_WITHDRAWABLE')
    }
    Object.assign(found, { status: 'WITHDRAWN', version: found.version + 1 })
    return HttpResponse.json(toDetail(session, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/sessions/:sessionId/absence-requests`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    if (!session) return problem(404, 'Không tìm thấy buổi sinh hoạt.', 'SESSION_NOT_FOUND')
    if (!managesSession(user.value.id, session)) return problem(403, 'Chỉ người phụ trách buổi và ban chủ nhiệm xem được đơn xin phép.', 'FORBIDDEN')
    const decidable = session.cancelledAt === null && !attendanceClosed(session.id)
    const order = (item: DbAbsenceRequest) => ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].indexOf(item.status)
    const rows = db.absenceRequests
      .filter((item) => item.sessionId === session.id)
      .toSorted((a, b) => order(a) - order(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((item) => toAbsenceRequestRow(item, decidable))
    return HttpResponse.json(rows)
  }),

  http.post(`${API}/clubs/:clubId/sessions/:sessionId/absence-requests/:requestId/decision`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const session = findSession(params)
    const found = db.absenceRequests.find((candidate) => candidate.id === params.requestId && candidate.sessionId === params.sessionId)
    if (!session || !found) return problem(404, 'Không tìm thấy đơn xin phép.', 'ABSENCE_REQUEST_NOT_FOUND')
    if (!managesSession(user.value.id, session)) return problem(403, 'Chỉ người phụ trách buổi và ban chủ nhiệm được duyệt đơn xin phép.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<AbsenceDecisionRequest>
    if (body.version !== found.version) return problem(409, 'Đơn vừa được rút hoặc được người khác xử lý. Tải lại để xem trạng thái mới.', 'VERSION_CONFLICT')
    if (session.cancelledAt) return problem(422, 'Buổi sinh hoạt đã hủy.', 'SESSION_CANCELLED')
    if (attendanceClosed(session.id)) return problem(422, 'Đã chốt điểm danh; sửa trạng thái của người này ở bảng điểm danh.', 'ATTENDANCE_CLOSED')
    if (found.status !== 'PENDING') return problem(422, 'Đơn không còn chờ duyệt.', 'ABSENCE_ALREADY_DECIDED')
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const errors = [
      ...(body.decision !== 'APPROVE' && body.decision !== 'REJECT' ? [{ field: 'decision', message: 'Chọn duyệt hoặc từ chối.' }] : []),
      ...(body.decision === 'REJECT' && (note.length < REASON_MIN || note.length > REASON_MAX)
        ? [{ field: 'note', message: `Nhập lý do từ chối từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }]
        : []),
      ...(body.decision === 'APPROVE' && note.length > REASON_MAX ? [{ field: 'note', message: `Ghi chú tối đa ${REASON_MAX} ký tự.` }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Quyết định chưa hợp lệ.', 'VALIDATION', errors)
    const approved = body.decision === 'APPROVE'
    Object.assign(found, {
      status: approved ? 'APPROVED' : 'REJECTED',
      decidedBy: user.value.id,
      decidedAt: nowIso(),
      decisionNote: note || null,
      version: found.version + 1,
    })
    notify([found.userId], {
      clubId,
      category: 'SESSION',
      title: approved ? `Đơn xin phép đã được duyệt: ${session.title}` : `Đơn xin phép bị từ chối: ${session.title}`,
      body: approved ? `Bạn được ghi Vắng có phép ở buổi ${formatTimeRange(session.startAt, session.endAt)}.` : `Lý do: ${note}`,
      target: sessionTarget(clubId, session.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toAbsenceRequestRow(found, true))
  }),
]
