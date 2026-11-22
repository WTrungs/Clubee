import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { RecruitmentStatus } from '../model/recruitmentTypes'

export const recruitmentStatusDisplay: Record<RecruitmentStatus, { label: string; tone: Tone }> = {
  UPCOMING: { label: 'Sắp mở', tone: 'info' },
  OPEN: { label: 'Đang nhận đơn', tone: 'success' },
  REVIEWING: { label: 'Đang xét', tone: 'warning' },
  RESULTS: { label: 'Đã có kết quả', tone: 'progress' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

export const recruitmentPeriod = (recruitment: { opensAt: string; closesAt: string }) => `${formatDateTime(recruitment.opensAt)} – ${formatDateTime(recruitment.closesAt)}`
