import { formatDate } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type {
  EventLeadDecision,
  Handover,
  HandoverCompletionPreview,
  HandoverItem,
  HandoverItemCounts,
  HandoverItemKind,
  HandoverItemStatus,
  HandoverProgress,
} from '../model/handoverTypes'

export const HANDOVER_ITEM_KINDS: HandoverItemKind[] = ['FUND', 'EVENT', 'TASK']

export const handoverItemKindLabel: Record<HandoverItemKind, string> = { FUND: 'Quỹ', EVENT: 'Sự kiện', TASK: 'Công việc' }

export const handoverItemStatusDisplay: Record<HandoverItemStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'success' },
  RESOLVED: { label: 'Không cần bàn giao', tone: 'neutral' },
}

export const HANDOVER_STATUS_FILTERS: Array<HandoverItemStatus | ''> = ['', 'PENDING', 'CONFIRMED', 'RESOLVED']

export const statusFilterLabel = (status: HandoverItemStatus | '') => (status === '' ? 'Tất cả' : handoverItemStatusDisplay[status].label)

export function parseItemKind(value: string | null): HandoverItemKind {
  return HANDOVER_ITEM_KINDS.find((kind) => kind === value) ?? 'FUND'
}

export function parseItemStatus(value: string | null): HandoverItemStatus | '' {
  return HANDOVER_STATUS_FILTERS.find((status) => status !== '' && status === value) ?? ''
}

export function statusFilterCount(counts: HandoverItemCounts, status: HandoverItemStatus | ''): number {
  if (status === 'PENDING') return counts.pending
  if (status === 'CONFIRMED') return counts.confirmed
  if (status === 'RESOLVED') return counts.resolved
  return counts.total
}

/** Mục không cần bàn giao nữa không tính vào tiến độ, vì không ai phải xác nhận. */
export function progressText(progress: HandoverProgress): string {
  const total = progress.pending + progress.confirmed
  if (total === 0) return 'Chưa có mục nào cần bàn giao.'
  if (progress.pending === 0) return `Đã xác nhận đủ ${total} mục bàn giao.`
  return `Đã xác nhận ${progress.confirmed}/${total} mục bàn giao, còn ${progress.pending} mục chờ.`
}

export function eventLeadText(decision: EventLeadDecision): string {
  return decision.action === 'KEEP' ? `Giữ Trưởng BTC ${decision.person.fullName}` : `Thay Trưởng BTC bằng ${decision.person.fullName}`
}

export const canConfirmItem = (item: HandoverItem) => item.allowedActions.includes('CONFIRM')

/** Sự kiện cần chọn giữ hoặc thay Trưởng BTC thì phải xác nhận riêng trong hộp thoại. */
export const needsDecisionDialog = (item: HandoverItem) => item.event?.needsLeadDecision === true

/** Mục gửi được trong lượt "Xác nhận các mục đang hiện": chờ xác nhận và không cần quyết định Trưởng BTC. */
export function batchConfirmable(items: HandoverItem[]): HandoverItem[] {
  return items.filter((item) => item.status === 'PENDING' && canConfirmItem(item) && !needsDecisionDialog(item))
}

export function conflictNotice(staleCount: number): string {
  const what = staleCount > 1 ? `${staleCount} mục` : 'Một mục'
  return `${what} vừa thay đổi sau khi bạn mở danh mục nên chưa mục nào được xác nhận. Danh mục đã tải lại, hãy xem số liệu mới rồi xác nhận lại.`
}

export const confirmedToast = (count: number) => (count > 1 ? `Đã xác nhận ${count} mục bàn giao.` : 'Đã xác nhận mục bàn giao.')

/** Các câu tóm tắt trong hộp Hoàn tất bàn giao (FR-TERM-06), theo thứ tự máy chủ áp dụng. */
export function completionSummary(handover: Pick<Handover, 'fromTerm' | 'toTerm'>, preview: HandoverCompletionPreview): string[] {
  const departments = [
    ...(preview.closingDepartments.length > 0 ? [`Đóng ban ${preview.closingDepartments.join(', ')}.`] : []),
    ...(preview.newDepartments.length > 0 ? [`Tạo ban mới ${preview.newDepartments.join(', ')}.`] : []),
    ...preview.renamedDepartments.map((rename) => `Đổi tên ban ${rename.from} thành ${rename.to}.`),
  ]
  return [
    `${handover.fromTerm.name} kết thúc ngày ${formatDate(preview.fromTermEndOn)}; ${handover.toTerm.name} bắt đầu ngày ${formatDate(preview.toTermStartOn)}.`,
    `${preview.endingPositionCount} chức vụ thường trực hiện tại kết thúc; ${preview.grantedPositionCount} chức vụ theo kết quả bầu có hiệu lực từ hôm nay.`,
    ...(departments.length > 0 ? departments : ['Các ban giữ nguyên như hiện tại.']),
    ...preview.leadReplacements.map((change) => `Thay Trưởng BTC ${change.eventName}: ${change.from?.fullName ?? 'chưa có'} thành ${change.to.fullName}.`),
  ]
}

export const completedToast = (handover: Pick<Handover, 'toTerm'>) => `Đã hoàn tất bàn giao. ${handover.toTerm.name} bắt đầu từ hôm nay.`
