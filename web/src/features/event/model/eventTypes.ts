import type { PersonRef } from '@/api/commonTypes'
import type { AttendanceTally } from '@/features/report/model/myReportTypes'
import type { FundStatus } from '@/features/finance/model/financeTypes'

/** ST-EVT theo báo cáo 17/11: quyết toán là trạng thái của quỹ, không phải của sự kiện. */
export type EventStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REGISTRATION_OPEN'
  | 'ONGOING'
  | 'ENDED'
  | 'CLOSED'
  | 'CANCELLED'

export type EventTransitionAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'OPEN_REGISTRATION' | 'CANCEL' | 'CLOSE'

/** Quyền không phải chuyển trạng thái, cũng do máy chủ tính (SRS 3.5: dữ liệu BTC, danh sách tham dự chỉ BTC và ban chủ nhiệm xem). */
export type EventCapability =
  | 'MANAGE_SUBCOMMITTEES'
  | 'REGISTER'
  | 'RESCHEDULE'
  | 'VIEW_STAFF'
  /** FR-RPT-05: báo cáo sự kiện (gồm số việc theo tiểu ban của FR-EVT-09); ban chủ nhiệm CLB đồng tổ chức cũng xem được. */
  | 'VIEW_REPORT'
  | 'VIEW_REGISTRATIONS'
  | 'VIEW_FUND'
  | 'VIEW_ATTENDANCE'
  /** FR-EVT-06: Trưởng BTC duyệt, từ chối yêu cầu vào tiểu ban vượt chỉ tiêu (BR-EVT-07). */
  | 'DECIDE_STAFF_REQUESTS'

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
  /** FR-EVT-06: BTC mở cho thành viên tự đăng ký vào tiểu ban. */
  staffSignupOpen: boolean
  allowedActions: EventAction[]
  version: number
  createdAt: string
  /** Quỹ sự kiện, có từ khi sự kiện sang Đã duyệt. */
  fundId: string | null
  /** Trạng thái quỹ sự kiện; null khi chưa có quỹ hoặc người xem không được xem quỹ (SRS 3.5). */
  fundStatus: FundStatus | null
  /** Số tạm ứng còn mở ở quỹ sự kiện (BR-EVT-05); null như `fundStatus`. */
  openAdvanceCount: number | null
  /** Lần dời thời gian gần nhất (FR-EVT-14); null khi chưa dời lần nào. */
  lastScheduleChange: ScheduleChange | null
  /** CLB đồng tổ chức khi người xem chỉ là ban chủ nhiệm của CLB đó (FR-EVT-09, chỉ xem); null với người khác. */
  viewingAsCoHost: ClubRef | null
}

/** Số việc theo trạng thái, không tính việc Đã hủy; `overdue` đếm trùng với các trạng thái còn làm. */
export interface TaskProgressCounts {
  total: number
  assigned: number
  inProgress: number
  pendingReview: number
  done: number
  overdue: number
}

/** FR-EVT-09: tiến độ sự kiện là số việc của từng tiểu ban. */
export interface EventProgress {
  total: TaskProgressCounts
  subcommittees: Array<{ id: string; name: string; counts: TaskProgressCounts }>
}

export interface EventRegistrationStats {
  capacity: number | null
  confirmed: number
  waitlisted: number
  reconfirmPending: number
  cancelled: number
  /** Khách mời còn đăng ký (FR-EVT-12) và số khách đã được ghi có mặt ít nhất một ngày. */
  guests: number
  guestsCheckedIn: number
}

/** Điểm danh một ngày của sự kiện; `expected` là người giữ chỗ, sau khi chốt là người có bản ghi. */
export interface EventAttendanceDay {
  day: string
  closed: boolean
  expected: number
  tally: AttendanceTally
}

/** Một người trong BTC: việc mình làm chính trong các tiểu ban; `days` là số ngày đã mở điểm danh. */
export interface EventStaffStats {
  person: PersonRef
  subcommitteeName: string | null
  role: 'LEAD' | StaffKind
  open: number
  done: number
  overdue: number
  presentDays: number
  days: number
}

export interface EventFundStats {
  balance: number
  income: number
  expense: number
  /** Chỉ ban chủ nhiệm và Trưởng BTC; người khác nhận null. */
  pendingCount: number | null
  pendingAmount: number | null
  openAdvanceCount: number
}

/** FR-RPT-05: `staff` chỉ Trưởng BTC và ban chủ nhiệm CLB chủ trì; `fund` chỉ người xem được quỹ sự kiện. */
export interface EventReport {
  registrations: EventRegistrationStats
  attendance: EventAttendanceDay[]
  tasks: EventProgress
  staff: EventStaffStats[] | null
  fund: EventFundStats | null
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
  /** CLB gốc của nhân sự CLB đồng tổ chức; null với thành viên CLB chủ trì và CTV. */
  homeClubName: string | null
  /** Vào tiểu ban vượt chỉ tiêu nhờ Trưởng BTC duyệt ngoại lệ (BR-EVT-07). */
  overQuota: boolean
}

/**
 * - `INVITE_MEMBER`: mời thành viên CLB chủ trì (Trưởng tiểu ban cũng được).
 * - `ADD_COLLABORATOR`, `ADD_CO_HOST_STAFF`, `SET_LEAD`: cần quyền ở cả sự kiện (FR-EVT-07, 08).
 */
export type SubcommitteeAction = 'INVITE_MEMBER' | 'ADD_COLLABORATOR' | 'ADD_CO_HOST_STAFF' | 'SET_LEAD'

export interface Subcommittee {
  id: string
  name: string
  description: string
  /** Chỉ tiêu nhân sự; null là không đặt chỉ tiêu. */
  quota: number | null
  lead: StaffMember | null
  members: StaffMember[]
  allowedActions: SubcommitteeAction[]
}

/** ST-COH: Đã gửi, Chấp nhận, Từ chối, Đã gỡ. */
export type CoHostStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'REMOVED'

export interface ClubRef {
  id: string
  name: string
}

/** CLB đồng tổ chức nhìn từ sự kiện của CLB chủ trì (FR-EVT-08). */
export interface CoHost {
  id: string
  club: ClubRef
  status: CoHostStatus
  message: string
  invitedBy: PersonRef
  invitedAt: string
  decidedAt: string | null
  /** Ghi chú khi từ chối. */
  decisionNote: string | null
  removedAt: string | null
  removeReason: string | null
  /** Nhân sự của CLB này đang ở trong BTC. */
  staffCount: number
  allowedActions: Array<'REMOVE'>
  version: number
}

/** Lời mời đồng tổ chức nhìn từ CLB được mời (tab Sự kiện chung). */
export interface SharedEvent {
  id: string
  event: { id: string; name: string; clubId: string; clubName: string; startAt: string; endAt: string; status: EventStatus }
  status: CoHostStatus
  message: string
  invitedBy: PersonRef
  invitedAt: string
  decidedBy: PersonRef | null
  decidedAt: string | null
  decisionNote: string | null
  removedAt: string | null
  removeReason: string | null
  staffCount: number
  allowedActions: Array<'ACCEPT' | 'DECLINE'>
  version: number
}

export interface InviteCoHostRequest {
  clubId: string
  message: string
}

export interface CoHostDecisionRequest {
  decision: 'ACCEPT' | 'DECLINE'
  /** Bắt buộc khi từ chối. */
  note: string | null
  version: number
}

export interface RemoveCoHostRequest {
  reason: string
  version: number
}

/** Đổi trưởng tiểu ban; lý do bắt buộc khi đang có trưởng (trưởng cũ kết thúc chức kèm lý do). */
export interface SetSubcommitteeLeadRequest {
  userId: string
  reason: string | null
}

/** FR-EVT-05: khi mời chỉ thấy tên và ban; nhân sự CLB đồng tổ chức thì ban ở CLB của họ. */
export interface StaffCandidate extends PersonRef {
  departmentName: string | null
}

export interface Registration {
  id: string
  /** Khách mời không có tài khoản: `id` là mã đăng ký, `fullName` là họ tên khách khai. */
  attendee: PersonRef
  guest: boolean
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
  /** FR-TERM-08: sự kiện bắt đầu trong khoảng nhiệm kỳ. */
  termId?: string
  page?: number
  size?: number
}

/** FR-CLB-07, FR-EVT-12: sự kiện mở cho khách trên trang công khai; không có BTC, quỹ, danh sách người đăng ký. */
export interface PublicEventSummary {
  id: string
  clubId: string
  clubName: string
  name: string
  startAt: string
  endAt: string
  format: EventFormat
  location: string | null
  capacity: number | null
  /** `null` khi không giới hạn chỗ; 0 thì đăng ký mới vào danh sách chờ. */
  seatsLeft: number | null
  registrationDeadline: string | null
}

export interface PublicEventDetail extends PublicEventSummary {
  description: string
  clubShortName: string
  clubLogoUrl: string | null
  /** Đang Mở đăng ký và chưa quá hạn (BR-EVT-02). */
  registrationOpen: boolean
}

/** FR-EVT-12: khách mời đăng ký trên trang công khai. */
export interface GuestRegistrationRequest {
  fullName: string
  email?: string
  phone?: string
}

export type GuestPassAction = 'CANCEL'

/** Vé của khách: mở bằng mã tham dự trong email, không cần đăng nhập. */
export interface GuestPass {
  code: string
  fullName: string
  emailHint: string | null
  phoneHint: string | null
  status: RegistrationStatus
  waitlistPosition: number | null
  registeredAt: string
  /** Ngày (yyyy-mm-dd) BTC đã ghi có mặt. */
  checkedInDays: string[]
  event: PublicEventSummary
  allowedActions: GuestPassAction[]
}

/** Dòng khách mời cho BTC tra cứu và ghi có mặt (FR-ATT-07); liên hệ đã che bớt. */
export interface GuestRegistrationRow {
  id: string
  fullName: string
  emailHint: string | null
  phoneHint: string | null
  code: string
  status: RegistrationStatus
  checkedIn: boolean
  checkedInAt: string | null
}

/** FR-EVT-06: tiểu ban thành viên tự đăng ký được. */
export interface SignupSubcommittee {
  id: string
  name: string
  description: string
  quota: number | null
  memberCount: number
  /** Đủ chỉ tiêu: đăng ký thành yêu cầu vượt chỉ tiêu chờ Trưởng BTC duyệt. */
  full: boolean
}

export type StaffSignupRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface MyStaffSignupRequest {
  id: string
  subcommitteeName: string
  status: StaffSignupRequestStatus
  note: string
  reason: string | null
  createdAt: string
}

/** Thông tin cho thành viên CLB chủ trì: BTC đang mở đăng ký nhân sự không, tôi đã ở tiểu ban nào, yêu cầu gần nhất. */
export interface StaffSignupInfo {
  open: boolean
  subcommittees: SignupSubcommittee[]
  mySubcommitteeName: string | null
  myRequest: MyStaffSignupRequest | null
  canSignUp: boolean
}

export interface StaffSignupRequest {
  subcommitteeId: string
  note?: string
}

export interface StaffSignupSetting {
  open: boolean
  version: number
}

/** Yêu cầu vượt chỉ tiêu chờ Trưởng BTC xử lý. */
export interface PendingStaffSignup {
  id: string
  person: PersonRef
  departmentName: string | null
  subcommitteeId: string
  subcommitteeName: string
  quota: number | null
  memberCount: number
  note: string
  createdAt: string
}
