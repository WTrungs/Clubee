import type { Tone } from '@/shared/ui/tone'
import type { SessionScope, SessionSummary } from '../model/sessionTypes'

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
