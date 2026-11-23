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
  /** FR-FIN-12: ban chủ nhiệm xem tab Báo cáo thu chi. */
  | 'VIEW_FINANCE_REPORT'
  /** FR-REC-01: mở và quản lý đợt tuyển (quyền Quản lý thành viên). */
  | 'MANAGE_RECRUITMENT'
  /** FR-RPT-04: ban chủ nhiệm xem báo cáo CLB. */
  | 'VIEW_CLUB_REPORT'
  /** FR-RPT-03: ban chủ nhiệm, trưởng và phó ban xem báo cáo ban. */
  | 'VIEW_DEPARTMENT_REPORTS'
  /** FR-RPT-06: ban chủ nhiệm xem nhật ký thao tác. */
  | 'VIEW_AUDIT_LOG'
  /** FR-DOC-04: ban chủ nhiệm xem và khôi phục tài liệu đã ẩn. */
  | 'VIEW_HIDDEN_DOCUMENTS'
  /** FR-TASK-08: ban chủ nhiệm, Trưởng ban, Phó ban, Trưởng BTC xem khối lượng việc theo người. */
  | 'VIEW_WORKLOAD'
  /** FR-CLB-04: ban chủ nhiệm tạm ngừng, cho hoạt động lại, giải thể CLB. */
  | 'CHANGE_CLUB_STATUS'
  /** FR-REC-01: mở đợt tuyển mới; CLB tạm ngừng thì không có (ST-CLB). */
  | 'CREATE_RECRUITMENT'
  /** FR-CLB-06: ban chủ nhiệm soạn, xuất bản, ẩn tin tức; thấy cả tin nháp và tin đã ẩn. */
  | 'MANAGE_NEWS'

/** ST-CLB: Hoạt động ↔ Tạm ngừng; Hoạt động, Tạm ngừng → Giải thể. */
export type ClubStatus = 'ACTIVE' | 'SUSPENDED' | 'DISSOLVED'

export type ClubTransitionAction = 'SUSPEND' | 'REACTIVATE' | 'DISSOLVE'

/** FR-CLB-04. */
export interface ClubTransitionRequest {
  action: ClubTransitionAction
  reason: string
  version: number
}

/** Lần đổi trạng thái gần nhất, hiện ở băng thông báo của CLB. */
export interface ClubStatusChange {
  status: ClubStatus
  at: string
  by: PersonRef
  reason: string
}

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
  status: ClubStatus
  lastStatusChange: ClubStatusChange | null
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
  /** Người chốt sửa được điểm danh trong số giờ này sau khi chốt; quá hạn chỉ ban chủ nhiệm (FR-ATT-08). */
  attendanceEditHours: number
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

/** Thẻ CLB ở danh bạ công khai (FR-CLB-05): chỉ thông tin ai cũng xem được theo SRS 3.5, khách chưa đăng nhập cũng xem. */
export interface PublicClubCard extends ClubContacts {
  id: string
  name: string
  shortName: string
  field: string
  description: string
  logoUrl: string | null
  openRecruitmentCount: number
}

export interface PublicClubQuery {
  q?: string
  field?: string
  page?: number
  size?: number
}

/** Đợt tuyển đang nhận đơn hiện ở trang công khai của CLB. */
export interface PublicRecruitmentSummary {
  id: string
  name: string
  closesAt: string
  departments: Array<{ id: string; name: string; quota: number }>
}

/** Trang công khai của CLB: không có sĩ số, nội quy, cơ cấu hay người giữ chức vụ (SRS 3.5). */
export interface PublicClubProfile extends PublicClubCard {
  openRecruitments: PublicRecruitmentSummary[]
}
