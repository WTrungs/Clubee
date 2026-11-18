import type { FileRef, PersonRef } from '@/api/commonTypes'
import type { ExpenseCategory } from './financeTypes'

/** ST-ADV, thêm bước Đã duyệt giữa Đề xuất và Đã ứng (quyết định 16/11, FR-FIN-07 mô tả ba bước). */
export type AdvanceStatus = 'PROPOSED' | 'APPROVED' | 'DISBURSED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'REJECTED'

/**
 * Thao tác máy chủ cho phép người đang xem với một tạm ứng. `SUBMIT_SETTLEMENT`: người ứng nộp chứng từ; `DECIDE_LINES`: người
 * giữ sổ xác nhận hoặc trả lại lần nộp; `CLOSE`: người giữ sổ chốt quyết toán (FR-FIN-08).
 */
export type AdvanceAction = 'APPROVE' | 'REJECT' | 'DISBURSE' | 'SUBMIT_SETTLEMENT' | 'DECIDE_LINES' | 'CLOSE'

export type AdvanceTransitionAction = 'APPROVE' | 'REJECT' | 'DISBURSE'

export interface AdvanceSummary {
  id: string
  fundId: string
  fundName: string
  requester: PersonRef
  amount: number
  purpose: string
  category: ExpenseCategory
  /** Hạn quyết toán, ngày dạng yyyy-mm-dd. */
  settleBy: string
  status: AdvanceStatus
  /** Đã ứng hoặc Quyết toán một phần mà đã qua hạn quyết toán (BR-FIN-05), tính lúc đọc. */
  overdue: boolean
  createdAt: string
}

/** Một lần nộp chứng từ quyết toán: chờ xác nhận, đã xác nhận, hoặc bị trả lại (người ứng nộp lại bằng lần nộp mới). */
export type AdvanceLineStatus = 'SUBMITTED' | 'CONFIRMED' | 'RETURNED'

export interface AdvanceLine {
  id: string
  amount: number
  description: string
  /** Ngày chi, dạng yyyy-mm-dd. */
  spentOn: string
  attachments: FileRef[]
  status: AdvanceLineStatus
  submittedAt: string
  decidedBy: PersonRef | null
  decidedAt: string | null
  /** Ghi chú khi trả lại. */
  note: string | null
}

/** Kết quả chốt: hoàn lại phần thừa, chi bổ sung phần thiếu, hoặc khớp. */
export type AdvanceClosureKind = 'REFUND' | 'TOP_UP' | 'EXACT'

export interface AdvanceClosure {
  kind: AdvanceClosureKind
  /** Số tiền hoàn hoặc chi bổ sung; 0 khi khớp. */
  amount: number
  /** Điều chỉnh tăng quỹ (hoàn) hoặc khoản chi Đề xuất (chi bổ sung); null khi khớp. */
  transactionId: string | null
  closedBy: PersonRef
  closedAt: string
}

export interface AdvanceDetail extends AdvanceSummary {
  approver: PersonRef | null
  decidedAt: string | null
  rejectionReason: string | null
  disbursedBy: PersonRef | null
  disbursedOn: string | null
  /** Khoản chi Đã ghi sổ sinh ra khi ghi Đã ứng. */
  disbursementTxId: string | null
  lines: AdvanceLine[]
  /** Tổng các lần nộp đã xác nhận. */
  confirmedAmount: number
  closure: AdvanceClosure | null
  allowedActions: AdvanceAction[]
  version: number
}

export interface ProposeAdvanceRequest {
  fundId: string
  amount: number
  purpose: string
  category: ExpenseCategory
  settleBy: string
}

export interface AdvanceTransitionRequest {
  action: AdvanceTransitionAction
  version: number
  /** Bắt buộc khi `REJECT`. */
  reason?: string
  /** Ngày ứng khi `DISBURSE`, không sau hôm nay. */
  disbursedOn?: string
}

export interface SubmitSettlementLineRequest {
  amount: number
  description: string
  spentOn: string
  /** Ít nhất một chứng từ, tải trước qua `transaction-attachments`. */
  attachmentIds: string[]
  version: number
}

export interface SettlementLineDecisionRequest {
  action: 'CONFIRM' | 'RETURN'
  /** Bắt buộc khi `RETURN`. */
  note?: string
  version: number
}

export interface CloseAdvanceRequest {
  /** Ngày nhận lại tiền thừa, chỉ dùng khi có phần hoàn; không sau hôm nay. */
  refundOn?: string
  version: number
}

export interface AdvanceQuery {
  fundId?: string
  status?: AdvanceStatus[]
  mine?: boolean
  overdue?: boolean
  q?: string
  page?: number
  size?: number
}
