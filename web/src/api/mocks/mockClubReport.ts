import type { EventStatus } from '@/features/event/model/eventTypes'
import type { ClubReport, DepartmentReport, ReportDepartmentOption } from '@/features/report/model/clubReportTypes'
import type { ReportRange } from '@/features/report/model/reportPeriodTypes'
import { toVnDateKey } from '@/shared/format/formatDate'
import { db, type DbClub, type DbDepartment } from './db'
import { attendanceRecordsOf, tallyAttendance } from './mockAttendanceStats'
import { fundBalance } from './mockFinance'
import { buildFinanceReport } from './mockFinanceReport'
import { ROSTER_STATUSES, personRef } from './mockMembers'
import { hasPosition, isBoardMember } from './mockPermissions'
import { taskTallyOf } from './mockTaskStats'

// FR-RPT-03 (phần ban), FR-RPT-04: báo cáo CLB chỉ ban chủ nhiệm; báo cáo ban thêm trưởng, phó của chính ban đó.

const EVENT_ORDER: EventStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'REGISTRATION_OPEN', 'ONGOING', 'ENDED', 'CLOSED', 'CANCELLED']
const inRange = (day: string | null, range: ReportRange) => day !== null && day >= range.from && day <= range.to

export const canViewClubReport = (userId: string, clubId: string) => isBoardMember(userId, clubId)

export const leadsDepartment = (userId: string, department: DbDepartment) =>
  hasPosition(userId, 'DEPARTMENT_HEAD', department.id) || hasPosition(userId, 'DEPARTMENT_VICE_HEAD', department.id)

/** Ban người dùng xem được báo cáo; ban đã đóng không còn thành viên nên không có trong danh sách. */
export function reportDepartmentsOf(userId: string, clubId: string): ReportDepartmentOption[] {
  const board = isBoardMember(userId, clubId)
  return db.departments
    .filter((department) => department.clubId === clubId && department.status === 'ACTIVE' && (board || leadsDepartment(userId, department)))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map((department) => ({ id: department.id, name: department.name }))
}

export function clubReport(club: DbClub, range: ReportRange): ClubReport {
  const memberships = db.memberships.filter((membership) => membership.clubId === club.id)
  const countStatus = (status: string) => memberships.filter((membership) => membership.status === status).length

  const sessions = db.sessions
    // Buổi chưa bắt đầu chưa có điểm danh nên chưa tính.
    .filter((session) => session.clubId === club.id && session.cancelledAt === null && Date.parse(session.startAt) <= Date.now() && inRange(toVnDateKey(session.startAt), range))
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))
  const recordsOf = (sessionId: string) => db.attendance.filter((record) => record.activityType === 'SESSION' && record.activityId === sessionId)
  const sessionRows = sessions.map((session) => ({
    sessionId: session.id,
    title: session.title,
    date: toVnDateKey(session.startAt),
    departmentName: db.departments.find((department) => department.id === session.departmentId)?.name ?? null,
    closed: db.attendanceSheets.some((sheet) => sheet.activityType === 'SESSION' && sheet.activityId === session.id && sheet.closedAt !== null),
    tally: tallyAttendance(recordsOf(session.id).map((record) => record.status)),
  }))

  const events = db.events.filter((event) => event.clubId === club.id && event.status !== 'DRAFT' && inRange(toVnDateKey(event.startAt), range))
  const finance = buildFinanceReport(club, range, { category: null, eventId: null })
  const funds = db.funds.filter((fund) => fund.clubId === club.id)
  return {
    club: { id: club.id, name: club.name },
    range,
    members: {
      probation: countStatus('PROBATION'),
      active: countStatus('ACTIVE'),
      onLeave: countStatus('ON_LEAVE'),
      joined: memberships.filter((membership) => inRange(membership.joinedOn, range)).length,
      // Yêu cầu gia nhập bị từ chối không tính là rời.
      left: memberships.filter((membership) => membership.exitKind !== 'REJECTED' && inRange(membership.leftOn, range)).length,
    },
    attendance: {
      overall: tallyAttendance(sessions.flatMap((session) => recordsOf(session.id).map((record) => record.status))),
      sessions: sessionRows,
    },
    events: {
      total: events.length,
      byStatus: EVENT_ORDER.map((status) => ({ status, count: events.filter((event) => event.status === status).length })).filter((row) => row.count > 0),
    },
    finance: {
      income: finance.totalIncome,
      expense: finance.totalExpense,
      net: finance.net,
      generalBalance: funds.filter((fund) => fund.kind === 'GENERAL').reduce((total, fund) => total + fundBalance(fund.id), 0),
      eventFundsBalance: funds.filter((fund) => fund.kind === 'EVENT').reduce((total, fund) => total + fundBalance(fund.id), 0),
    },
  }
}

/** Thành viên đang thuộc ban (Thử việc, Chính thức, Tạm nghỉ): trưởng, phó ban trước rồi theo tên. */
export function departmentReport(club: DbClub, department: DbDepartment, range: ReportRange): DepartmentReport {
  const tasks = db.tasks.filter((task) => task.clubId === club.id)
  const titleOf = (userId: string) =>
    hasPosition(userId, 'DEPARTMENT_HEAD', department.id) ? 'Trưởng ban' : hasPosition(userId, 'DEPARTMENT_VICE_HEAD', department.id) ? 'Phó ban' : null
  const rank = (title: string | null) => (title === 'Trưởng ban' ? 0 : title === 'Phó ban' ? 1 : 2)
  const rows = db.memberships
    .filter((membership) => membership.clubId === club.id && membership.departmentId === department.id && ROSTER_STATUSES.includes(membership.status))
    .map((membership) => ({
      person: personRef(membership.userId),
      status: membership.status,
      positionTitle: titleOf(membership.userId),
      tasks: taskTallyOf(tasks, membership.userId, range),
      attendance: tallyAttendance(attendanceRecordsOf(membership.userId, club.id, range.from, range.to).map(({ record }) => record.status)),
    }))
    .toSorted((a, b) => rank(a.positionTitle) - rank(b.positionTitle) || a.person.fullName.localeCompare(b.person.fullName, 'vi'))
  return { department: { id: department.id, name: department.name }, range, rows }
}
