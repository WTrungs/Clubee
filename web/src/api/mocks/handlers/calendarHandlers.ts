import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type { CalendarClub, CalendarItem, CalendarRelation } from '@/features/calendar/model/calendarTypes'
import { db, type DbSession } from '../db'
import { sessionAudience } from '../mockAttendance'
import { API, currentUser, networkDelay, problem } from '../mockHttp'
import { canAccessClub, isActiveMember } from '../mockMembers'
import { activeRegistrations, holdsSeat } from '../mockRegistrations'
import { mySessionRegistration } from '../mockSessionRegistrations'
import { isEventLead, isEventStaff } from '../mockStaffEvents'
import type { DbEvent } from '../seed/eventSeed'

/** FR-ATT-09: khoảng xem tối đa, đủ cho một lưới tháng (6 tuần) kèm dư. */
export const CALENDAR_MAX_DAYS = 62
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const isRealDay = (day: string | null): day is string =>
  day !== null && DAY_PATTERN.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day)

const clubName = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.name ?? 'CLB'
const overlaps = (startAt: string, endAt: string, from: number, to: number) => Date.parse(startAt) < to && Date.parse(endAt) > from

function sessionRelations(session: DbSession, userId: string): CalendarRelation[] {
  const relations: CalendarRelation[] = []
  const registration = mySessionRegistration(userId, session.id)
  if (registration) relations.push(registration.status === 'WAITLISTED' ? 'WAITLISTED' : 'REGISTERED')
  // Thuộc phạm vi (Thử việc, Chính thức; BR-MEM-05): buổi có số chỗ mà chưa đăng ký vẫn hiện để biết mà đăng ký.
  else if (sessionAudience(session).includes(userId)) relations.push('AUDIENCE')
  if (session.createdBy === userId) relations.push('CREATOR')
  return relations
}

const registrationOpen = (event: DbEvent) =>
  event.status === 'REGISTRATION_OPEN' && (!event.registrationDeadline || Date.parse(event.registrationDeadline) > Date.now())

/** Sự kiện đã đóng: BTC lúc tổ chức vẫn thấy lại trên lịch (Trưởng BTC theo lịch sử chức vụ, nhân sự chưa rời). */
const wasEventStaff = (userId: string, event: DbEvent) =>
  db.positions.some((position) => position.role === 'EVENT_LEAD' && position.scopeId === event.id && position.userId === userId) ||
  db.eventStaff.some((staff) => staff.eventId === event.id && staff.userId === userId && staff.leftAt === null)

const SHOWN_STATUSES = new Set<DbEvent['status']>(['APPROVED', 'REGISTRATION_OPEN', 'ONGOING', 'ENDED', 'CLOSED', 'CANCELLED'])

function eventRelations(event: DbEvent, userId: string): CalendarRelation[] {
  if (!SHOWN_STATUSES.has(event.status)) return []
  const relations: CalendarRelation[] = []
  const registration = activeRegistrations(event.id).find((candidate) => candidate.userId === userId)
  if (registration) relations.push(holdsSeat(registration) ? 'REGISTERED' : 'WAITLISTED')
  if (isEventLead(userId, event) || isEventStaff(userId, event) || (event.status === 'CLOSED' && wasEventStaff(userId, event))) relations.push('STAFF')
  // Cùng điều kiện với nút Đăng ký; người Tạm nghỉ không đăng ký được nên không gợi ý (BR-MEM-05).
  if (registrationOpen(event) && !registration && isActiveMember(userId, event.clubId)) relations.push('OPEN')
  return relations
}

export const calendarHandlers = [
  http.get(`${API}/me/calendar`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const userId = user.value.id
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const clubId = url.searchParams.get('clubId')
    const errors: FieldError[] = []
    if (!isRealDay(from)) errors.push({ field: 'from', message: 'Nhập ngày bắt đầu dạng yyyy-mm-dd.' })
    if (!isRealDay(to)) errors.push({ field: 'to', message: 'Nhập ngày kết thúc dạng yyyy-mm-dd.' })
    if (isRealDay(from) && isRealDay(to)) {
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1
      if (days < 1) errors.push({ field: 'to', message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' })
      else if (days > CALENDAR_MAX_DAYS) errors.push({ field: 'to', message: `Mỗi lần xem tối đa ${CALENDAR_MAX_DAYS} ngày.` })
    }
    if (errors.length > 0 || !isRealDay(from) || !isRealDay(to)) return problem(400, 'Khoảng ngày chưa hợp lệ.', 'VALIDATION', errors)
    const start = Date.parse(`${from}T00:00:00+07:00`)
    const end = Date.parse(`${to}T00:00:00+07:00`) + DAY_MS

    const sessions = db.sessions
      .filter((session) => overlaps(session.startAt, session.endAt, start, end) && canAccessClub(userId, session.clubId))
      .map((session): CalendarItem | null => {
        const relations = sessionRelations(session, userId)
        if (relations.length === 0) return null
        return {
          type: 'SESSION',
          id: session.id,
          clubId: session.clubId,
          clubName: clubName(session.clubId),
          title: session.title,
          startAt: session.startAt,
          endAt: session.endAt,
          location: session.location,
          relations,
          cancelled: session.cancelledAt !== null,
        }
      })
    const events = db.events
      .filter((event) => overlaps(event.startAt, event.endAt, start, end))
      .map((event): CalendarItem | null => {
        const relations = eventRelations(event, userId)
        if (relations.length === 0) return null
        return {
          type: 'EVENT',
          id: event.id,
          clubId: event.clubId,
          clubName: clubName(event.clubId),
          title: event.name,
          startAt: event.startAt,
          endAt: event.endAt,
          location: event.format === 'ONLINE' ? 'Trực tuyến' : (event.location ?? 'Chưa có địa điểm'),
          relations,
          cancelled: event.status === 'CANCELLED',
        }
      })
    const all = [...sessions, ...events].filter((item): item is CalendarItem => item !== null)
    const clubs = new Map<string, CalendarClub>()
    for (const membership of db.memberships.filter((candidate) => candidate.userId === userId && canAccessClub(userId, candidate.clubId))) {
      clubs.set(membership.clubId, { id: membership.clubId, name: clubName(membership.clubId) })
    }
    for (const item of all) clubs.set(item.clubId, { id: item.clubId, name: item.clubName })
    const items = all
      .filter((item) => !clubId || item.clubId === clubId)
      .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.title.localeCompare(b.title, 'vi'))
    return HttpResponse.json({ from, to, items, clubs: [...clubs.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'vi')) })
  }),
]
