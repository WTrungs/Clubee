import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { ApplicationStatus, DepartmentChoice, FinalDecision, RecruitmentStatus } from '../model/recruitmentTypes'

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

export const finalDecisionLabel: Record<FinalDecision, string> = { ADMITTED: 'Trúng tuyển', RESERVE: 'Dự bị', NOT_ADMITTED: 'Trượt' }

export interface QuotaUsage {
  departmentId: string
  departmentName: string
  quota: number
  admitted: number
  over: boolean
}

/** Bộ đếm chỉ tiêu theo quyết định đang soạn; vượt chỉ tiêu thì máy chủ trả 422 `QUOTA_EXCEEDED`. */
export function quotaUsage(
  quotas: Array<{ departmentId: string; departmentName: string; quota: number }>,
  decisions: Array<{ decision: FinalDecision; departmentId: string | null }>,
): QuotaUsage[] {
  return quotas.map((quota) => {
    const admitted = decisions.filter((row) => row.decision === 'ADMITTED' && row.departmentId === quota.departmentId).length
    return { ...quota, admitted, over: admitted > quota.quota }
  })
}

/** FR-REC-04: câu tóm tắt cho người xét đơn, ví dụ "Từng nộp 1 đơn, từng bị loại, từng là thành viên CLB này." */
export function priorHistoryText(flags: { applications: number; eliminated: boolean; formerMember: boolean }): string {
  const parts = [
    ...(flags.applications > 0 ? [`từng nộp ${flags.applications} đơn`] : []),
    ...(flags.eliminated ? ['từng bị loại'] : []),
    ...(flags.formerMember ? ['từng là thành viên'] : []),
  ]
  const text = parts.join(', ')
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)} ở CLB này.` : ''
}

/** Cách tư cách cũ kết thúc. */
export const priorExitText: Record<'REJECTED' | 'REMOVED' | 'RESIGNED', string> = {
  REJECTED: 'Yêu cầu gia nhập bị từ chối',
  REMOVED: 'Bị đưa ra khỏi CLB',
  RESIGNED: 'Tự rời CLB',
}
