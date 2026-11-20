import { http, HttpResponse } from 'msw'
import type { CreateSessionRequest, SessionDetail, SessionSummary } from '@/features/attendance/model/sessionTypes'
import { formatTimeRange } from '@/shared/format/formatDate'
import { db, type DbSession } from '../db'
import { managesSession, sessionAudience, sessionScopesFor } from '../mockAttendance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, isActiveMember, personRef } from '../mockMembers'
import { notify, sessionTarget } from '../mockNotifications'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')

function toSummary(session: DbSession): SessionSummary {
  const department = db.departments.find((candidate) => candidate.id === session.departmentId)
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
  }
}

function toDetail(session: DbSession, userId: string): SessionDetail {
  return {
    ...toSummary(session),
    description: session.description,
    creator: personRef(session.createdBy),
    createdAt: session.createdAt,
    allowedActions: managesSession(userId, session) ? ['VIEW_ATTENDANCE'] : [],
    version: session.version,
  }
}

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function validate(body: Partial<CreateSessionRequest>) {
  const title = (body.title ?? '').trim()
  const description = (body.description ?? '').trim()
  const location = (body.location ?? '').trim()
  const { startAt, endAt, capacity, registrationDeadline } = body
  const errors = [
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
    const session = db.sessions.find((candidate) => candidate.id === params.sessionId && candidate.clubId === clubId)
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
    const departmentId = body.scopeType === 'DEPARTMENT' ? (body.departmentId ?? null) : null
    const allowed = sessionScopesFor(user.value.id, clubId).some((scope) => scope.type === body.scopeType && scope.departmentId === departmentId)
    if (!allowed) {
      if (!isActiveMember(user.value.id, clubId)) return problem(403, 'Thành viên Tạm nghỉ không tạo được buổi sinh hoạt.', 'FORBIDDEN')
      return problem(
        403,
        body.scopeType === 'CLUB'
          ? 'Chỉ ban chủ nhiệm tạo được buổi sinh hoạt toàn CLB.'
          : 'Bạn chỉ tạo được buổi sinh hoạt cho ban đang hoạt động mà mình là Trưởng ban hoặc Phó ban.',
        'FORBIDDEN',
      )
    }
    const { title, description, location, errors } = validate(body)
    if (errors.length > 0) return problem(400, 'Thông tin buổi sinh hoạt chưa hợp lệ.', 'VALIDATION', errors)
    const session: DbSession = {
      id: newId('s'),
      clubId,
      departmentId,
      title,
      description,
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      location,
      capacity: body.capacity ?? null,
      registrationDeadline: body.registrationDeadline ?? null,
      createdBy: user.value.id,
      createdAt: nowIso(),
      version: 1,
    }
    db.sessions.push(session)
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
]
