import type { PersonRef } from '@/api/commonTypes'

/** ST-EVT (SRS 4.2). */
export type EventStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REGISTRATION_OPEN'
  | 'ONGOING'
  | 'ENDED'
  | 'SETTLED'
  | 'CLOSED'
  | 'CANCELLED'

export type EventTransitionAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'OPEN_REGISTRATION' | 'CANCEL' | 'CLOSE'

/** Quyền không phải chuyển trạng thái, cũng do máy chủ tính (SRS 3.5: dữ liệu BTC, danh sách tham dự chỉ BTC và ban chủ nhiệm xem). */
export type EventCapability = 'MANAGE_SUBCOMMITTEES' | 'REGISTER' | 'RESCHEDULE' | 'VIEW_STAFF' | 'VIEW_REGISTRATIONS' | 'VIEW_FUND' | 'VIEW_ATTENDANCE'

export type EventAction = EventTransitionAction | EventCapability

export type EventFormat = 'OFFLINE' | 'ONLINE'

/** ST-REG: Nhận chỗ, Danh sách chờ, Chờ xác nhận lại, Đã hủy. */
export type RegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'RECONFIRM_PENDING' | 'CANCELLED'

/** Thao tác người đăng ký tự làm với đăng ký của mình (FR-EVT-13, 14). */
export type RegistrationAction = 'CANCEL' | 'RECONFIRM'

export interface MyRegistration {
  id: string
  status: RegistrationStatus
  waitlistPosition: number | null
  registeredAt: string
  /** Lúc được đôn từ danh sách chờ; null khi nhận chỗ ngay. */
  promotedAt: string | null
  /** Hạn tự hủy: người giữ chỗ theo số giờ CLB cấu hình trước giờ bắt đầu, người ở danh sách chờ tới giờ bắt đầu. */
  cancelDeadline: string
  /** Hạn xác nhận tham dự sau khi sự kiện dời giờ; chỉ có khi đang Chờ xác nhận lại (FR-EVT-14). */
  reconfirmDeadline: string | null
  allowedActions: RegistrationAction[]
}

export interface EventSummary {
  id: string
  clubId: string
  name: string
  startAt: string
  endAt: string
  format: EventFormat
  location: string | null
  /** Không giới hạn chỗ khi để trống (BR-EVT-01). */
  capacity: number | null
  confirmedCount: number
  waitlistCount: number
  registrationDeadline: string | null
  openToGuests: boolean
  status: EventStatus
  lead: PersonRef | null
  myRegistration: MyRegistration | null
}

export interface EventDetail extends EventSummary {
  description: string
  onlineUrl: string | null
  proposer: PersonRef
  approver: PersonRef | null
  rejectionReason: string | null
  cancellationReason: string | null
  /** Trạng thái cuối cùng đạt được trước khi hủy, để hiện tiến trình. */
  statusBeforeCancel: EventStatus | null
  allowedActions: EventAction[]
  version: number
  createdAt: string
  /** Quỹ sự kiện, có từ khi sự kiện sang Đã duyệt. */
  fundId: string | null
  /** Lần dời thời gian gần nhất (FR-EVT-14); null khi chưa dời lần nào. */
  lastScheduleChange: ScheduleChange | null
}

export interface ScheduleChange {
  at: string
  actor: PersonRef
  fromStartAt: string
  fromEndAt: string
  toStartAt: string
  toEndAt: string
  reason: string
}

export type StaffKind = 'MEMBER' | 'COLLABORATOR' | 'CO_HOST'

export interface StaffMember extends PersonRef {
  departmentName: string | null
  kind: StaffKind
}

export interface Subcommittee {
  id: string
  name: string
  description: string
  /** Chỉ tiêu nhân sự; null là không đặt chỉ tiêu. */
  quota: number | null
  lead: StaffMember | null
  members: StaffMember[]
  allowedActions: Array<'INVITE_MEMBER'>
}

/** FR-EVT-05: khi mời chỉ thấy tên và ban. */
export interface StaffCandidate extends PersonRef {
  departmentName: string | null
}

export interface Registration {
  id: string
  attendee: PersonRef
  status: RegistrationStatus
  waitlistPosition: number | null
  registeredAt: string
  promotedAt: string | null
}

export interface CreateEventRequest {
  name: string
  description: string
  startAt: string
  endAt: string
  format: EventFormat
  location: string | null
  onlineUrl: string | null
  capacity: number | null
  registrationDeadline: string | null
  openToGuests: boolean
  /** Ban chủ nhiệm tạo sự kiện thì chỉ định Trưởng BTC (FR-EVT-01); đề xuất thì để trống. */
  leadUserId: string | null
}

export interface EventTransitionRequest {
  action: EventTransitionAction
  version: number
  reason?: string
  /** Khi duyệt đề xuất: Trưởng BTC, mặc định là người đề xuất (FR-EVT-03). */
  leadUserId?: string
}

/** FR-EVT-14: bỏ trống hạn đăng ký thì giữ hạn hiện tại, gửi null để bỏ hạn. */
export interface RescheduleEventRequest {
  startAt: string
  endAt: string
  registrationDeadline?: string | null
  reason: string
  version: number
}

export interface CreateSubcommitteeRequest {
  name: string
  description: string
  quota: number | null
  leadUserId: string | null
}

export interface EventQuery {
  status?: EventStatus[]
  q?: string
  page?: number
  size?: number
}
