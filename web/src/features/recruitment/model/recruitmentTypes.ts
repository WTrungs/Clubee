import type { PersonRef } from '@/api/commonTypes'

/** Suy ra từ giờ mở, giờ đóng và thao tác: Sắp mở, Đang nhận đơn, Đang xét, Đã có kết quả, Đã đóng. */
export type RecruitmentStatus = 'UPCOMING' | 'OPEN' | 'REVIEWING' | 'RESULTS' | 'CLOSED'

/** `EDIT`: sửa đợt chưa chốt; `VIEW_APPLICATIONS`: ban chủ nhiệm xem đơn (SRS 3.5); `REVIEW_ROUNDS`: ban chủ nhiệm xét vòng khi chưa chốt. */
export type RecruitmentAction = 'EDIT' | 'VIEW_APPLICATIONS' | 'REVIEW_ROUNDS'

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
  /** Số đơn theo vòng; chỉ ban chủ nhiệm (rỗng với người khác). */
  roundStats: RoundStat[]
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

/** ST-APP: Đã nộp → qua từng vòng (Bị loại) → Trúng tuyển / Dự bị / Trượt → Đã nhận / Từ chối nhận; Đã nộp → Đã rút. */
export type ApplicationStatus = 'SUBMITTED' | 'WITHDRAWN' | 'ELIMINATED' | 'ADMITTED' | 'RESERVE' | 'NOT_ADMITTED' | 'ACCEPTED' | 'DECLINED'

/** `WITHDRAW`: ứng viên rút đơn Đã nộp khi đợt còn nhận đơn. */
export type ApplicationAction = 'WITHDRAW'

export interface DepartmentChoice {
  departmentId: string
  departmentName: string
}

export interface ApplicationAnswer {
  questionId: string
  question: string
  text: string
}

/** Đợt đang nhận đơn ở mọi CLB (FR-REC-02); cần đăng nhập. */
export interface OpenRecruitment {
  id: string
  club: { id: string; name: string }
  name: string
  closesAt: string
  departments: Array<{ id: string; name: string; quota: number }>
}

/** Đơn của chính người xem. */
export interface MyApplication {
  id: string
  recruitment: { id: string; name: string; clubId: string; clubName: string; closesAt: string; status: RecruitmentStatus }
  status: ApplicationStatus
  choices: DepartmentChoice[]
  answers: ApplicationAnswer[]
  studentId: string | null
  submittedAt: string
  withdrawnAt: string | null
  allowedActions: ApplicationAction[]
  version: number
}

/** Thông tin công khai của đợt cho ứng viên, kèm đơn của chính mình. */
export interface PublicRecruitment {
  id: string
  club: { id: string; name: string }
  name: string
  description: string
  opensAt: string
  closesAt: string
  status: RecruitmentStatus
  departments: Array<{ id: string; name: string; quota: number }>
  questions: RecruitmentQuestion[]
  collectsStudentId: boolean
  myApplication: MyApplication | null
  /** Vì sao chưa nộp được; null là nộp được (hoặc đã có đơn). */
  applyBlocker: string | null
}

/** `choices`: 1–3 ban khác nhau theo thứ tự nguyện vọng; `answers` theo thứ tự câu hỏi. */
export interface SubmitApplicationRequest {
  choices: string[]
  answers: Array<{ questionId: string; text: string }>
  studentId?: string | null
}

export type RoundResultValue = 'PASS' | 'FAIL'

/** FR-REC-03: kết quả một vòng; Đạt kèm điểm 0–100, Loại kèm nhận xét bắt buộc. */
export interface RoundResult {
  roundId: string
  roundName: string
  result: RoundResultValue
  score: number | null
  note: string
  by: PersonRef
  at: string
  /** Sửa được khi vòng sau chưa có kết quả và đợt chưa chốt. */
  editable: boolean
}

/** Đơn phía ban chủ nhiệm (SRS 3.5: chỉ ban chủ nhiệm xem đơn). */
export interface ApplicationSummary {
  id: string
  applicant: PersonRef
  status: ApplicationStatus
  choices: DepartmentChoice[]
  submittedAt: string
  /** Vòng đầu tiên chưa có kết quả khi các vòng trước đều Đạt; null khi đã bị loại, đã rút hoặc đã qua hết các vòng. */
  currentRoundId: string | null
  roundResults: RoundResult[]
  /** Tổng điểm các vòng Đạt. */
  totalScore: number
  version: number
}

/** `state`: Chờ xét (đang ở vòng này), Đạt, Loại ở vòng này. */
export type RoundState = 'PENDING' | 'PASSED' | 'FAILED'

/** Số đơn theo vòng để hiện ở chip lọc. */
export interface RoundStat {
  roundId: string
  pending: number
  passed: number
  failed: number
}

export interface RoundResultRequest {
  result: RoundResultValue
  score: number | null
  note: string
  version: number
}

export interface ApplicationDetail extends ApplicationSummary {
  answers: ApplicationAnswer[]
  studentId: string | null
  withdrawnAt: string | null
}

export interface ApplicationQuery {
  status?: ApplicationStatus
  departmentId?: string
  /** Lọc theo vòng, cùng `roundState`. */
  roundId?: string
  roundState?: RoundState
  q?: string
  page?: number
}
