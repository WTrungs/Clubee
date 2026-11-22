import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { ApplicationStatus, DepartmentChoice, RecruitmentStatus } from '../model/recruitmentTypes'

export const recruitmentStatusDisplay: Record<RecruitmentStatus, { label: string; tone: Tone }> = {
  UPCOMING: { label: 'Sắp mở', tone: 'info' },
  OPEN: { label: 'Đang nhận đơn', tone: 'success' },
  REVIEWING: { label: 'Đang xét', tone: 'warning' },
  RESULTS: { label: 'Đã có kết quả', tone: 'progress' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

export const recruitmentPeriod = (recruitment: { opensAt: string; closesAt: string }) => `${formatDateTime(recruitment.opensAt)} – ${formatDateTime(recruitment.closesAt)}`

export const applicationStatusDisplay: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  SUBMITTED: { label: 'Đã nộp', tone: 'info' },
  WITHDRAWN: { label: 'Đã rút', tone: 'neutral' },
  ELIMINATED: { label: 'Bị loại', tone: 'danger' },
  ADMITTED: { label: 'Trúng tuyển', tone: 'success' },
  RESERVE: { label: 'Dự bị', tone: 'warning' },
  NOT_ADMITTED: { label: 'Trượt', tone: 'danger' },
  ACCEPTED: { label: 'Đã nhận', tone: 'success' },
  DECLINED: { label: 'Từ chối nhận', tone: 'neutral' },
}

/** "1. Chuyên môn · 2. Truyền thông". */
export const choicesText = (choices: DepartmentChoice[]) => choices.map((choice, index) => `${index + 1}. ${choice.departmentName}`).join(' · ')
