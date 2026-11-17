import type { Tone } from '@/shared/ui/tone'
import type { MemberStatus } from '../model/accountTypes'

export const memberStatusDisplay: Record<MemberStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  PROBATION: { label: 'Thử việc', tone: 'info' },
  ACTIVE: { label: 'Chính thức', tone: 'success' },
  ON_LEAVE: { label: 'Tạm nghỉ', tone: 'neutral' },
  LEFT: { label: 'Đã rời', tone: 'neutral' },
}

/** Tư cách còn hiệu lực mới vào được khu làm việc của CLB; yêu cầu đang chờ duyệt thì chưa. */
export function canEnterClub(status: MemberStatus): boolean {
  return status === 'ACTIVE' || status === 'PROBATION' || status === 'ON_LEAVE'
}
