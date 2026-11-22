import type { FieldError } from '@/api/apiError'
import type { JudgeCandidate, RecruitmentAction, RecruitmentDetail, RecruitmentRequest, RecruitmentStatus, RecruitmentSummary } from '@/features/recruitment/model/recruitmentTypes'
import {
  RECRUITMENT_DESCRIPTION_MAX,
  RECRUITMENT_JUDGES_MAX,
  RECRUITMENT_NAME_MAX,
  RECRUITMENT_NAME_MIN,
  RECRUITMENT_QUESTION_MAX,
  RECRUITMENT_QUESTION_MIN,
  RECRUITMENT_QUESTIONS_MAX,
  RECRUITMENT_QUOTA_MAX,
  RECRUITMENT_QUOTA_MIN,
  RECRUITMENT_ROUND_NAME_MAX,
  RECRUITMENT_ROUND_NAME_MIN,
  RECRUITMENT_ROUNDS_MAX,
  RECRUITMENT_ROUNDS_MIN,
} from '@/shared/lib/recruitmentRules'
import { matchesKeyword } from '@/shared/lib/searchText'
import { db, type DbRecruitment } from './db'
import { roundStatsOf } from './mockApplications'
import { can } from './mockAccess'
import { newId } from './mockHttp'
import { membershipOf, personRef } from './mockMembers'
import { isBoardMember } from './mockPermissions'
import { activeDepartmentsOf } from './mockTerms'

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function recruitmentStatusOf(recruitment: DbRecruitment, now = Date.now()): RecruitmentStatus {
  if (recruitment.closedAt) return 'CLOSED'
  if (recruitment.finalizedAt) return 'RESULTS'
  if (now < Date.parse(recruitment.opensAt)) return 'UPCOMING'
  return now < Date.parse(recruitment.closesAt) ? 'OPEN' : 'REVIEWING'
}

/** Vòng, câu hỏi và giờ mở khóa từ giờ mở (FR-REC-01). */
export const structureLocked = (recruitment: DbRecruitment, now = Date.now()) => now >= Date.parse(recruitment.opensAt)

/** Ban chủ nhiệm quản lý đợt tuyển theo quyền Quản lý thành viên của bảng phân quyền. */
export const canManageRecruitment = (userId: string, clubId: string) => can(userId, clubId, 'MANAGE_MEMBERS')

export function toRecruitmentSummary(recruitment: DbRecruitment): RecruitmentSummary {
  return {
    id: recruitment.id,
    name: recruitment.name,
    opensAt: recruitment.opensAt,
    closesAt: recruitment.closesAt,
    status: recruitmentStatusOf(recruitment),
    quotaTotal: recruitment.quotas.reduce((total, quota) => total + quota.quota, 0),
    roundCount: recruitment.rounds.length,
    applicationCount: db.applications.filter((application) => application.recruitmentId === recruitment.id && application.status !== 'WITHDRAWN').length,
  }
}

function recruitmentActions(recruitment: DbRecruitment, viewerId: string): RecruitmentAction[] {
  const status = recruitmentStatusOf(recruitment)
  return [
    ...(canManageRecruitment(viewerId, recruitment.clubId) && status !== 'RESULTS' && status !== 'CLOSED' ? (['EDIT'] as const) : []),
    ...(isBoardMember(viewerId, recruitment.clubId) ? (['VIEW_APPLICATIONS'] as const) : []),
    ...(isBoardMember(viewerId, recruitment.clubId) && status !== 'RESULTS' && status !== 'CLOSED' ? (['REVIEW_ROUNDS'] as const) : []),
    ...(isBoardMember(viewerId, recruitment.clubId) && status === 'REVIEWING' ? (['FINALIZE'] as const) : []),
  ]
}

export function toRecruitmentDetail(recruitment: DbRecruitment, viewerId: string): RecruitmentDetail {
  return {
    ...toRecruitmentSummary(recruitment),
    description: recruitment.description,
    quotas: recruitment.quotas.map((quota) => ({ ...quota, departmentName: db.departments.find((department) => department.id === quota.departmentId)?.name ?? 'Ban' })),
    rounds: recruitment.rounds,
    questions: recruitment.questions,
    judges: recruitment.judgeIds.map(personRef),
    createdBy: personRef(recruitment.createdBy),
    createdAt: recruitment.createdAt,
    structureLocked: structureLocked(recruitment),
    roundStats: isBoardMember(viewerId, recruitment.clubId) ? roundStatsOf(recruitment) : [],
    finalizedAt: recruitment.finalizedAt,
    responseDays: recruitment.responseDays,
    allowedActions: recruitmentActions(recruitment, viewerId),
    version: recruitment.version,
  }
}

const isJudgeCandidate = (clubId: string, userId: string) => membershipOf(userId, clubId)?.status === 'ACTIVE'

/** Giám khảo là thành viên Chính thức (SRS 3.5). */
export function judgeCandidates(clubId: string, keyword: string | null): JudgeCandidate[] {
  return db.memberships
    .filter((membership) => membership.clubId === clubId && membership.status === 'ACTIVE')
    .map((membership) => ({
      id: membership.userId,
      fullName: personRef(membership.userId).fullName,
      departmentName: db.departments.find((department) => department.id === membership.departmentId)?.name ?? null,
    }))
    .filter((candidate) => matchesKeyword(`${candidate.fullName} ${candidate.departmentName ?? ''}`, keyword))
    .toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}

type Parsed = Omit<RecruitmentRequest, 'rounds' | 'questions'> & { rounds: DbRecruitment['rounds']; questions: DbRecruitment['questions'] }

/** Kiểm từng ô (400) và dựng lại dữ liệu; `existing` giữ mã vòng, câu hỏi cũ khi sửa. */
export function parseRecruitment(clubId: string, body: Partial<RecruitmentRequest>, existing?: DbRecruitment): { value: Parsed; errors: FieldError[] } {
  const errors: FieldError[] = []
  const name = text(body.name)
  const description = text(body.description)
  if (name.length < RECRUITMENT_NAME_MIN || name.length > RECRUITMENT_NAME_MAX) errors.push({ field: 'name', message: `Tên đợt tuyển cần từ ${RECRUITMENT_NAME_MIN} đến ${RECRUITMENT_NAME_MAX} ký tự.` })
  if (description.length > RECRUITMENT_DESCRIPTION_MAX) errors.push({ field: 'description', message: `Mô tả tối đa ${RECRUITMENT_DESCRIPTION_MAX} ký tự.` })

  const opensAt = body.opensAt
  const closesAt = body.closesAt
  if (!isTimestamp(opensAt)) errors.push({ field: 'opensAt', message: 'Giờ mở không hợp lệ.' })
  if (!isTimestamp(closesAt)) errors.push({ field: 'closesAt', message: 'Giờ đóng không hợp lệ.' })
  else if (isTimestamp(opensAt) && Date.parse(closesAt) <= Date.parse(opensAt)) errors.push({ field: 'closesAt', message: 'Giờ đóng phải sau giờ mở.' })
  else if (existing && structureLocked(existing) && Date.parse(closesAt) < Date.parse(existing.closesAt)) errors.push({ field: 'closesAt', message: 'Sau giờ mở chỉ lùi được giờ đóng.' })
  else if (Date.parse(closesAt) !== Date.parse(existing?.closesAt ?? '') && Date.parse(closesAt) <= Date.now()) errors.push({ field: 'closesAt', message: 'Giờ đóng phải sau thời điểm hiện tại.' })

  const active = new Set(activeDepartmentsOf(clubId).map((department) => department.id))
  const quotasIn = Array.isArray(body.quotas) ? body.quotas : []
  if (quotasIn.length === 0) errors.push({ field: 'quotas', message: 'Khai báo chỉ tiêu cho ít nhất một ban.' })
  const seenDepartments = new Set<string>()
  const quotas = quotasIn.flatMap((row, index) => {
    const departmentId = typeof row?.departmentId === 'string' ? row.departmentId : ''
    const quota = row?.quota
    // Dòng đã lưu trước đó giữ được dù ban vừa đóng, để đợt tuyển không bị kẹt khi sửa phần khác.
    if (!active.has(departmentId) && !existing?.quotas.some((saved) => saved.departmentId === departmentId)) {
      errors.push({ field: `quotas[${index}].departmentId`, message: 'Chọn một ban đang hoạt động của CLB.' })
      return []
    }
    if (seenDepartments.has(departmentId)) {
      errors.push({ field: `quotas[${index}].departmentId`, message: 'Ban này đã có chỉ tiêu ở dòng khác.' })
      return []
    }
    seenDepartments.add(departmentId)
    if (typeof quota !== 'number' || !Number.isInteger(quota) || quota < RECRUITMENT_QUOTA_MIN || quota > RECRUITMENT_QUOTA_MAX) {
      errors.push({ field: `quotas[${index}].quota`, message: `Chỉ tiêu là số nguyên từ ${RECRUITMENT_QUOTA_MIN} đến ${RECRUITMENT_QUOTA_MAX}.` })
      return []
    }
    return [{ departmentId, quota }]
  })

  const roundsIn = Array.isArray(body.rounds) ? body.rounds : []
  if (roundsIn.length < RECRUITMENT_ROUNDS_MIN || roundsIn.length > RECRUITMENT_ROUNDS_MAX) {
    errors.push({ field: 'rounds', message: `Đợt tuyển có từ ${RECRUITMENT_ROUNDS_MIN} đến ${RECRUITMENT_ROUNDS_MAX} vòng.` })
  }
  const roundNames = new Set<string>()
  const rounds = roundsIn.slice(0, RECRUITMENT_ROUNDS_MAX).flatMap((row, index) => {
    const roundName = text(row?.name)
    if (roundName.length < RECRUITMENT_ROUND_NAME_MIN || roundName.length > RECRUITMENT_ROUND_NAME_MAX) {
      errors.push({ field: `rounds[${index}].name`, message: `Tên vòng cần từ ${RECRUITMENT_ROUND_NAME_MIN} đến ${RECRUITMENT_ROUND_NAME_MAX} ký tự.` })
      return []
    }
    if (roundNames.has(roundName.toLowerCase())) {
      errors.push({ field: `rounds[${index}].name`, message: 'Tên vòng bị trùng.' })
      return []
    }
    roundNames.add(roundName.toLowerCase())
    const kept = existing?.rounds.find((round) => round.id === row?.id)
    return [{ id: kept?.id ?? newId('rr'), name: roundName }]
  })

  const questionsIn = Array.isArray(body.questions) ? body.questions : []
  if (questionsIn.length > RECRUITMENT_QUESTIONS_MAX) errors.push({ field: 'questions', message: `Tối đa ${RECRUITMENT_QUESTIONS_MAX} câu hỏi.` })
  const questions = questionsIn.slice(0, RECRUITMENT_QUESTIONS_MAX).flatMap((row, index) => {
    const question = text(row?.text)
    if (question.length < RECRUITMENT_QUESTION_MIN || question.length > RECRUITMENT_QUESTION_MAX) {
      errors.push({ field: `questions[${index}].text`, message: `Câu hỏi cần từ ${RECRUITMENT_QUESTION_MIN} đến ${RECRUITMENT_QUESTION_MAX} ký tự.` })
      return []
    }
    const kept = existing?.questions.find((candidate) => candidate.id === row?.id)
    return [{ id: kept?.id ?? newId('rq'), text: question, required: row?.required === true }]
  })

  const judgeIds = Array.isArray(body.judgeIds) ? [...new Set(body.judgeIds.filter((id): id is string => typeof id === 'string'))] : []
  if (judgeIds.length > RECRUITMENT_JUDGES_MAX) errors.push({ field: 'judgeIds', message: `Tối đa ${RECRUITMENT_JUDGES_MAX} giám khảo.` })
  // Chỉ kiểm người mới thêm; giám khảo cũ vừa tạm nghỉ hay rời CLB vẫn giữ được, bỏ đi lúc nào cũng được.
  else if (judgeIds.some((id) => !existing?.judgeIds.includes(id) && !isJudgeCandidate(clubId, id))) {
    errors.push({ field: 'judgeIds', message: 'Giám khảo phải là thành viên Chính thức của CLB.' })
  }

  return {
    value: { name, description, opensAt: String(opensAt), closesAt: String(closesAt), quotas, rounds, questions, judgeIds },
    errors,
  }
}

/** Sau giờ mở chỉ khóa vòng, câu hỏi và giờ mở; so theo nội dung để gửi lại đúng giá trị cũ vẫn được. */
export function changesStructure(recruitment: DbRecruitment, body: Partial<RecruitmentRequest>): boolean {
  if (body.opensAt !== undefined && (!isTimestamp(body.opensAt) || Date.parse(body.opensAt) !== Date.parse(recruitment.opensAt))) return true
  if (body.rounds !== undefined) {
    const sent = Array.isArray(body.rounds) ? body.rounds : []
    if (sent.length !== recruitment.rounds.length || sent.some((round, index) => round?.id !== recruitment.rounds[index]?.id || text(round?.name) !== recruitment.rounds[index]?.name)) return true
  }
  if (body.questions !== undefined) {
    const sent = Array.isArray(body.questions) ? body.questions : []
    if (
      sent.length !== recruitment.questions.length ||
      sent.some((question, index) => {
        const current = recruitment.questions[index]
        return question?.id !== current?.id || text(question?.text) !== current?.text || (question?.required === true) !== current?.required
      })
    )
      return true
  }
  return false
}
