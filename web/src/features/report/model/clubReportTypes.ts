import type { PersonRef } from '@/api/commonTypes'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import type { EventStatus } from '@/features/event/model/eventTypes'
import type { AttendanceTally, TaskTally } from './myReportTypes'
import type { ReportPeriodQuery, ReportRange } from './reportPeriodTypes'

/** Chuyên cần một buổi sinh hoạt trong kỳ; buổi chưa chốt chỉ đếm người đã được ghi. */
export interface ClubSessionAttendance {
  sessionId: string
  title: string
  date: string
  departmentName: string | null
  closed: boolean
  tally: AttendanceTally
}

/** FR-RPT-04: báo cáo CLB theo kỳ, chỉ ban chủ nhiệm xem. */
export interface ClubReport {
  club: { id: string; name: string }
  range: ReportRange
  /** Sĩ số hiện tại theo trạng thái; số vào, số rời tính trong kỳ. */
  members: { probation: number; active: number; onLeave: number; joined: number; left: number }
  attendance: { overall: AttendanceTally; sessions: ClubSessionAttendance[] }
  /** Sự kiện bắt đầu trong kỳ, bỏ Dự thảo. */
  events: { total: number; byStatus: Array<{ status: EventStatus; count: number }> }
  /** Thu chi trong kỳ như báo cáo thu chi; số dư là hiện tại. */
  finance: { income: number; expense: number; net: number; generalBalance: number; eventFundsBalance: number }
}

/** Ban xem được báo cáo: ban chủ nhiệm thấy mọi ban đang hoạt động, trưởng, phó ban chỉ thấy ban mình. */
export interface ReportDepartmentOption {
  id: string
  name: string
}

export interface DepartmentMemberRow {
  person: PersonRef
  status: MemberStatus
  /** Trưởng ban, Phó ban; null với thành viên thường. */
  positionTitle: string | null
  tasks: TaskTally
  attendance: AttendanceTally
}

/** FR-RPT-03, phần ban: từng thành viên hiện thuộc ban, số việc và chuyên cần trong kỳ. */
export interface DepartmentReport {
  department: ReportDepartmentOption
  range: ReportRange
  rows: DepartmentMemberRow[]
}

export type ClubReportQuery = ReportPeriodQuery
