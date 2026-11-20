import { formatMoney } from '@/shared/format/formatMoney'
import type { Tone } from '@/shared/ui/tone'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type FinanceCategory,
  type FundStatus,
  type TransactionFlow,
  type TransactionStatus,
  type TransactionTransitionAction,
  type TransactionType,
} from '../model/financeTypes'

export const financeCategoryLabel: Record<FinanceCategory, string> = {
  MEMBER_DUES: 'Đóng quỹ thành viên',
  SPONSORSHIP: 'Tài trợ',
  EVENT_REVENUE: 'Doanh thu sự kiện',
  OTHER_INCOME: 'Thu khác',
  EQUIPMENT: 'Thiết bị, nhạc cụ',
  VENUE: 'Thuê địa điểm',
  PRINTING: 'In ấn, truyền thông',
  FOOD: 'Ăn uống',
  TRAVEL: 'Di chuyển',
  OTHER_EXPENSE: 'Chi khác',
  FUND_TRANSFER: 'Chuyển quỹ',
  CO_HOST_SHARE: 'Chia CLB đồng tổ chức',
}

/** Hạng mục để lọc sổ quỹ: mọi hạng mục thu, chi và chuyển quỹ. */
export const LEDGER_CATEGORIES: FinanceCategory[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'CO_HOST_SHARE', 'FUND_TRANSFER']

export const transactionTypeLabel: Record<TransactionType, string> = {
  INCOME: 'Khoản thu',
  EXPENSE: 'Khoản chi',
  ADJUSTMENT: 'Điều chỉnh',
  TRANSFER: 'Chuyển quỹ',
}

export const transactionStatusDisplay: Record<TransactionStatus, { label: string; tone: Tone }> = {
  PROPOSED: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt, chờ ghi sổ', tone: 'info' },
  POSTED: { label: 'Đã ghi sổ', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  WITHDRAWN: { label: 'Đã rút', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}

export const fundStatusDisplay: Record<FundStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Đang mở', tone: 'success' },
  SETTLED: { label: 'Đã quyết toán', tone: 'neutral' },
}

export const flowLabel: Record<TransactionFlow, string> = { IN: 'Tiền vào', OUT: 'Tiền ra' }

export const transactionActionLabel: Record<TransactionTransitionAction, string> = {
  WITHDRAW: 'Rút đề xuất',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  POST: 'Ghi sổ',
  CANCEL: 'Hủy khoản chi',
}

/** Câu báo sau khi máy chủ đã lưu; điều chỉnh giảm quỹ được ghi sổ ngay khi duyệt. */
export function transactionActionSuccess(action: TransactionTransitionAction, type: TransactionType): string {
  const adjustment = type === 'ADJUSTMENT'
  switch (action) {
    case 'WITHDRAW':
      return 'Đã rút đề xuất.'
    case 'APPROVE':
      return adjustment ? 'Đã duyệt điều chỉnh, giao dịch đã được ghi sổ.' : 'Đã duyệt khoản chi.'
    case 'REJECT':
      return adjustment ? 'Đã từ chối điều chỉnh.' : 'Đã từ chối khoản chi.'
    case 'POST':
      return 'Đã ghi sổ khoản chi.'
    case 'CANCEL':
      return 'Đã hủy khoản chi.'
  }
}

/** Thứ tự nút trong chi tiết giao dịch: thao tác chính trước. */
export const TRANSACTION_TRANSITIONS: TransactionTransitionAction[] = ['APPROVE', 'POST', 'REJECT', 'WITHDRAW', 'CANCEL']

/** Lọc danh sách khoản chi: cần xử lý (chờ duyệt, chờ ghi sổ) hoặc đã xử lý xong. */
export type RequestFilter = 'PENDING' | 'CLOSED'

export const requestFilterDisplay: Record<RequestFilter, { label: string; statuses: TransactionStatus[] }> = {
  PENDING: { label: 'Cần xử lý', statuses: ['PROPOSED', 'APPROVED'] },
  CLOSED: { label: 'Đã xử lý', statuses: ['POSTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'] },
}

/** Số tiền kèm dấu theo chiều tiền, ví dụ "+1.500.000 đ" hoặc "−450.000 đ"; màu chỉ đi kèm, không thay cho dấu. */
export function signedAmount(amount: number, flow: TransactionFlow): string {
  return `${flow === 'IN' ? '+' : '−'}${formatMoney(amount)}`
}

export type LedgerPeriod = 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'TERM'

export const LEDGER_PERIODS: LedgerPeriod[] = ['ALL', 'THIS_MONTH', 'LAST_MONTH', 'TERM']

export const ledgerPeriodLabel: Record<LedgerPeriod, string> = {
  ALL: 'Mọi thời gian',
  THIS_MONTH: 'Tháng này',
  LAST_MONTH: 'Tháng trước',
  TERM: 'Nhiệm kỳ này',
}

const pad = (value: number) => String(value).padStart(2, '0')

function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` }
}

/** Kỳ lọc sổ quỹ (FR-FIN-06) thành khoảng ngày yyyy-mm-dd, tính cả hai đầu; `today` theo giờ Việt Nam. */
export function periodRange(period: LedgerPeriod, today: string, term: { startOn: string; endOn: string } | null): { from?: string; to?: string } {
  const [year = 0, month = 1] = today.split('-').map(Number)
  switch (period) {
    case 'ALL':
      return {}
    case 'THIS_MONTH':
      return monthRange(year, month)
    case 'LAST_MONTH':
      return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1)
    case 'TERM':
      // Nhiệm kỳ quá ngày kết thúc mà chưa bàn giao xong thì vẫn đang chạy, nên tính tới hôm nay (BR-TERM-02).
      return term ? { from: term.startOn, to: term.endOn < today ? today : term.endOn } : {}
  }
}
