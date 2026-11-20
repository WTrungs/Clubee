import type { PersonRef } from '@/api/commonTypes'
import type { MemberStatus } from '@/features/account/model/accountTypes'

/** Chuyển trạng thái tư cách thành viên theo ST-MEM (SRS 4.2). */
export type MemberTransitionAction = 'APPROVE_PROBATION' | 'APPROVE_ACTIVE' | 'REJECT' | 'CONFIRM' | 'PUT_ON_LEAVE' | 'RETURN' | 'REMOVE'

/** Ngoài chuyển trạng thái: gán chức vụ thường trực cho thành viên Chính thức (FR-ORG-02), sửa thông tin trong CLB (FR-MEM-05), chuyển ban chính (FR-MEM-10). */
export type MemberAction = MemberTransitionAction | 'ASSIGN_POSITION' | 'EDIT_INFO' | 'TRANSFER_DEPARTMENT'

/** Trường ban chủ nhiệm sửa được ở FR-MEM-05; mỗi lần đổi lưu một dòng lịch sử. */
export type MemberInfoField = 'displayTitle' | 'internalNote' | 'studentId' | 'joinedOn'

/** Cách tư cách kết thúc ở Đã rời: bị từ chối gia nhập, bị đưa ra hoặc tự xin rời. */
export type MembershipExit = 'REJECTED' | 'REMOVED' | 'RESIGNED'

/** Chức vụ thường trực dùng để lọc danh sách; `NONE` là người không giữ chức vụ nào. */
export type MemberRoleFilter = 'PRESIDENT' | 'VICE_PRESIDENT' | 'TREASURER' | 'DEPARTMENT_HEAD' | 'DEPARTMENT_VICE_HEAD' | 'NONE'

export interface DepartmentRef {
  id: string
  name: string
}

/** Chỉ ban chủ nhiệm nhận được (SRS 3.5); người khác nhận `null`. */
export interface MemberContact {
  email: string
  phone: string | null
}

export interface MemberSummary {
  membershipId: string
  person: PersonRef
  status: MemberStatus
  department: DepartmentRef | null
  positionTitles: string[]
  /** Chức danh hiển thị do ban chủ nhiệm đặt, khác chức vụ được gán; mọi thành viên cùng CLB thấy (SRS 3.5). */
  displayTitle: string | null
  joinedOn: string | null
  contact: MemberContact | null
  studentId: string | null
  /** Gửi kèm khi chuyển ban nhiều người từ danh sách (NFR-REL-03). */
  version: number
}

/** Một khoảng thuộc một ban chính; `toOn` là ngày cuối, null là đang thuộc (FR-MEM-10, BR-MEM-06). */
export interface DepartmentStint {
  department: DepartmentRef
  fromOn: string
  toOn: string | null
  changedBy: PersonRef | null
}

/** FR-MEM-10: tất cả hoặc không ai; ban cũ kết thúc hôm qua, ban mới bắt đầu hôm nay. */
export interface DepartmentTransferRequest {
  toDepartmentId: string
  members: Array<{ membershipId: string; version: number }>
}

export interface DepartmentTransferResult {
  toDepartment: DepartmentRef
  members: MemberSummary[]
}

/** Yêu cầu xin tạm nghỉ (FR-MEM-07); `CLOSED` khi ban chủ nhiệm xử lý tư cách ở chỗ khác trước khi duyệt. */
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED'

export interface LeaveRequest {
  id: string
  membershipId: string
  member: PersonRef
  department: DepartmentRef | null
  reason: string
  status: LeaveRequestStatus
  createdAt: string
  decidedBy: PersonRef | null
  decidedAt: string | null
  decisionNote: string | null
  /** Lý do hiện tại chưa cho tạm nghỉ được (còn chức vụ thường trực, có trong kết quả bầu); máy chủ kiểm lại khi duyệt. */
  blockers: string[]
  allowedActions: Array<'APPROVE' | 'REJECT'>
  version: number
}

export interface LeaveRequestQuery {
  status?: 'PENDING' | 'DECIDED'
  page?: number
  size?: number
}

export interface LeaveDecisionRequest {
  action: 'APPROVE' | 'REJECT'
  /** Bắt buộc khi từ chối. */
  note?: string
  version: number
}

/** Khoản còn tồn khiến chưa tự xin rời được (BR-MEM-03); tài sản thêm khi có module. */
export interface ResignBlocker {
  /** `ADVANCE`: tạm ứng còn mở do người này ứng, `refId` là mã tạm ứng. */
  kind: 'POSITION' | 'TASK' | 'TASK_REVIEW' | 'APPOINTMENT' | 'ADVANCE'
  refId: string
  /** CLB của khoản này; việc, chức vụ ở sự kiện chung thuộc CLB chủ trì (FR-EVT-08). */
  clubId: string
  title: string
}

export type MyMembershipAction = 'REQUEST_LEAVE' | 'WITHDRAW_LEAVE_REQUEST' | 'RETURN' | 'RESIGN'

/** Tư cách của chính người đang xem ở CLB (FR-MEM-07). */
export interface MyMembership {
  membershipId: string
  status: MemberStatus
  department: DepartmentRef | null
  joinedOn: string | null
  /** Yêu cầu tạm nghỉ gần nhất của lần sinh hoạt này. */
  leaveRequest: LeaveRequest | null
  leaveBlockers: string[]
  resignBlockers: ResignBlocker[]
  allowedActions: MyMembershipAction[]
  version: number
}

export interface MyMembershipTransitionRequest {
  action: 'RETURN' | 'RESIGN'
  /** Bắt buộc khi xin rời. */
  reason?: string
  version: number
}

export interface MemberInfoChange {
  at: string
  actor: PersonRef
  field: MemberInfoField
  from: string | null
  to: string | null
}

export interface MemberStatusChange {
  at: string
  actor: PersonRef
  fromStatus: MemberStatus | null
  toStatus: MemberStatus
  reason: string | null
}

/** Lần sinh hoạt trước của cùng người ở CLB này (FR-MEM-03). */
export interface PastMembership {
  membershipId: string
  joinedOn: string | null
  leftOn: string | null
  exitKind: MembershipExit | null
  reason: string | null
  departmentName: string | null
}

export interface MemberDetail extends MemberSummary {
  /** Từ đây đến `backlogCount` chỉ ban chủ nhiệm nhận được; người khác nhận `null`. */
  leftOn: string | null
  exitKind: MembershipExit | null
  leaveReason: string | null
  internalNote: string | null
  /** Lịch sử sửa thông tin, mới nhất trước (FR-MEM-05). */
  infoHistory: MemberInfoChange[] | null
  history: MemberStatusChange[] | null
  pastMemberships: PastMembership[] | null
  /** Các ban chính đã qua, mới nhất trước. */
  departmentHistory: DepartmentStint[] | null
  /** Số mục tồn đọng chờ gán lại sau khi bị đưa ra (FR-MEM-08, 09). */
  backlogCount: number | null
  allowedActions: MemberAction[]
  version: number
}

export interface JoinRequest {
  membershipId: string
  applicant: PersonRef
  contact: MemberContact
  studentId: string | null
  introduction: string
  requestedAt: string
  /** Người tạo lời mời mà yêu cầu này đã dùng (FR-MEM-01); null nếu tự tìm đến CLB. */
  invitedBy: PersonRef | null
  pastMemberships: PastMembership[]
  /** Duyệt sang Thử việc chỉ có khi CLB bật bước thử việc (SRS 9.2). */
  allowedActions: MemberTransitionAction[]
  version: number
}

export interface MemberTransitionRequest {
  action: MemberTransitionAction
  version: number
  reason?: string
  departmentId?: string
}

/** FR-MEM-05: gửi đủ bốn trường; chuỗi rỗng là xóa. `studentId` bị bỏ qua khi CLB không thu thập MSSV. */
export interface UpdateMemberInfoRequest {
  displayTitle: string | null
  internalNote: string | null
  studentId: string | null
  joinedOn: string
  version: number
}

export interface MemberQuery {
  q?: string
  status?: MemberStatus[]
  departmentId?: string
  role?: MemberRoleFilter
  joinYear?: number
  page?: number
  size?: number
}

export interface MemberFacets {
  departments: Array<DepartmentRef & { closed: boolean }>
  joinYears: number[]
}

export interface CreateJoinRequest {
  introduction: string
  studentId?: string
  /** Mã lời mời khi gửi từ trang lời mời (FR-MEM-01). */
  invitationToken?: string
}

export interface JoinRequestReceipt {
  membershipId: string
  status: MemberStatus
  requestedAt: string
}
