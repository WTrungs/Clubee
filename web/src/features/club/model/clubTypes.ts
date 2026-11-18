import type { PersonRef } from '@/api/commonTypes'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import type { MembershipExit } from '@/features/member/model/memberTypes'
import type { TermStatus } from '@/features/term/model/termTypes'

/** Hành động cấp CLB máy chủ cho phép người đang xem (quyền tính ở máy chủ, SRS 2.4). */
export type ClubAction =
  | 'CREATE_EVENT'
  | 'PROPOSE_EVENT'
  | 'ASSIGN_TASK'
  | 'MANAGE_MEMBERS'
  | 'MANAGE_ORG'
  | 'ASSIGN_PRESIDENCY'
  | 'EDIT_CLUB'
  | 'SEND_ANNOUNCEMENT'
  | 'CREATE_TERM'
  | 'ASSIGN_POSITION'
  /** FR-ACC-08: thành viên Chính thức yêu cầu Admin chuyển quyền khi ban chủ nhiệm không hoạt động. */
  | 'REQUEST_PRESIDENCY_TRANSFER'
  /** FR-ORG-05: ban chủ nhiệm xem bảng phân quyền; sửa được hay không nằm ở `allowedActions` của bảng phân quyền. */
  | 'VIEW_PERMISSIONS'
  /** FR-EVT-08: ban chủ nhiệm xem và trả lời lời mời đồng tổ chức ở tab Sự kiện chung. */
  | 'VIEW_SHARED_EVENTS'
  /** FR-FIN-09: ban chủ nhiệm xem tab Đóng quỹ. */
  | 'VIEW_DUES'
  /** FR-FIN-09: người giữ sổ (mặc định Thủ quỹ) mở đợt đóng quỹ. */
  | 'OPEN_DUES'

/** Nhiệm kỳ đang phụ trách CLB: Đang chạy hoặc Đang bàn giao. */
export interface TermSummary {
  id: string
  name: string
  startOn: string
  endOn: string
  status: TermStatus
}

/** Liên hệ công khai, ai cũng xem được (SRS 3.5); `contactUrl` chỉ là http(s). */
export interface ClubContacts {
  contactEmail: string | null
  contactPhone: string | null
  contactUrl: string | null
}

export interface ClubDetail extends ClubContacts {
  id: string
  name: string
  shortName: string
  field: string
  description: string
  foundedOn: string
  logoUrl: string | null
  /** Nội quy dạng văn bản thuần, không phải HTML. */
  rules: string
  collectsStudentId: boolean
  memberCount: number
  currentTermName: string
  currentTerm: TermSummary | null
  myPositionTitles: string[]
  allowedActions: ClubAction[]
  /** Mỗi CLB có đúng một Quỹ chung (FR-FIN-06); khách của sự kiện nhận chuỗi rỗng. */
  generalFundId: string
  /** Khách của sự kiện (CTV, nhân sự CLB đồng tổ chức) chỉ có thông tin công khai và mục Sự kiện. */
  viewerRole: ClubViewerRole
  version: number
}

export type ClubViewerRole = 'MEMBER' | 'EVENT_GUEST'

/** FR-CLB-01: người tạo thành thành viên Chính thức và Chủ nhiệm của nhiệm kỳ đầu. */
export interface CreateClubRequest {
  name: string
  shortName: string
  field: string
  description: string
}

/** FR-CLB-02. */
export interface UpdateClubRequest extends CreateClubRequest {
  contactEmail: string | null
  contactPhone: string | null
  contactUrl: string | null
  rules: string
  collectsStudentId: boolean
  version: number
}

/** Tham số cấp CLB đang dùng (FR-CLB-03, SRS 9.2); giá trị mới không áp dụng ngược cho bản ghi đã hoàn tất. */
export interface ClubSettingsValues {
  /** Có bước thử việc khi duyệt gia nhập. */
  probationStep: boolean
  /** Số ngày liên kết mời gia nhập còn hiệu lực. */
  inviteLinkDays: number
  /** Số phút mở điểm danh QR trước giờ bắt đầu (BR-ATT-02). */
  attendanceLeadMinutes: number
  /** Chu kỳ đổi mã QR, tính bằng giây. */
  attendanceQrRotateSeconds: number
  /** Khoản chi trên ngưỡng này phải có chứng từ (BR-FIN-03). */
  expenseReceiptThreshold: number
  /** Người đã nhận chỗ hủy được tới trước giờ bắt đầu số giờ này. */
  registrationCancelHours: number
  /** Số giờ để xác nhận lại tham dự khi sự kiện dời thời gian. */
  rescheduleConfirmHours: number
  /** Nhắc việc trước hạn số ngày này; 0 là không nhắc. */
  taskReminderDays: number
  /** Hạn quyết toán tạm ứng gợi ý, tính từ ngày đề xuất. */
  advanceSettleDays: number
  /** Mốc bắt đầu học kỳ dạng `MM-DD`; `summerStart` null là không tách kỳ hè. */
  semester1Start: string
  semester2Start: string
  summerStart: string | null
}

export interface ClubSettings extends ClubSettingsValues {
  updatedAt: string | null
  updatedBy: PersonRef | null
  version: number
}

export interface UpdateClubSettingsRequest extends ClubSettingsValues {
  version: number
}

/** Tư cách gần nhất của người đang xem ở CLB; lý do chỉ có khi yêu cầu bị từ chối. */
export interface MyClubMembership {
  status: MemberStatus
  exitKind: MembershipExit | null
  rejectionReason: string | null
}

/** Thông tin công khai trong danh bạ CLB (SRS 3.5, FR-CLB-05). */
export interface ClubDirectoryEntry extends ClubContacts {
  id: string
  name: string
  shortName: string
  field: string
  description: string
  logoUrl: string | null
  collectsStudentId: boolean
  myMembership: MyClubMembership | null
  allowedActions: Array<'REQUEST_TO_JOIN'>
}

export interface ClubDirectoryQuery {
  q?: string
  page?: number
  size?: number
}
