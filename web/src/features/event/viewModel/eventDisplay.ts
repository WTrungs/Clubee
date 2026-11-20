import { formatDateTime, formatTimeRange } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { EventAction, EventStatus, EventSummary, EventTransitionAction, MyRegistration, RegistrationStatus, ScheduleChange } from '../model/eventTypes'

export const eventStatusDisplay: Record<EventStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Dự thảo', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'info' },
  REGISTRATION_OPEN: { label: 'Mở đăng ký', tone: 'success' },
  ONGOING: { label: 'Đang diễn ra', tone: 'progress' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
  SETTLED: { label: 'Đã quyết toán', tone: 'neutral' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
}

export const registrationStatusDisplay: Record<RegistrationStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: 'Nhận chỗ', tone: 'success' },
  WAITLISTED: { label: 'Danh sách chờ', tone: 'warning' },
  RECONFIRM_PENDING: { label: 'Chờ xác nhận lại', tone: 'info' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
}

/** Câu về hạn tự hủy (FR-EVT-13): còn hủy được thì nêu hạn, qua hạn khi sự kiện vẫn nhận đăng ký và chưa bắt đầu thì báo đã qua; còn lại không nói gì. */
export function cancelHint(mine: Pick<MyRegistration, 'status' | 'allowedActions' | 'cancelDeadline'>, event: Pick<EventSummary, 'status' | 'startAt'>, now: number): string | null {
  // Người đang phải xác nhận lại đã có câu nêu hạn xác nhận, cũng là hạn hủy.
  if (mine.status === 'RECONFIRM_PENDING') return null
  if (mine.allowedActions.includes('CANCEL')) return `Hủy được đến ${formatDateTime(mine.cancelDeadline)}.`
  const open = event.status === 'APPROVED' || event.status === 'REGISTRATION_OPEN'
  const passed = open && Date.parse(mine.cancelDeadline) <= now && now < Date.parse(event.startAt)
  return passed ? `Đã qua hạn hủy (${formatDateTime(mine.cancelDeadline)}).` : null
}

/** Câu nhắc người phải xác nhận lại sau khi sự kiện dời giờ (FR-EVT-14); quá hạn thì không còn gì để làm nên không nhắc. */
export function reconfirmHint(mine: Pick<MyRegistration, 'status' | 'reconfirmDeadline' | 'allowedActions'>): string | null {
  if (mine.status !== 'RECONFIRM_PENDING' || !mine.reconfirmDeadline || !mine.allowedActions.includes('RECONFIRM')) return null
  return `Sự kiện đã dời giờ. Xác nhận tham dự trước ${formatDateTime(mine.reconfirmDeadline)} để giữ chỗ, quá hạn thì đăng ký bị hủy.`
}

/** Câu về lần dời gần nhất, ví dụ "Đã dời từ 18:00 – 21:00, 12/11/2026 sang …". */
export const scheduleChangeText = (change: Pick<ScheduleChange, 'fromStartAt' | 'fromEndAt' | 'toStartAt' | 'toEndAt'>) =>
  `Đã dời từ ${formatTimeRange(change.fromStartAt, change.fromEndAt)} sang ${formatTimeRange(change.toStartAt, change.toEndAt)}.`

const holdsOwnSeat = (event: Pick<EventSummary, 'myRegistration'>) => event.myRegistration?.status === 'CONFIRMED' || event.myRegistration?.status === 'RECONFIRM_PENDING'

/** Số người phải xác nhận lại khi người đang xem dời giờ: người giữ chỗ trừ chính họ, vì người dời giữ nguyên Nhận chỗ. */
export const othersHoldingSeats = (event: Pick<EventSummary, 'confirmedCount' | 'myRegistration'>) => event.confirmedCount - (holdsOwnSeat(event) ? 1 : 0)

/** Người dời biết trước hệ quả với người đăng ký (FR-EVT-14, ST-REG): chỉ sự kiện đang mở đăng ký mới có người phải xác nhận lại. */
export function rescheduleImpact(event: Pick<EventSummary, 'status' | 'confirmedCount' | 'waitlistCount' | 'myRegistration'>): string {
  if (event.status !== 'REGISTRATION_OPEN') return 'Sự kiện chưa mở đăng ký nên chỉ đổi giờ. BTC nhận thông báo kèm lý do.'
  const others = othersHoldingSeats(event)
  const own = holdsOwnSeat(event) ? ' Đăng ký của bạn giữ nguyên Nhận chỗ.' : ''
  const waiting = event.waitlistCount > 0 ? ` ${event.waitlistCount} người ở danh sách chờ giữ nguyên thứ tự.` : ''
  if (others === 0) return `Không ai khác đang giữ chỗ nên không ai phải xác nhận lại.${own}${waiting}`
  return `${others} người đang giữ chỗ sẽ chuyển sang Chờ xác nhận lại. Ai không xác nhận trước hạn sẽ bị hủy đăng ký và chỗ được đôn cho danh sách chờ.${own}${waiting}`
}

/** Câu xác nhận hủy kèm hạn: người giữ chỗ nhường chỗ cho người chờ, người đang chờ chỉ rời danh sách chờ. */
export function cancelRegistrationText(status: RegistrationStatus, cancelDeadline: string): string {
  const deadline = `Hạn hủy: ${formatDateTime(cancelDeadline)}.`
  if (status === 'WAITLISTED') return `Bạn sẽ rời danh sách chờ. Bạn vẫn đăng ký lại được khi sự kiện còn mở. ${deadline}`
  return `Bạn sẽ mất chỗ và người đầu danh sách chờ được nhận chỗ thay. Bạn vẫn đăng ký lại được khi sự kiện còn mở. ${deadline}`
}

/** Đường đi chính của ST-EVT, dùng cho thanh tiến trình. Đã hủy là điểm cuối riêng. */
export const EVENT_LIFECYCLE: EventStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REGISTRATION_OPEN', 'ONGOING', 'ENDED', 'SETTLED', 'CLOSED']

export interface LifecycleStep {
  status: EventStatus
  label: string
  state: 'done' | 'current' | 'upcoming'
}

/** Các bước của vòng đời; sự kiện bị hủy thì dừng ở bước cuối đã đạt (vẫn đánh dấu là đã qua). */
export function lifecycleSteps(status: EventStatus, lastReachedBeforeCancel: EventStatus | null = null): LifecycleStep[] {
  const reference = status === 'CANCELLED' ? (lastReachedBeforeCancel ?? 'DRAFT') : status
  const index = EVENT_LIFECYCLE.indexOf(reference)
  return EVENT_LIFECYCLE.map((step, position) => ({
    status: step,
    label: eventStatusDisplay[step].label,
    state: position < index || (status === 'CANCELLED' && position === index) ? 'done' : position === index ? 'current' : 'upcoming',
  }))
}

export const eventActionLabel: Record<EventTransitionAction, string> = {
  SUBMIT: 'Gửi duyệt',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  OPEN_REGISTRATION: 'Mở đăng ký',
  CANCEL: 'Hủy sự kiện',
  CLOSE: 'Đóng sự kiện',
}

export const eventActionSuccess: Record<EventTransitionAction, string> = {
  SUBMIT: 'Đã gửi đề xuất, chờ ban chủ nhiệm duyệt.',
  APPROVE: 'Đã duyệt sự kiện.',
  REJECT: 'Đã từ chối, đề xuất quay về Dự thảo kèm lý do.',
  OPEN_REGISTRATION: 'Đã mở đăng ký.',
  CANCEL: 'Đã hủy sự kiện, người đăng ký và BTC sẽ được thông báo.',
  CLOSE: 'Đã đóng sự kiện. Hồ sơ sự kiện chuyển sang chỉ đọc.',
}

const TRANSITIONS: EventTransitionAction[] = ['SUBMIT', 'APPROVE', 'OPEN_REGISTRATION', 'CLOSE', 'REJECT', 'CANCEL']

/** Chuyển cần hộp thoại: duyệt (chọn Trưởng BTC), có lý do (từ chối, hủy), hoặc không quay lại được (đóng sự kiện). */
export const needsDialog = (action: EventTransitionAction) => action === 'APPROVE' || action === 'CLOSE' || reasonRequired(action)

/** Nút chuyển trạng thái theo đúng thứ tự hiển thị, chỉ gồm những gì máy chủ cho phép. */
export function eventTransitions(allowed: EventAction[]): EventTransitionAction[] {
  return TRANSITIONS.filter((action) => allowed.includes(action))
}

/** Chuyển nào bắt buộc lý do (SRS 4.2): từ chối đề xuất, hủy sự kiện. */
export const reasonRequired = (action: EventTransitionAction) => action === 'REJECT' || action === 'CANCEL'

/** Thông tin chỗ ngồi để hiển thị: số còn lại, đã đầy hay chưa (BR-EVT-03). */
export function seatInfo(event: Pick<EventSummary, 'capacity' | 'confirmedCount' | 'waitlistCount'>) {
  if (event.capacity === null) return { limited: false as const, remaining: null, full: false, ratio: 0 }
  const remaining = Math.max(event.capacity - event.confirmedCount, 0)
  return { limited: true as const, remaining, full: remaining === 0, ratio: event.capacity > 0 ? event.confirmedCount / event.capacity : 1 }
}

/** Ví dụ "18:00 – 21:00, 12/11/2026"; sự kiện nhiều ngày ghi rõ cả hai ngày (giờ Việt Nam, NFR-USA-03). */
export function formatEventTime(event: Pick<EventSummary, 'startAt' | 'endAt'>): string {
  return formatTimeRange(event.startAt, event.endAt)
}

/** Nhóm lọc trạng thái trên danh sách sự kiện. */
export const EVENT_FILTERS: Array<{ key: string; label: string; statuses: EventStatus[] }> = [
  { key: 'upcoming', label: 'Sắp diễn ra', statuses: ['APPROVED', 'REGISTRATION_OPEN', 'ONGOING'] },
  { key: 'pending', label: 'Chờ duyệt', statuses: ['PENDING_APPROVAL'] },
  { key: 'draft', label: 'Dự thảo', statuses: ['DRAFT'] },
  { key: 'past', label: 'Đã qua', statuses: ['ENDED', 'SETTLED', 'CLOSED'] },
  { key: 'cancelled', label: 'Đã hủy', statuses: ['CANCELLED'] },
]

/** Người đã chọn chỉ còn hợp lệ khi vẫn có trong danh sách ứng viên; nếu không thì phải chọn lại (FR-EVT-03). */
export const selectableLead = (candidates: readonly { id: string }[], chosenId: string): string =>
  candidates.some((candidate) => candidate.id === chosenId) ? chosenId : ''
