import type {
  AttendanceAction,
  AttendanceActivityType,
  AttendanceCode,
  AttendanceCounts,
  AttendanceFilter,
  AttendanceMethod,
  AttendanceRow,
  AttendanceSheet,
  AttendanceStatus,
} from '@/features/attendance/model/attendanceTypes'
import type { SessionScopeOption } from '@/features/attendance/model/sessionTypes'
import { toVnDateKey } from '@/shared/format/formatDate'
import { matchesKeyword } from '@/shared/lib/searchText'
import { db, type DbAttendance, type DbAttendanceSheet, type DbSession } from './db'
import { newId, paginate } from './mockHttp'
import { departmentNameOf, eligibleMembers, isActiveMember, personRef, WORKING_STATUSES } from './mockMembers'
import { can } from './mockAccess'
import { EVENT_STAFF_ACTIVE, isBoardMember } from './mockPermissions'
import { isEventLead, isEventStaff } from './mockStaffEvents'
import { holdsSeat } from './mockRegistrations'
import { nowIso, shiftDate, toVnIso } from './mockTime'
import { DEFAULT_ATTENDANCE_LEAD_MINUTES, DEFAULT_QR_ROTATE_SECONDS } from './seed/attendanceSeed'
import type { DbEvent } from './seed/eventSeed'

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT']
export const ATTENDANCE_FILTERS: string[] = [...ATTENDANCE_STATUSES, 'UNMARKED', 'EXTRA']
const MINUTE_MS = 60 * 1000
const MAX_EVENT_DAYS = 31

/** FR-ATT-01: theo mặc định ban chủ nhiệm tạo buổi toàn CLB và buổi của mọi ban; Trưởng ban, Phó ban chỉ tạo buổi của ban mình. */
export function sessionScopesFor(userId: string, clubId: string): SessionScopeOption[] {
  if (!isActiveMember(userId, clubId)) return []
  const departments = db.departments
    .filter((department) => department.clubId === clubId && department.status === 'ACTIVE')
    .filter((department) => can(userId, clubId, 'MANAGE_SESSIONS', { type: 'DEPARTMENT', id: department.id }))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((department): SessionScopeOption => ({ type: 'DEPARTMENT', departmentId: department.id, name: `Ban ${department.name}` }))
  return can(userId, clubId, 'MANAGE_SESSIONS') ? [{ type: 'CLUB', departmentId: null, name: 'Toàn CLB' }, ...departments] : departments
}

/** Người phụ trách buổi: người tạo, ban chủ nhiệm (phạm vi cha, SRS 3.1), Trưởng ban, Phó ban của ban đó; phải còn Thử việc hoặc Chính thức. */
export function managesSession(userId: string, session: DbSession): boolean {
  if (!isActiveMember(userId, session.clubId)) return false
  if (session.createdBy === userId) return true
  return can(userId, session.clubId, 'MANAGE_SESSIONS', session.departmentId === null ? { type: 'CLUB' } : { type: 'DEPARTMENT', id: session.departmentId })
}

/** Đối tượng của buổi: thành viên Thử việc, Chính thức của CLB hoặc của ban; người Tạm nghỉ không tính (BR-MEM-05). */
export function sessionAudience(session: DbSession): string[] {
  return eligibleMembers(session.clubId, { departmentId: session.departmentId ?? undefined }).map((member) => member.id)
}

/** Buổi sinh hoạt hoặc sự kiện, gói lại để các route điểm danh dùng chung một cách kiểm tra. */
export interface AttendanceActivity {
  type: AttendanceActivityType
  id: string
  clubId: string
  name: string
  /** Các ngày của sự kiện; buổi sinh hoạt để rỗng. */
  days: string[]
  readOnlyReason: string | null
  canView: (userId: string) => boolean
  canMark: (userId: string) => boolean
  canClose: (userId: string) => boolean
  opensAt: (day: string | null) => string
  /** Giờ bắt đầu của buổi hoặc của ngày; quét sau giờ này ghi Đi muộn (FR-ATT-06). */
  startsAt: (day: string | null) => string
  expected: (day: string | null) => string[]
  forbidden: { view: string; mark: string; qr: string; close: string }
}

const leadMinutesOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.attendanceLeadMinutes ?? DEFAULT_ATTENDANCE_LEAD_MINUTES
const minutesBefore = (iso: string, minutes: number) => toVnIso(Date.parse(iso) - minutes * MINUTE_MS)

export function sessionActivity(session: DbSession): AttendanceActivity {
  const manages = (userId: string) => managesSession(userId, session)
  const sessionDay = toVnDateKey(session.startAt)
  return {
    type: 'SESSION',
    id: session.id,
    clubId: session.clubId,
    name: session.title,
    days: [],
    readOnlyReason: null,
    canView: manages,
    canMark: manages,
    canClose: manages,
    opensAt: () => minutesBefore(session.startAt, leadMinutesOf(session.clubId)),
    startsAt: () => session.startAt,
    // Chỉ tính người đã gia nhập trước hoặc trong ngày diễn ra buổi.
    expected: () =>
      db.memberships
        .filter((membership) => membership.clubId === session.clubId && WORKING_STATUSES.includes(membership.status))
        .filter((membership) => session.departmentId === null || membership.departmentId === session.departmentId)
        .filter((membership) => membership.joinedOn === null || membership.joinedOn <= sessionDay)
        .map((membership) => membership.userId),
    forbidden: {
      view: 'Chỉ người phụ trách buổi và ban chủ nhiệm xem được điểm danh.',
      mark: 'Chỉ người phụ trách buổi và ban chủ nhiệm được điểm danh.',
      qr: 'Chỉ người phụ trách buổi và ban chủ nhiệm được mở mã QR điểm danh.',
      close: 'Chỉ người phụ trách buổi và ban chủ nhiệm được chốt điểm danh.',
    },
  }
}

/** Các ngày theo giờ Việt Nam từ lúc bắt đầu đến lúc kết thúc; kết thúc đúng 00:00 thì không tính ngày đó. */
export function activityDays(startAt: string, endAt: string): string[] {
  const days = [toVnDateKey(startAt)]
  const last = toVnDateKey(new Date(Math.max(Date.parse(endAt) - 1, Date.parse(startAt))))
  while ((days.at(-1) ?? last) < last && days.length < MAX_EVENT_DAYS) days.push(shiftDate(days.at(-1) ?? last, 1))
  return days
}

/** Sự kiện chưa duyệt hoặc đã hủy thì không có điểm danh; Đã đóng thì ban chủ nhiệm còn xem được. */
export const eventAttendanceAvailable = (event: DbEvent) => EVENT_STAFF_ACTIVE.includes(event.status) || event.status === 'CLOSED'

export function eventActivity(event: DbEvent): AttendanceActivity {
  const days = activityDays(event.startAt, event.endAt)
  const board = (userId: string) => isBoardMember(userId, event.clubId)
  // Mọi nhân sự BTC đang hoạt động điểm danh được; chỉ Trưởng BTC và ban chủ nhiệm chốt.
  const staff = (userId: string) => board(userId) || isEventLead(userId, event) || isEventStaff(userId, event)
  return {
    type: 'EVENT',
    id: event.id,
    clubId: event.clubId,
    name: event.name,
    days,
    readOnlyReason: event.status === 'CLOSED' ? 'Sự kiện đã đóng nên điểm danh chỉ xem được.' : null,
    canView: staff,
    canMark: staff,
    canClose: (userId) => board(userId) || isEventLead(userId, event),
    opensAt: (day) => (day === null || day === days[0] ? minutesBefore(event.startAt, leadMinutesOf(event.clubId)) : `${day}T00:00:00+07:00`),
    // Các ngày sau của sự kiện nhiều ngày bắt đầu cùng giờ với ngày đầu.
    startsAt: (day) => (day === null || day === days[0] ? event.startAt : `${day}T${toVnIso(Date.parse(event.startAt)).slice(11)}`),
    // Người Chờ xác nhận lại vẫn giữ chỗ tới hạn, và hạn có thể trùng giờ bắt đầu, sau lúc mở điểm danh.
    expected: () => db.registrations.filter((registration) => registration.eventId === event.id && holdsSeat(registration)).map((registration) => registration.userId),
    forbidden: {
      view: 'Chỉ ban chủ nhiệm và nhân sự BTC đang hoạt động xem được điểm danh sự kiện.',
      mark: 'Chỉ ban chủ nhiệm và nhân sự BTC đang hoạt động được điểm danh sự kiện.',
      qr: 'Chỉ ban chủ nhiệm và nhân sự BTC đang hoạt động được mở mã QR điểm danh sự kiện.',
      close: 'Chỉ Trưởng BTC và ban chủ nhiệm được chốt điểm danh sự kiện.',
    },
  }
}

/** Ngày mặc định khi xem sự kiện: hôm nay nếu nằm trong sự kiện, chưa tới thì ngày đầu, đã qua thì ngày cuối. */
export function defaultDay(activity: AttendanceActivity, now = Date.now()): string | null {
  if (activity.days.length === 0) return null
  const today = toVnDateKey(new Date(now))
  if (activity.days.includes(today)) return today
  return today < (activity.days[0] ?? today) ? (activity.days[0] ?? null) : (activity.days.at(-1) ?? null)
}

const matches = (activity: AttendanceActivity, day: string | null) => (item: { activityType: AttendanceActivityType; activityId: string; day: string | null }) =>
  item.activityType === activity.type && item.activityId === activity.id && item.day === day

export function sheetStateOf(activity: AttendanceActivity, day: string | null): DbAttendanceSheet {
  return db.attendanceSheets.find(matches(activity, day)) ?? { activityType: activity.type, activityId: activity.id, day, closedAt: null, closedBy: null, version: 0 }
}

function ensureSheet(activity: AttendanceActivity, day: string | null): DbAttendanceSheet {
  const existing = db.attendanceSheets.find(matches(activity, day))
  if (existing) return existing
  const created = sheetStateOf(activity, day)
  db.attendanceSheets.push(created)
  return created
}

export const recordsOf = (activity: AttendanceActivity, day: string | null) => db.attendance.filter(matches(activity, day))

export const isAttendanceOpen = (activity: AttendanceActivity, day: string | null, now = Date.now()) => now >= Date.parse(activity.opensAt(day))

interface SheetEntry {
  userId: string
  extra: boolean
  record: DbAttendance | undefined
}

/** Trước khi chốt, đối tượng tính lại theo dữ liệu hiện tại; sau khi chốt, ai cũng đã có bản ghi nên chỉ lấy bản ghi. */
export function sheetEntries(activity: AttendanceActivity, day: string | null): SheetEntry[] {
  const records = recordsOf(activity, day)
  const expected = sheetStateOf(activity, day).closedAt ? [] : activity.expected(day)
  const userIds = new Set([...expected, ...records.map((record) => record.userId)])
  return [...userIds].map((userId) => {
    const record = records.find((candidate) => candidate.userId === userId)
    return { userId, extra: record?.extra ?? false, record }
  })
}

function countsOf(entries: SheetEntry[]): AttendanceCounts {
  const withStatus = (status: AttendanceStatus) => entries.filter((entry) => entry.record?.status === status).length
  return {
    expected: entries.filter((entry) => !entry.extra).length,
    present: withStatus('PRESENT'),
    late: withStatus('LATE'),
    excused: withStatus('EXCUSED'),
    absent: withStatus('ABSENT'),
    unmarked: entries.filter((entry) => !entry.extra && !entry.record).length,
    extra: entries.filter((entry) => entry.extra).length,
  }
}

export function toAttendanceRow(activity: AttendanceActivity, entry: SheetEntry): AttendanceRow {
  return {
    person: personRef(entry.userId),
    departmentName: departmentNameOf(entry.userId, activity.clubId),
    extra: entry.extra,
    record: entry.record
      ? {
          status: entry.record.status,
          method: entry.record.method,
          recordedAt: entry.record.recordedAt,
          recordedBy: personRef(entry.record.recordedBy),
          version: entry.record.version,
        }
      : null,
  }
}

/** Mở mã QR cùng điều kiện với điểm danh tay: có quyền, khung đã mở, chưa chốt (BR-ATT-02). */
export function attendanceActionsFor(activity: AttendanceActivity, userId: string, day: string | null): AttendanceAction[] {
  if (activity.readOnlyReason || sheetStateOf(activity, day).closedAt || !isAttendanceOpen(activity, day)) return []
  return [...(activity.canMark(userId) ? (['MARK', 'SHOW_QR'] as const) : []), ...(activity.canClose(userId) ? (['CLOSE'] as const) : [])]
}

const rotateSecondsOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.attendanceQrRotateSeconds ?? DEFAULT_QR_ROTATE_SECONDS

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** FR-ATT-05: mỗi chu kỳ một mã ngẫu nhiên; gọi lại trong cùng chu kỳ trả đúng mã đó. */
export function currentCode(activity: AttendanceActivity, day: string | null, now = Date.now()): AttendanceCode {
  const refreshSeconds = rotateSecondsOf(activity.clubId)
  const cycleMs = refreshSeconds * 1000
  const cycle = Math.floor(now / cycleMs)
  const sameSheet = matches(activity, day)
  // Giữ mã của chu kỳ liền trước cho lúc làm endpoint quét (nhận mã vừa đổi khi mạng chậm); cũ hơn thì bỏ.
  db.attendanceCodes = db.attendanceCodes.filter((item) => !sameSheet(item) || item.cycle >= cycle - 1)
  let stored = db.attendanceCodes.find((item) => sameSheet(item) && item.cycle === cycle)
  if (!stored) {
    stored = { activityType: activity.type, activityId: activity.id, day, cycle, code: randomCode() }
    db.attendanceCodes.push(stored)
  }
  const params = new URLSearchParams({ type: activity.type, club: activity.clubId, id: activity.id, code: stored.code })
  if (day) params.set('day', day)
  return { day, payload: `clubee://attendance?${params.toString()}`, expiresAt: toVnIso((cycle + 1) * cycleMs), refreshSeconds }
}

/** FR-ATT-06: mã quét được nhận khi là mã của chu kỳ hiện tại hoặc chu kỳ liền trước (mạng chậm lúc mã vừa đổi). */
export function isCurrentCode(activity: AttendanceActivity, day: string | null, code: string, now = Date.now()): boolean {
  const cycle = Math.floor(now / (rotateSecondsOf(activity.clubId) * 1000))
  const sameSheet = matches(activity, day)
  return code !== '' && db.attendanceCodes.some((item) => sameSheet(item) && item.code === code && item.cycle >= cycle - 1 && item.cycle <= cycle)
}

function matchesFilter(entry: SheetEntry, filter: string | null): boolean {
  if (!filter) return true
  if (filter === 'UNMARKED') return !entry.extra && !entry.record
  if (filter === 'EXTRA') return entry.extra
  return entry.record?.status === (filter as AttendanceFilter)
}

export function buildSheet(activity: AttendanceActivity, userId: string, day: string | null, url: URL): AttendanceSheet {
  const state = sheetStateOf(activity, day)
  const entries = sheetEntries(activity, day)
  const keyword = url.searchParams.get('q')
  const filter = url.searchParams.get('status')
  const visible = entries
    .map((entry) => ({ entry, fullName: personRef(entry.userId).fullName }))
    .filter(({ entry, fullName }) => matchesFilter(entry, filter) && matchesKeyword(fullName, keyword))
    .toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi') || a.entry.userId.localeCompare(b.entry.userId))
  const page = paginate(visible, url, 50)
  return {
    activity: { type: activity.type, id: activity.id, name: activity.name },
    day,
    days: activity.days,
    opensAt: activity.opensAt(day),
    closedAt: state.closedAt,
    closedBy: state.closedBy ? personRef(state.closedBy) : null,
    readOnlyReason: activity.readOnlyReason,
    counts: countsOf(entries),
    allowedActions: attendanceActionsFor(activity, userId, day),
    version: state.version,
    rows: { ...page, content: page.content.map(({ entry }) => toAttendanceRow(activity, entry)) },
  }
}

/** Ghi mới hoặc đổi trạng thái; mỗi người một bản ghi cho mỗi buổi hoặc mỗi ngày (BR-ATT-01). */
export function writeAttendance(
  activity: AttendanceActivity,
  day: string | null,
  userId: string,
  status: AttendanceStatus,
  actorId: string,
  method: AttendanceMethod,
): AttendanceRow {
  const sheet = ensureSheet(activity, day)
  const existing = recordsOf(activity, day).find((record) => record.userId === userId)
  const at = nowIso()
  if (existing) {
    Object.assign(existing, { status, method, recordedBy: actorId, recordedAt: at, version: existing.version + 1 })
  } else {
    db.attendance.push({
      id: newId('a'),
      activityType: activity.type,
      activityId: activity.id,
      day,
      userId,
      status,
      method,
      extra: !activity.expected(day).includes(userId),
      recordedBy: actorId,
      recordedAt: at,
      version: 1,
    })
  }
  sheet.version += 1
  const entry = sheetEntries(activity, day).find((candidate) => candidate.userId === userId)
  return toAttendanceRow(activity, entry ?? { userId, extra: false, record: undefined })
}

/** FR-ATT-08 (phần chốt): người thuộc đối tượng mà chưa có bản ghi thành Vắng không phép; trả số người vừa được ghi. */
export function closeAttendance(activity: AttendanceActivity, day: string | null, actorId: string): number {
  const sheet = ensureSheet(activity, day)
  const unmarked = sheetEntries(activity, day).filter((entry) => !entry.extra && !entry.record)
  const at = nowIso()
  for (const entry of unmarked) {
    db.attendance.push({
      id: newId('a'),
      activityType: activity.type,
      activityId: activity.id,
      day,
      userId: entry.userId,
      status: 'ABSENT',
      method: 'MANUAL',
      extra: false,
      recordedBy: actorId,
      recordedAt: at,
      version: 1,
    })
  }
  Object.assign(sheet, { closedAt: at, closedBy: actorId, version: sheet.version + 1 })
  return unmarked.length
}
