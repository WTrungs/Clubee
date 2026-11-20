import type { FileRef, PersonRef } from '@/api/commonTypes'
import type { EventStatus } from '@/features/event/model/eventTypes'

/** Quỹ chung của CLB hoặc quỹ riêng của một sự kiện (SRS 4.1). */
export type FundKind = 'GENERAL' | 'EVENT'

/** Quỹ sự kiện sang Đã quyết toán sau FR-FIN-11; Quỹ chung luôn mở. */
export type FundStatus = 'OPEN' | 'SETTLED'

export type FundAction = 'RECORD_INCOME' | 'PROPOSE_EXPENSE' | 'VIEW_REQUESTS' | 'SETTLE'

export type TransactionType = 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER'

/** ST-EXP. Khoản thu, chuyển quỹ và điều chỉnh tăng quỹ được ghi thẳng vào Đã ghi sổ. */
export type TransactionStatus = 'PROPOSED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'WITHDRAWN'

/** Tiền vào hay ra khỏi quỹ đang xem. */
export type TransactionFlow = 'IN' | 'OUT'

export type TransactionTransitionAction = 'WITHDRAW' | 'APPROVE' | 'REJECT' | 'POST'

export type TransactionAction = TransactionTransitionAction | 'ADJUST'

export const INCOME_CATEGORIES = ['MEMBER_DUES', 'SPONSORSHIP', 'EVENT_REVENUE', 'OTHER_INCOME'] as const
export const EXPENSE_CATEGORIES = ['EQUIPMENT', 'VENUE', 'PRINTING', 'FOOD', 'TRAVEL', 'OTHER_EXPENSE'] as const

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
/** Hạng mục cố định; `FUND_TRANSFER` chỉ hệ thống dùng khi quyết toán quỹ sự kiện. */
export type FinanceCategory = IncomeCategory | ExpenseCategory | 'FUND_TRANSFER'

export interface FundEventRef {
  id: string
  name: string
  status: EventStatus
}

export interface FundSummary {
  id: string
  kind: FundKind
  name: string
  event: FundEventRef | null
  status: FundStatus
  /** Tính từ các giao dịch Đã ghi sổ tại thời điểm đọc, không lưu sẵn (BR-FIN-02). */
  balance: number
}

export interface FundDetail extends FundSummary {
  /** Khoản chi trên mức này phải có chứng từ (BR-FIN-03, SRS 9.2). */
  receiptThreshold: number
  /** Số khoản chi, điều chỉnh còn chờ duyệt hoặc chờ ghi sổ; null với người không được xem các khoản này. */
  pendingCount: number | null
  settledAt: string | null
  settledBy: PersonRef | null
  allowedActions: FundAction[]
  version: number
}

export interface TransactionSummary {
  id: string
  fundId: string
  fundName: string
  type: TransactionType
  flow: TransactionFlow
  /** Số nguyên dương, VND (BR-FIN-04); chiều tiền nằm ở `flow`. */
  amount: number
  category: FinanceCategory
  description: string
  /** Ngày tiền vào, ra thật; chỉ có khi đã ghi sổ. */
  occurredOn: string | null
  status: TransactionStatus
  proposer: PersonRef
  originalId: string | null
  createdAt: string
}

export interface TransactionRef {
  id: string
  type: TransactionType
  flow: TransactionFlow
  amount: number
  description: string
  status: TransactionStatus
}

export interface TransactionDetail extends TransactionSummary {
  approver: PersonRef | null
  poster: PersonRef | null
  attachments: FileRef[]
  original: TransactionRef | null
  adjustments: TransactionRef[]
  /** Quỹ ở đầu bên kia của giao dịch chuyển quỹ. */
  counterpartFundName: string | null
  rejectionReason: string | null
  decidedAt: string | null
  postedAt: string | null
  allowedActions: TransactionAction[]
  version: number
}

export interface CreateTransactionRequest {
  fundId: string
  type: Exclude<TransactionType, 'TRANSFER'>
  amount: number
  /** Bỏ trống với điều chỉnh: lấy theo giao dịch gốc. */
  category?: IncomeCategory | ExpenseCategory
  /** Nội dung; với điều chỉnh là lý do điều chỉnh. */
  description: string
  /** Ngày thu, chỉ dùng cho khoản thu. */
  occurredOn?: string
  attachmentIds: string[]
  originalTransactionId?: string
  direction?: TransactionFlow
}

export interface TransactionTransitionRequest {
  action: TransactionTransitionAction
  version: number
  reason?: string
}

export interface FundTransitionRequest {
  action: 'SETTLE'
  version: number
}

export interface TransactionQuery {
  fundId?: string
  status?: TransactionStatus[]
  type?: TransactionType[]
  category?: FinanceCategory
  /** Ngày yyyy-mm-dd, tính theo `occurredOn`. */
  from?: string
  to?: string
  q?: string
  /** Chỉ các khoản người gọi đã tạo. */
  mine?: boolean
  page?: number
  size?: number
}

export interface FundQuery {
  kind?: FundKind
  status?: FundStatus
  page?: number
  size?: number
}
