import type { PersonRef } from '@/api/commonTypes'
import type { Page } from '@/api/pagination'

/** Có mặt, Đi muộn, Vắng có phép, Vắng không phép (SRS 5.7). */
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT'
export type AttendanceMethod = 'MANUAL' | 'QR'
export type AttendanceActivityType = 'SESSION' | 'EVENT'
/** Điểm danh tay, mở mã QR và chốt; máy chủ chỉ trả khi khung điểm danh đang mở và người gọi có quyền. */
export type AttendanceAction = 'MARK' | 'SHOW_QR' | 'CLOSE'
/** Lọc theo trạng thái, cộng hai nhóm: chưa có bản ghi và người phát sinh. */
export type AttendanceFilter = AttendanceStatus | 'UNMARKED' | 'EXTRA'

/** Buổi sinh hoạt hoặc sự kiện được điểm danh. */
export interface AttendanceActivityRef {
  type: AttendanceActivityType
  clubId: string
  id: string
}

export interface AttendanceRecord {
  status: AttendanceStatus
  method: AttendanceMethod
  recordedAt: string
  recordedBy: PersonRef
  version: number
}

export interface AttendanceRow {
  person: PersonRef
  departmentName: string | null
  /** Người phát sinh: không thuộc đối tượng của buổi mà vẫn đến (FR-ATT-07). */
  extra: boolean
  record: AttendanceRecord | null
  /** Đơn xin phép vắng đang chờ hoặc đã duyệt của người này (FR-ATT-04); sự kiện luôn `null`. */
  absenceRequest: AttendanceAbsenceNote | null
}

export interface AttendanceAbsenceNote {
  status: 'PENDING' | 'APPROVED'
  reason: string
}

export interface AttendanceCounts {
  /** Số người thuộc đối tượng, không tính người phát sinh. */
  expected: number
  present: number
  late: number
  excused: number
  absent: number
  /** Người thuộc đối tượng mà chưa có bản ghi. */
  unmarked: number
  /** Trong số chưa có bản ghi, người có đơn xin phép đã duyệt: lúc chốt được ghi Vắng có phép (FR-ATT-04). */
  unmarkedExcused: number
  extra: number
}

export interface AttendanceSheet {
  activity: { type: AttendanceActivityType; id: string; name: string }
  /** Ngày đang xem (yyyy-mm-dd) với sự kiện; buổi sinh hoạt để `null`. */
  day: string | null
  /** Các ngày của sự kiện nhiều ngày; buổi sinh hoạt để rỗng. */
  days: string[]
  opensAt: string
  closedAt: string | null
  closedBy: PersonRef | null
  /** Câu máy chủ giải thích vì sao chỉ xem được, ví dụ sự kiện đã đóng. */
  readOnlyReason: string | null
  counts: AttendanceCounts
  allowedActions: AttendanceAction[]
  version: number
  rows: Page<AttendanceRow>
}

export interface AttendanceSheetQuery {
  day?: string
  q?: string
  status?: AttendanceFilter
  page?: number
  size?: number
}

export interface MarkAttendanceRequest {
  day: string | null
  status: AttendanceStatus
  /** Phiên bản bản ghi đang thấy; người chưa có bản ghi gửi 0. */
  version: number
}

export interface CloseAttendanceRequest {
  action: 'CLOSE'
  day: string | null
  version: number
}

/** Mã QR của chu kỳ hiện tại (FR-ATT-05); hết `expiresAt` thì máy chủ cấp mã mới. */
export interface AttendanceCode {
  day: string | null
  payload: string
  expiresAt: string
  refreshSeconds: number
}

/** FR-ATT-06: mã đọc được từ QR; `day` chỉ có với sự kiện. */
export interface AttendanceCheckInRequest {
  code: string
  day: string | null
}

/** Kết quả quét: Có mặt hoặc Đi muộn; quét lại thì trả bản ghi cũ kèm `alreadyRecorded` (BR-ATT-01). */
export interface AttendanceCheckIn {
  activity: { type: AttendanceActivityType; id: string; name: string }
  clubName: string
  day: string | null
  status: AttendanceStatus
  recordedAt: string
  alreadyRecorded: boolean
}

export interface AttendanceCandidate {
  id: string
  fullName: string
  departmentName: string | null
}
