import type { PersonRef } from '@/api/commonTypes'

/** Suy ra từ giờ mở, giờ đóng và thao tác: Sắp mở, Đang nhận đơn, Đang xét, Đã có kết quả, Đã đóng. */
export type RecruitmentStatus = 'UPCOMING' | 'OPEN' | 'REVIEWING' | 'RESULTS' | 'CLOSED'

/** `EDIT`: ban chủ nhiệm sửa đợt chưa chốt kết quả; vòng và câu hỏi khóa từ giờ mở (`structureLocked`). */
export type RecruitmentAction = 'EDIT'

export interface RecruitmentQuota {
  departmentId: string
  departmentName: string
  quota: number
}

export interface RecruitmentRound {
  id: string
  name: string
}

export interface RecruitmentQuestion {
  id: string
  text: string
  required: boolean
}

export interface RecruitmentSummary {
  id: string
  name: string
  opensAt: string
  closesAt: string
  status: RecruitmentStatus
  quotaTotal: number
  roundCount: number
  applicationCount: number
}

export interface RecruitmentDetail extends RecruitmentSummary {
  description: string
  quotas: RecruitmentQuota[]
  rounds: RecruitmentRound[]
  questions: RecruitmentQuestion[]
  judges: PersonRef[]
  createdBy: PersonRef
  createdAt: string
  /** Đã tới giờ mở: vòng, câu hỏi và giờ mở không sửa được nữa. */
  structureLocked: boolean
  allowedActions: RecruitmentAction[]
  version: number
}

/** `id` null là vòng hoặc câu hỏi mới thêm. */
export interface RecruitmentRequest {
  name: string
  description: string
  opensAt: string
  closesAt: string
  quotas: Array<{ departmentId: string; quota: number }>
  rounds: Array<{ id: string | null; name: string }>
  questions: Array<{ id: string | null; text: string; required: boolean }>
  judgeIds: string[]
}

export type UpdateRecruitmentRequest = Partial<RecruitmentRequest> & { version: number }

export interface JudgeCandidate {
  id: string
  fullName: string
  departmentName: string | null
}
