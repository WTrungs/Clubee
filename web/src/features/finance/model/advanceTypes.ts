import type { PersonRef } from '@/api/commonTypes'
import type { ExpenseCategory } from './financeTypes'

/** ST-ADV, thêm bước Đã duyệt giữa Đề xuất và Đã ứng (quyết định 16/11, FR-FIN-07 mô tả ba bước). */
export type AdvanceStatus = 'PROPOSED' | 'APPROVED' | 'DISBURSED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'REJECTED'

/** Thao tác máy chủ cho phép người đang xem với một tạm ứng. */
export type AdvanceAction = 'APPROVE' | 'REJECT' | 'DISBURSE'

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

export interface AdvanceDetail extends AdvanceSummary {
  approver: PersonRef | null
  decidedAt: string | null
  rejectionReason: string | null
  disbursedBy: PersonRef | null
  disbursedOn: string | null
  /** Khoản chi Đã ghi sổ sinh ra khi ghi Đã ứng. */
  disbursementTxId: string | null
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

export interface AdvanceQuery {
  fundId?: string
  status?: AdvanceStatus[]
  mine?: boolean
  overdue?: boolean
  q?: string
  page?: number
  size?: number
}
