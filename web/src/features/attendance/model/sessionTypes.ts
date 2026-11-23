import type { PersonRef } from '@/api/commonTypes'
import type { RecurrenceFrequency } from '@/shared/lib/sessionRecurrence'

/** Buổi toàn CLB do ban chủ nhiệm tạo; buổi của ban do ban chủ nhiệm hoặc Trưởng ban, Phó ban của ban đó tạo (FR-ATT-01). */
export type SessionScopeType = 'CLUB' | 'DEPARTMENT'

export interface SessionScope {
  type: SessionScopeType
  departmentId: string | null
  departmentName: string | null
}

/** Phạm vi người gọi được tạo buổi. */
export interface SessionScopeOption {
  type: SessionScopeType
  departmentId: string | null
  name: string
}

export type SessionWhen = 'UPCOMING' | 'PAST'

/**
 * `VIEW_ATTENDANCE`, `VIEW_REGISTRATIONS`, `EDIT`, `CANCEL` có khi người gọi là người phụ trách buổi: người tạo, ban chủ nhiệm,
 * Trưởng ban, Phó ban của ban đó; sửa, hủy chỉ trước giờ bắt đầu. `REGISTER` có khi người gọi thuộc đối tượng, buổi có số chỗ,
 * còn hạn đăng ký và người gọi chưa có đăng ký còn hiệu lực (FR-ATT-03).
 */
export type SessionAction = 'VIEW_ATTENDANCE' | 'VIEW_REGISTRATIONS' | 'VIEW_ABSENCE_REQUESTS' | 'EDIT' | 'CANCEL' | 'REGISTER' | 'REQUEST_ABSENCE'

/** Chờ duyệt, Đã duyệt, Bị từ chối, Đã rút (FR-ATT-04). */
export type AbsenceRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'

export interface AbsenceDecision {
  by: PersonRef
  at: string
  /** Bắt buộc khi từ chối. */
  note: string | null
}

export interface MyAbsenceRequest {
  id: string
  status: AbsenceRequestStatus
  reason: string
  createdAt: string
  decision: AbsenceDecision | null
  /** Rút được khi đơn còn Chờ duyệt hoặc Đã duyệt và buổi chưa bắt đầu. */
  allowedActions: Array<'WITHDRAW'>
  version: number
}

export interface AbsenceRequestRow {
  id: string
  requester: PersonRef
  status: AbsenceRequestStatus
  reason: string
  createdAt: string
  decision: AbsenceDecision | null
  /** Duyệt, từ chối khi đơn Chờ duyệt và chưa chốt điểm danh. */
  allowedActions: Array<'DECIDE'>
  version: number
}

export interface CreateAbsenceRequest {
  reason: string
}

export interface AbsenceDecisionRequest {
  decision: 'APPROVE' | 'REJECT'
  note: string | null
  version: number
}

/** Nhận chỗ, Danh sách chờ, Đã hủy (FR-ATT-03). */
export type SessionRegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'

export interface MySessionRegistration {
  id: string
  status: SessionRegistrationStatus
  waitlistPosition: number | null
  registeredAt: string
  promotedAt: string | null
  /** Người giữ chỗ hủy được tới trước giờ bắt đầu số giờ CLB cấu hình; người ở danh sách chờ tới giờ bắt đầu. */
  cancelDeadline: string
  allowedActions: Array<'CANCEL'>
}

/** Tình hình chỗ của buổi có giới hạn chỗ. */
export interface SessionSeats {
  capacity: number
  taken: number
  waitlist: number
}

export interface SessionRegistrationRow {
  id: string
  attendee: PersonRef
  status: Exclude<SessionRegistrationStatus, 'CANCELLED'>
  waitlistPosition: number | null
  registeredAt: string
  promotedAt: string | null
}

/** Vị trí của buổi trong chuỗi lặp (FR-ATT-02). */
export interface SessionSeriesInfo {
  id: string
  index: number
  count: number
}

export interface SessionSummary {
  id: string
  clubId: string
  title: string
  scope: SessionScope
  startAt: string
  endAt: string
  location: string
  /** Không giới hạn chỗ khi giá trị là `null`. */
  capacity: number | null
  registrationDeadline: string | null
  /** Đã chốt điểm danh (FR-ATT-08): danh sách chỉ xem được. */
  attendanceClosed: boolean
  series: SessionSeriesInfo | null
  cancelled: boolean
}

export interface SessionCancellation {
  by: PersonRef
  at: string
  reason: string
}

export interface SessionDetail extends SessionSummary {
  description: string
  creator: PersonRef
  createdAt: string
  allowedActions: SessionAction[]
  cancellation: SessionCancellation | null
  /** `null` với buổi không giới hạn chỗ. */
  seats: SessionSeats | null
  /** Đăng ký còn hiệu lực của người gọi. */
  myRegistration: MySessionRegistration | null
  /** Đơn xin phép vắng gần nhất của người gọi, trừ đơn đã rút (FR-ATT-04). */
  myAbsenceRequest: MyAbsenceRequest | null
  /** Số đơn chờ duyệt; chỉ người phụ trách buổi thấy, người khác nhận `null`. */
  pendingAbsenceCount: number | null
  version: number
}

export interface CreateSessionRequest {
  scopeType: SessionScopeType
  departmentId: string | null
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  capacity: number | null
  registrationDeadline: string | null
}

export interface CreateSessionSeriesRequest extends CreateSessionRequest {
  /** `until` là ngày yyyy-mm-dd của buổi cuối có thể có. */
  recurrence: { frequency: RecurrenceFrequency; until: string }
}

export interface CreateSessionSeriesResult {
  seriesId: string
  sessions: SessionSummary[]
}

/** Sửa một buổi; phạm vi không đổi được vì đổi phạm vi là đổi đối tượng của buổi. */
export type UpdateSessionRequest = Omit<CreateSessionRequest, 'scopeType' | 'departmentId'> & { version: number }

export interface CancelSessionRequest {
  reason: string
  version: number
}

export interface SessionQuery {
  when: SessionWhen
  /** Bỏ trống là mọi buổi; `CLUB` là buổi toàn CLB; `DEPARTMENT` cần `departmentId`. */
  scopeType?: SessionScopeType
  departmentId?: string
  q?: string
  page?: number
  size?: number
}
