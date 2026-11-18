import { formatDate, toVnDateKey } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { AdvanceStatus, AdvanceSummary } from '../model/advanceTypes'

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
