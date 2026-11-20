import type { Tone } from '@/shared/ui/tone'
import { formatDateTime } from '@/shared/format/formatDate'
import type { MySessionRegistration, SessionScope, SessionSeats, SessionSummary } from '../model/sessionTypes'

export type SessionTiming = 'CANCELLED' | 'UPCOMING' | 'ONGOING' | 'ENDED' | 'CLOSED'

/** Buổi không có trạng thái riêng trong SRS; nhãn suy từ việc đã hủy, giờ bắt đầu, kết thúc và việc đã chốt điểm danh hay chưa. */
export function sessionTiming(session: Pick<SessionSummary, 'startAt' | 'endAt' | 'attendanceClosed' | 'cancelled'>, now: number): SessionTiming {
  if (session.cancelled) return 'CANCELLED'
  if (session.attendanceClosed) return 'CLOSED'
  if (now < Date.parse(session.startAt)) return 'UPCOMING'
  return now < Date.parse(session.endAt) ? 'ONGOING' : 'ENDED'
}

export const sessionTimingDisplay: Record<SessionTiming, { label: string; tone: Tone }> = {
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
  UPCOMING: { label: 'Sắp diễn ra', tone: 'info' },
  ONGOING: { label: 'Đang diễn ra', tone: 'success' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
  CLOSED: { label: 'Đã chốt điểm danh', tone: 'neutral' },
}

export function sessionScopeLabel(scope: SessionScope): string {
  if (scope.type === 'CLUB') return 'Toàn CLB'
  return scope.departmentName ? `Ban ${scope.departmentName}` : 'Ban không còn tồn tại'
}

/** Ví dụ "Buổi 3/10" cho buổi thuộc chuỗi lặp (FR-ATT-02). */
export function seriesLabel(series: SessionSummary['series']): string | null {
  return series ? `Buổi ${series.index}/${series.count}` : null
}

export function capacityLabel(capacity: number | null): string {
  return capacity === null ? 'Không giới hạn' : `${capacity} chỗ`
}

/** Giá trị ô lọc phạm vi: rỗng là tất cả, `CLUB` là toàn CLB, còn lại là mã ban. */
export function scopeFilterQuery(value: string): { scopeType?: 'CLUB' | 'DEPARTMENT'; departmentId?: string } {
  if (!value) return {}
  if (value === 'CLUB') return { scopeType: 'CLUB' }
  return { scopeType: 'DEPARTMENT', departmentId: value }
}

/** Số chỗ còn trống của buổi có giới hạn (FR-ATT-03). */
export function seatsLeft(seats: SessionSeats): { remaining: number; full: boolean } {
  const remaining = Math.max(seats.capacity - seats.taken, 0)
  return { remaining, full: remaining === 0 }
}

/** Câu nêu hạn hủy của người đã đăng ký; qua hạn thì nói rõ để người đó báo người phụ trách. Buổi đã hủy hoặc đã bắt đầu thì thôi nhắc. */
export function sessionCancelHint(
  mine: Pick<MySessionRegistration, 'allowedActions' | 'cancelDeadline'>,
  session: Pick<SessionSummary, 'startAt' | 'cancelled'>,
  now: number,
): string | null {
  if (session.cancelled || now >= Date.parse(session.startAt)) return null
  return mine.allowedActions.includes('CANCEL')
    ? `Hủy được đến ${formatDateTime(mine.cancelDeadline)}.`
    : `Đã qua hạn hủy (${formatDateTime(mine.cancelDeadline)}). Báo người phụ trách buổi nếu bạn không đến được.`
}

export function sessionCancelRegistrationText(mine: Pick<MySessionRegistration, 'status' | 'cancelDeadline'>): string {
  const deadline = `Hạn hủy: ${formatDateTime(mine.cancelDeadline)}.`
  if (mine.status === 'WAITLISTED') return `Bạn sẽ rời danh sách chờ. Bạn vẫn đăng ký lại được khi buổi còn nhận đăng ký. ${deadline}`
  return `Bạn sẽ mất chỗ và người đầu danh sách chờ được nhận chỗ thay. Bạn vẫn đăng ký lại được khi buổi còn nhận đăng ký. ${deadline}`
}
