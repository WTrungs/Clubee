import type { Page } from '@/api/pagination'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import type { AttendanceMethod, AttendanceStatus } from '@/features/attendance/model/attendanceTypes'
import type { DuesItemStatus } from '@/features/finance/model/duesTypes'
import type { ReportPeriodQuery, ReportRange } from './reportPeriodTypes'

/** Đếm điểm danh; `rate` = (Có mặt + Đi muộn) / (số bản ghi − Vắng có phép), `null` khi mẫu số bằng 0 (FR-RPT-02). */
export interface AttendanceTally {
  present: number
  late: number
  excused: number
  absent: number
  total: number
  rate: number | null
}

/** Một CLB người dùng đang hoặc đã tham gia (FR-ATT-10); người đã rời vẫn xem được lịch sử của mình. */
export interface ClubHistoryEntry {
  clubId: string
  clubName: string
  status: MemberStatus
  departmentName: string | null
  joinedOn: string | null
  leftOn: string | null
}

export interface MyAttendanceRow {
  id: string
  activity: { type: 'SESSION' | 'EVENT'; id: string; title: string }
  /** Ngày diễn ra (yyyy-mm-dd, giờ Việt Nam); sự kiện nhiều ngày là ngày của bản ghi. */
  date: string
  status: AttendanceStatus
  method: AttendanceMethod
  /** Bản ghi đã được sửa sau khi chốt (FR-ATT-08). */
  edited: boolean
}

export interface MyAttendancePage extends Page<MyAttendanceRow> {
  range: ReportRange
  tally: AttendanceTally
}

/** Việc người dùng là người chính: xong trong kỳ (đúng hạn, trễ), còn mở và đang quá hạn tính tới hiện tại. */
export interface TaskTally {
  doneOnTime: number
  doneLate: number
  open: number
  overdue: number
}

export interface MyDuesRow {
  campaignId: string
  name: string
  dueOn: string
  amountDue: number
  paid: number
  status: DuesItemStatus
}

export interface MyReport {
  club: { id: string; name: string }
  range: ReportRange
  attendance: AttendanceTally
  tasks: TaskTally
  /** Đợt đóng quỹ có hạn nộp trong kỳ. */
  dues: MyDuesRow[]
}

export type MyReportQuery = ReportPeriodQuery & { clubId: string }
export type MyAttendanceQuery = MyReportQuery & { page?: number; size?: number }
