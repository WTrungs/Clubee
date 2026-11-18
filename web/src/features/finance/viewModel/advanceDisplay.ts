import { formatDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import type { Tone } from '@/shared/ui/tone'
import type { AdvanceClosure, AdvanceClosureKind, AdvanceLineStatus, AdvanceStatus, AdvanceSummary } from '../model/advanceTypes'

export const advanceStatusDisplay: Record<AdvanceStatus, { label: string; tone: Tone }> = {
  PROPOSED: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Chờ ghi đã ứng', tone: 'info' },
  DISBURSED: { label: 'Đã ứng', tone: 'progress' },
  PARTIALLY_SETTLED: { label: 'Quyết toán một phần', tone: 'progress' },
  SETTLED: { label: 'Đã quyết toán', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'neutral' },
}

export type AdvanceFilter = 'OPEN' | 'PROPOSED' | 'APPROVED' | 'HELD' | 'CLOSED' | 'ALL'

/** Nhóm lọc ở tab Tạm ứng, theo việc còn phải làm. */
export const ADVANCE_FILTERS: Array<{ key: AdvanceFilter; label: string; statuses: AdvanceStatus[] | undefined }> = [
  { key: 'OPEN', label: 'Đang mở', statuses: ['PROPOSED', 'APPROVED', 'DISBURSED', 'PARTIALLY_SETTLED'] },
  { key: 'PROPOSED', label: 'Chờ duyệt', statuses: ['PROPOSED'] },
  { key: 'APPROVED', label: 'Chờ ghi đã ứng', statuses: ['APPROVED'] },
  { key: 'HELD', label: 'Đang giữ tiền', statuses: ['DISBURSED', 'PARTIALLY_SETTLED'] },
  { key: 'CLOSED', label: 'Đã xong', statuses: ['SETTLED', 'REJECTED'] },
  { key: 'ALL', label: 'Tất cả', statuses: undefined },
]

const DAY_MS = 24 * 60 * 60 * 1000

/** Hạn quyết toán gợi ý: hôm nay cộng số ngày CLB cấu hình (SRS 9.2), dạng dd/mm/yyyy cho ô nhập. */
export function defaultSettleBy(now: number, days: number): string {
  return formatDate(toVnDateKey(new Date(now + days * DAY_MS)))
}

/** Câu về hạn quyết toán; tạm ứng bị từ chối hoặc đã quyết toán xong thì không nhắc hạn. */
export function settleByText(advance: Pick<AdvanceSummary, 'status' | 'settleBy' | 'overdue'>): string | null {
  if (advance.status === 'REJECTED' || advance.status === 'SETTLED') return null
  if (advance.overdue) return `Quá hạn quyết toán từ ${formatDate(advance.settleBy)}`
  return `Quyết toán trước ${formatDate(advance.settleBy)}`
}

export const advanceLineStatusDisplay: Record<AdvanceLineStatus, { label: string; tone: Tone }> = {
  SUBMITTED: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'success' },
  RETURNED: { label: 'Bị trả lại', tone: 'danger' },
}

/** Đối chiếu số đã ứng với tổng đã xác nhận (FR-FIN-08): còn phải quyết toán bao nhiêu, hoặc đã chi vượt bao nhiêu. */
export function settlementProgress(amount: number, confirmed: number): { remaining: number; over: number } {
  return { remaining: Math.max(amount - confirmed, 0), over: Math.max(confirmed - amount, 0) }
}

/** Kết quả nếu chốt bây giờ, để hộp chốt nói rõ hệ thống sẽ ghi gì. */
export function closurePreview(amount: number, confirmed: number): { kind: AdvanceClosureKind; amount: number; text: string } {
  const difference = amount - confirmed
  if (difference > 0) {
    return {
      kind: 'REFUND',
      amount: difference,
      text: `Người ứng hoàn lại ${formatMoney(difference)}. Hệ thống ghi một điều chỉnh tăng quỹ "Hoàn tạm ứng" vào sổ.`,
    }
  }
  if (difference < 0) {
    return {
      kind: 'TOP_UP',
      amount: -difference,
      text: `Chi vượt ${formatMoney(-difference)}. Hệ thống tạo khoản chi bổ sung đứng tên người ứng, chờ ban chủ nhiệm duyệt rồi Thủ quỹ ghi sổ.`,
    }
  }
  return { kind: 'EXACT', amount: 0, text: 'Số chi khớp số đã ứng, không sinh giao dịch nào.' }
}

/** Câu kết quả sau khi đã chốt. */
export function closureText(closure: Pick<AdvanceClosure, 'kind' | 'amount'>): string {
  if (closure.kind === 'REFUND') return `Đã nhận lại ${formatMoney(closure.amount)} tiền thừa.`
  if (closure.kind === 'TOP_UP') return `Chi vượt ${formatMoney(closure.amount)}, đã tạo khoản chi bổ sung.`
  return 'Số chi khớp số đã ứng.'
}
