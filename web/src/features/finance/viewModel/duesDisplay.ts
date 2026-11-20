import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import type { Tone } from '@/shared/ui/tone'
import type { DuesCampaignStatus, DuesCampaignSummary, DuesItem, DuesItemStatus } from '../model/duesTypes'

export const duesCampaignStatusDisplay: Record<DuesCampaignStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Đang mở', tone: 'progress' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

export const duesItemStatusDisplay: Record<DuesItemStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Chưa nộp', tone: 'warning' },
  PARTIAL: { label: 'Nộp một phần', tone: 'info' },
  PAID: { label: 'Đã nộp', tone: 'success' },
  EXEMPT: { label: 'Miễn', tone: 'neutral' },
}

/** Bộ lọc danh sách người trong đợt, theo thứ tự hay dùng. */
export const DUES_ITEM_FILTERS: Array<{ key: DuesItemStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'UNPAID', label: 'Chưa nộp' },
  { key: 'PARTIAL', label: 'Nộp một phần' },
  { key: 'PAID', label: 'Đã nộp' },
  { key: 'EXEMPT', label: 'Miễn' },
]

/** Tiến độ thu của một đợt, dạng đọc được trên thẻ. */
export function duesProgressText(campaign: Pick<DuesCampaignSummary, 'settledCount' | 'memberCount' | 'collectedAmount' | 'expectedAmount'>): string {
  return `${campaign.settledCount}/${campaign.memberCount} người xong · ${formatMoney(campaign.collectedAmount)} / ${formatMoney(campaign.expectedAmount)}`
}

/** Mức phải đóng của một người, kèm ghi chú miễn giảm. */
export function duesDueText(item: Pick<DuesItem, 'amountDue' | 'exemption'>, fullAmount: number): string {
  if (item.exemption?.kind === 'EXEMPT') return 'Miễn đóng'
  if (item.exemption?.kind === 'REDUCED') return `${formatMoney(item.amountDue)} (giảm từ ${formatMoney(fullAmount)})`
  return formatMoney(item.amountDue)
}

export const duesDeadlineText = (dueOn: string) => `Hạn nộp ${formatDate(dueOn)}`
