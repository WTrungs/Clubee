import type { Tone } from '@/shared/ui/tone'
import type { SessionScope, SessionSummary } from '../model/sessionTypes'

export type SessionTiming = 'UPCOMING' | 'ONGOING' | 'ENDED' | 'CLOSED'

/** Buổi không có trạng thái riêng trong SRS; nhãn suy từ giờ bắt đầu, kết thúc và việc đã chốt điểm danh hay chưa. */
export function sessionTiming(session: Pick<SessionSummary, 'startAt' | 'endAt' | 'attendanceClosed'>, now: number): SessionTiming {
  if (session.attendanceClosed) return 'CLOSED'
  if (now < Date.parse(session.startAt)) return 'UPCOMING'
  return now < Date.parse(session.endAt) ? 'ONGOING' : 'ENDED'
}

export const sessionTimingDisplay: Record<SessionTiming, { label: string; tone: Tone }> = {
  UPCOMING: { label: 'Sắp diễn ra', tone: 'info' },
  ONGOING: { label: 'Đang diễn ra', tone: 'success' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
  CLOSED: { label: 'Đã chốt điểm danh', tone: 'neutral' },
}

export function sessionScopeLabel(scope: SessionScope): string {
  if (scope.type === 'CLUB') return 'Toàn CLB'
  return scope.departmentName ? `Ban ${scope.departmentName}` : 'Ban không còn tồn tại'
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
