import type { PersonRef } from '@/api/commonTypes'

/** FR-ACC-08: yêu cầu Admin chuyển quyền Chủ nhiệm khi cả ban chủ nhiệm không hoạt động. */
export type TransferRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/** Kết quả kiểm ban chủ nhiệm có đăng nhập trong số ngày quy định hay không, tại một thời điểm. */
export interface BoardActivityCheck {
  boardInactive: boolean
  inactiveDays: number
  /** Lần đăng nhập gần nhất của người đang giữ chức ban chủ nhiệm; chỉ Admin nhận. */
  lastBoardLoginAt: string | null
  checkedAt: string
}

/** Yêu cầu nhìn từ phía thành viên; lý do, ghi chú xử lý chỉ người gửi nhận. */
export interface MemberTransferRequest {
  id: string
  status: TransferRequestStatus
  requester: PersonRef
  mine: boolean
  reason: string | null
  createdAt: string
  handledAt: string | null
  decisionNote: string | null
  newPresident: PersonRef | null
  allowedActions: Array<'CANCEL'>
  version: number
}

export interface PresidencyTransferOverview {
  boardInactive: boolean
  inactiveDays: number
  /** Yêu cầu đang chờ của CLB, nếu không có thì yêu cầu gần nhất của chính người xem. */
  request: MemberTransferRequest | null
  allowedActions: Array<'REQUEST'>
}

export interface AdminTransferRequest {
  id: string
  club: { id: string; name: string; shortName: string }
  requester: PersonRef
  reason: string
  status: TransferRequestStatus
  createdAt: string
  checkAtRequest: BoardActivityCheck
  /** Chỉ có với yêu cầu đang chờ: ban chủ nhiệm có thể đã đăng nhập lại. */
  checkNow: BoardActivityCheck | null
  handledBy: PersonRef | null
  handledAt: string | null
  newPresident: PersonRef | null
  decisionNote: string | null
  allowedActions: Array<'DECIDE'>
  version: number
}

export interface AdminTransferQuery {
  status: 'PENDING' | 'HANDLED'
  page?: number
  size?: number
}

/** Chỉ tên, ban, ngày gia nhập của thành viên Chính thức (R-04). */
export interface TransferCandidate {
  id: string
  fullName: string
  departmentName: string | null
  joinedOn: string | null
}

export interface TransferDecisionRequest {
  action: 'APPROVE' | 'REJECT'
  newPresidentId?: string
  note: string
  version: number
}
