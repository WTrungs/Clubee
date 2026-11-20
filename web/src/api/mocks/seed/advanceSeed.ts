import type { AdvanceClosureKind, AdvanceLineStatus, AdvanceStatus } from '@/features/finance/model/advanceTypes'
import type { ExpenseCategory } from '@/features/finance/model/financeTypes'
import { vnDate, vnDayAt } from '../mockTime'
import { generalFundId } from './financeSeed'

/** Một lần nộp chứng từ quyết toán (FR-FIN-08). */
export interface DbAdvanceLine {
  id: string
  amount: number
  description: string
  spentOn: string
  attachmentIds: string[]
  status: AdvanceLineStatus
  submittedAt: string
  decidedBy: string | null
  decidedAt: string | null
  note: string | null
}

/** Tạm ứng (FR-FIN-07, ST-ADV), lần nộp chứng từ và chốt quyết toán (FR-FIN-08). Dữ liệu tổng hợp. */
export interface DbAdvance {
  id: string
  clubId: string
  fundId: string
  requesterId: string
  amount: number
  purpose: string
  category: ExpenseCategory
  settleBy: string
  status: AdvanceStatus
  approverId: string | null
  decidedAt: string | null
  rejectionReason: string | null
  disbursedBy: string | null
  disbursedOn: string | null
  disbursementTxId: string | null
  /** Đã nhắc sắp tới hạn quyết toán cho hạn này (giữ hạn để nhắc lại nếu hạn đổi). */
  remindedFor: string | null
  /** Đã báo quá hạn cho hạn này. */
  overdueNotifiedFor: string | null
  lines: DbAdvanceLine[]
  closure: { kind: AdvanceClosureKind; amount: number; transactionId: string | null; closedBy: string; closedAt: string } | null
  createdAt: string
  version: number
}

/**
 * Một đề xuất đang chờ duyệt ở Quỹ chung CLB Guitar. Chưa seed khoản Đã ứng vì khoản đó sinh giao dịch chi, làm đổi số dư
 * mà nhiều test cũ đang dựa vào.
 */
export function createAdvanceSeed(): DbAdvance[] {
  return [
    {
      id: 'adv-strings',
      clubId: 'c-guitar',
      fundId: generalFundId('c-guitar'),
      requesterId: 'u-huy',
      amount: 400_000,
      purpose: 'Mua dây đàn dự phòng cho buổi tập tháng 12',
      category: 'EQUIPMENT',
      settleBy: vnDate(12),
      status: 'PROPOSED',
      approverId: null,
      decidedAt: null,
      rejectionReason: null,
      disbursedBy: null,
      disbursedOn: null,
      disbursementTxId: null,
      remindedFor: null,
      overdueNotifiedFor: null,
      lines: [],
      closure: null,
      createdAt: vnDayAt(-1, 15),
      version: 1,
    },
  ]
}
