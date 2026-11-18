import type { PersonRef } from '@/api/commonTypes'

/** Đợt đóng quỹ (FR-FIN-09): đang mở thì nhận khoản nộp; đã đóng thì không sửa, không nhận thêm (BR-FIN-06). */
export type DuesCampaignStatus = 'OPEN' | 'CLOSED'

/** Tình trạng một người trong đợt, tính từ mức phải đóng, số đã nộp và miễn giảm. */
export type DuesItemStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'EXEMPT'

/** Miễn toàn bộ hoặc giảm còn một mức thấp hơn. */
export type DuesExemptionKind = 'EXEMPT' | 'REDUCED'

/** `EDIT_AMOUNT` chỉ khi chưa ai nộp; `RECORD_PAYMENT` dùng ở FR-FIN-10. */
export type DuesCampaignAction = 'EDIT' | 'EDIT_AMOUNT' | 'SET_EXEMPTION' | 'RECORD_PAYMENT' | 'CLOSE'

export interface DuesExemption {
  kind: DuesExemptionKind
  reason: string
  by: PersonRef
  at: string
}

export interface DuesCampaignSummary {
  id: string
  name: string
  /** Mức đóng mỗi người, VND. */
  amount: number
  /** Hạn nộp, yyyy-mm-dd. */
  dueOn: string
  status: DuesCampaignStatus
  /** Số người trong danh sách chụp lúc mở đợt. */
  memberCount: number
  /** Số người đã nộp đủ hoặc được miễn. */
  settledCount: number
  /** Tổng phải thu sau miễn giảm. */
  expectedAmount: number
  /** Tổng đã thu. */
  collectedAmount: number
  openedAt: string
  closedAt: string | null
}

export interface DuesCampaignDetail extends DuesCampaignSummary {
  openedBy: PersonRef
  closedBy: PersonRef | null
  /** Đã có người nộp thì không sửa mức đóng được nữa. */
  hasPayments: boolean
  allowedActions: DuesCampaignAction[]
  version: number
}

export interface DuesItem {
  id: string
  /** Họ tên chụp lúc mở đợt (BR-DATA-02). */
  member: PersonRef
  departmentName: string | null
  /** Mức phải đóng sau miễn giảm; 0 khi được miễn. */
  amountDue: number
  paidAmount: number
  status: DuesItemStatus
  exemption: DuesExemption | null
  version: number
}

export interface DuesExemptionInput {
  userId: string
  kind: DuesExemptionKind
  /** Mức còn phải đóng khi `REDUCED`: từ 1 tới dưới mức đóng. */
  amount?: number
  reason: string
}

export interface OpenDuesRequest {
  name: string
  amount: number
  dueOn: string
  exemptions: DuesExemptionInput[]
}

export interface UpdateDuesCampaignRequest {
  name?: string
  dueOn?: string
  /** Chỉ khi chưa ai nộp (422 `HAS_PAYMENTS`). */
  amount?: number
  version: number
}

export interface SetExemptionRequest {
  kind: DuesExemptionKind | 'NONE'
  amount?: number
  reason?: string
  version: number
}

export interface DuesCampaignQuery {
  status?: DuesCampaignStatus
  page?: number
  size?: number
}

export interface DuesItemQuery {
  status?: DuesItemStatus
  q?: string
  page?: number
  size?: number
}

/** Thành viên phải đóng, để chọn người miễn giảm khi mở đợt; chỉ tên và ban. */
export interface DuesCandidate {
  id: string
  fullName: string
  departmentName: string | null
}
