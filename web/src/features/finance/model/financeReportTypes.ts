import type { PersonRef } from '@/api/commonTypes'
import type { FinanceCategory } from './financeTypes'

/** Loại kỳ báo cáo (FR-FIN-12): tháng, học kỳ theo mốc CLB khai, nhiệm kỳ, hoặc khoảng ngày tự chọn. */
export type ReportPeriodKind = 'MONTH' | 'SEMESTER' | 'TERM' | 'CUSTOM'

export interface ReportPeriodOption {
  kind: Exclude<ReportPeriodKind, 'CUSTOM'>
  /** `yyyy-mm` với tháng, `yyyy-S1`, `yyyy-S2`, `yyyy-SUMMER` với học kỳ (năm bắt đầu năm học), mã nhiệm kỳ với nhiệm kỳ. */
  key: string
  label: string
  /** yyyy-mm-dd. */
  from: string
  to: string
}

export interface ReportPeriods {
  months: ReportPeriodOption[]
  semesters: ReportPeriodOption[]
  terms: ReportPeriodOption[]
}

export interface FinanceReportQuery {
  period: ReportPeriodKind
  key?: string
  from?: string
  to?: string
  category?: FinanceCategory
  eventId?: string
}

export interface ReportAmounts {
  income: number
  expense: number
}

export interface ReportCategoryRow extends ReportAmounts {
  category: FinanceCategory
}

export interface ReportFundRow extends ReportAmounts {
  fundId: string
  fundName: string
  /** Sự kiện của quỹ; null với Quỹ chung. */
  eventId: string | null
}

export interface ReportMonthRow extends ReportAmounts {
  /** yyyy-mm. */
  month: string
}

/** Khoản chi Đã ghi sổ do cùng một người duyệt và ghi sổ (R-01), cần lưu ý khi đối soát. */
export interface ReportFlaggedTransaction {
  transactionId: string
  description: string
  amount: number
  occurredOn: string
  fundName: string
  person: PersonRef
}

export interface FinanceReport {
  /** Khoảng ngày thật sự tính, yyyy-mm-dd. */
  from: string
  to: string
  label: string
  category: FinanceCategory | null
  event: { id: string; name: string } | null
  totalIncome: number
  totalExpense: number
  /** Thu trừ chi. */
  net: number
  byCategory: ReportCategoryRow[]
  byFund: ReportFundRow[]
  byMonth: ReportMonthRow[]
  /** Tạm ứng đang quá hạn quyết toán của CLB (tại lúc xem). */
  overdueAdvanceCount: number
  /** Số người còn thiếu ở các đợt đóng quỹ của CLB (tại lúc xem). */
  unpaidDuesCount: number
  flagged: ReportFlaggedTransaction[]
}

export interface UnpaidDuesRow {
  itemId: string
  campaignId: string
  campaignName: string
  /** Họ tên chụp lúc mở đợt (BR-DATA-02). */
  member: PersonRef
  owed: number
  dueOn: string
  overdue: boolean
}

export interface UnpaidDuesQuery {
  campaignId?: string
  page?: number
  size?: number
}
