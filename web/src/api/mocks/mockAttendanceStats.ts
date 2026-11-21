import type { AttendanceStatus } from '@/features/attendance/model/attendanceTypes'
import type { AttendanceTally } from '@/features/report/model/myReportTypes'
import { toVnDateKey } from '@/shared/format/formatDate'
import { db, type DbAttendance } from './db'

/** FR-RPT-02..04: đếm trạng thái; tỷ lệ chuyên cần = (Có mặt + Đi muộn) / (số bản ghi − Vắng có phép), không có mẫu số thì `null`. */
export function tallyAttendance(statuses: readonly AttendanceStatus[]): AttendanceTally {
  const count = (status: AttendanceStatus) => statuses.filter((candidate) => candidate === status).length
  const present = count('PRESENT')
  const late = count('LATE')
  const excused = count('EXCUSED')
  const absent = count('ABSENT')
  const base = statuses.length - excused
  return { present, late, excused, absent, total: statuses.length, rate: base > 0 ? (present + late) / base : null }
}

/** Ngày diễn ra của bản ghi: ngày của sự kiện, hoặc ngày bắt đầu buổi sinh hoạt (giờ Việt Nam). */
export function attendanceDateOf(record: DbAttendance): string | null {
  if (record.day) return record.day
  const session = db.sessions.find((candidate) => candidate.id === record.activityId)
  return session ? toVnDateKey(session.startAt) : null
}

/** Tên và CLB của buổi hoặc sự kiện mà bản ghi thuộc về. */
export function attendanceActivityOf(record: DbAttendance): { clubId: string; title: string } | null {
  if (record.activityType === 'SESSION') {
    const session = db.sessions.find((candidate) => candidate.id === record.activityId)
    return session ? { clubId: session.clubId, title: session.title } : null
  }
  const event = db.events.find((candidate) => candidate.id === record.activityId)
  return event ? { clubId: event.clubId, title: event.name } : null
}

/** Bản ghi của một người ở một CLB, ngày diễn ra trong khoảng (tính cả hai đầu), mới nhất trước. */
export function attendanceRecordsOf(userId: string, clubId: string, from: string, to: string): Array<{ record: DbAttendance; date: string; title: string }> {
  return db.attendance
    .filter((record) => record.userId === userId)
    .map((record) => ({ record, date: attendanceDateOf(record), activity: attendanceActivityOf(record) }))
    .filter((row): row is { record: DbAttendance; date: string; activity: { clubId: string; title: string } } => row.date !== null && row.activity !== null)
    .filter((row) => row.activity.clubId === clubId && row.date >= from && row.date <= to)
    .map((row) => ({ record: row.record, date: row.date, title: row.activity.title }))
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'vi'))
}
