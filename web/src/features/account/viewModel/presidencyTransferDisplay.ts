import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { BoardActivityCheck, TransferRequestStatus } from '../model/presidencyTransferTypes'

export const transferStatusDisplay: Record<TransferRequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Đang chờ', tone: 'warning' },
  APPROVED: { label: 'Đã chuyển quyền', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}

/** Một câu nêu ban chủ nhiệm có hoạt động không, kèm lần đăng nhập gần nhất nếu có. */
export function boardCheckText(check: BoardActivityCheck): string {
  const last = check.lastBoardLoginAt ? ` (lần cuối ${formatDateTime(check.lastBoardLoginAt)})` : ''
  return check.boardInactive
    ? `ban chủ nhiệm không đăng nhập quá ${check.inactiveDays} ngày${last}`
    : `ban chủ nhiệm đã đăng nhập trong ${check.inactiveDays} ngày qua${last}`
}
