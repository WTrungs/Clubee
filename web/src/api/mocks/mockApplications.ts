import type { FieldError } from '@/api/apiError'
import type {
  ApplicationAnswer,
  ApplicationDetail,
  ApplicationSummary,
  DepartmentChoice,
  MyApplication,
  OpenRecruitment,
  PublicRecruitment,
  SubmitApplicationRequest,
} from '@/features/recruitment/model/recruitmentTypes'
import { STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'
import { APPLICATION_ANSWER_MAX, APPLICATION_CHOICES_MAX } from '@/shared/lib/recruitmentRules'
import { db, type DbApplication, type DbRecruitment } from './db'
import { personRef } from './mockMembers'
import { recruitmentStatusOf } from './mockRecruitments'

const departmentName = (id: string) => db.departments.find((department) => department.id === id)?.name ?? 'Ban'
const clubOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)
const choicesOf = (application: DbApplication): DepartmentChoice[] => application.choices.map((id) => ({ departmentId: id, departmentName: departmentName(id) }))

/** Tư cách còn hiệu lực (kể cả Chờ duyệt) thì không nộp đơn được; Đã rời, Bị từ chối thì được. */
const CURRENT_STATUSES = ['PENDING', 'PROBATION', 'ACTIVE', 'ON_LEAVE']
export const hasCurrentMembership = (userId: string, clubId: string) =>
  db.memberships.some((membership) => membership.userId === userId && membership.clubId === clubId && CURRENT_STATUSES.includes(membership.status))

export const applicationOf = (recruitmentId: string, userId: string) => db.applications.find((application) => application.recruitmentId === recruitmentId && application.userId === userId)

function answersOf(application: DbApplication, recruitment: DbRecruitment): ApplicationAnswer[] {
  return recruitment.questions.map((question) => ({
    questionId: question.id,
    question: question.text,
    text: application.answers.find((answer) => answer.questionId === question.id)?.text ?? '',
  }))
}

const departmentsOf = (recruitment: DbRecruitment) => recruitment.quotas.map((quota) => ({ id: quota.departmentId, name: departmentName(quota.departmentId), quota: quota.quota }))

export function toMyApplication(application: DbApplication): MyApplication {
  const recruitment = db.recruitments.find((candidate) => candidate.id === application.recruitmentId) as DbRecruitment
  const status = recruitmentStatusOf(recruitment)
  return {
    id: application.id,
    recruitment: { id: recruitment.id, name: recruitment.name, clubId: recruitment.clubId, clubName: clubOf(recruitment.clubId)?.name ?? '', closesAt: recruitment.closesAt, status },
    status: application.status,
    choices: choicesOf(application),
    answers: answersOf(application, recruitment),
    studentId: application.studentId,
    submittedAt: application.submittedAt,
    withdrawnAt: application.withdrawnAt,
    allowedActions: application.status === 'SUBMITTED' && status === 'OPEN' ? ['WITHDRAW'] : [],
    version: application.version,
  }
}

export function toOpenRecruitment(recruitment: DbRecruitment): OpenRecruitment {
  return { id: recruitment.id, club: { id: recruitment.clubId, name: clubOf(recruitment.clubId)?.name ?? '' }, name: recruitment.name, closesAt: recruitment.closesAt, departments: departmentsOf(recruitment) }
}

export const ALREADY_MEMBER_MESSAGE = 'Bạn đang là thành viên hoặc đang chờ duyệt vào CLB này nên không nộp đơn được.'

/** Lý do chưa nộp được; null là nộp được. */
export function applyBlocker(recruitment: DbRecruitment, userId: string): string | null {
  if (applicationOf(recruitment.id, userId)) return null
  if (recruitmentStatusOf(recruitment) !== 'OPEN') return 'Đợt tuyển không ở thời gian nhận đơn.'
  if (hasCurrentMembership(userId, recruitment.clubId)) return ALREADY_MEMBER_MESSAGE
  return null
}

/** SRS 3.5: người ngoài chỉ thấy đợt đang nhận đơn; đợt khác chỉ người có đơn và thành viên CLB thấy. */
export const canSeePublicRecruitment = (recruitment: DbRecruitment, userId: string, isMember: boolean) =>
  recruitmentStatusOf(recruitment) === 'OPEN' || applicationOf(recruitment.id, userId) !== undefined || isMember

export function toPublicRecruitment(recruitment: DbRecruitment, userId: string): PublicRecruitment {
  const mine = applicationOf(recruitment.id, userId)
  return {
    id: recruitment.id,
    club: { id: recruitment.clubId, name: clubOf(recruitment.clubId)?.name ?? '' },
    name: recruitment.name,
    description: recruitment.description,
    opensAt: recruitment.opensAt,
    closesAt: recruitment.closesAt,
    status: recruitmentStatusOf(recruitment),
    departments: departmentsOf(recruitment),
    questions: recruitment.questions,
    collectsStudentId: clubOf(recruitment.clubId)?.collectsStudentId ?? false,
    myApplication: mine ? toMyApplication(mine) : null,
    applyBlocker: applyBlocker(recruitment, userId),
  }
}

export function toApplicationSummary(application: DbApplication): ApplicationSummary {
  return { id: application.id, applicant: personRef(application.userId), status: application.status, choices: choicesOf(application), submittedAt: application.submittedAt }
}

export function toApplicationDetail(application: DbApplication): ApplicationDetail {
  const recruitment = db.recruitments.find((candidate) => candidate.id === application.recruitmentId) as DbRecruitment
  return { ...toApplicationSummary(application), answers: answersOf(application, recruitment), studentId: application.studentId, withdrawnAt: application.withdrawnAt, version: application.version }
}

/** Kiểm đơn (400 theo ô): 1–3 nguyện vọng khác nhau trong các ban có chỉ tiêu, câu bắt buộc có trả lời, MSSV khi CLB thu thập. */
export function parseApplication(recruitment: DbRecruitment, body: Partial<SubmitApplicationRequest>): { value: Pick<DbApplication, 'choices' | 'answers' | 'studentId'>; errors: FieldError[] } {
  const errors: FieldError[] = []
  const allowed = new Set(recruitment.quotas.map((quota) => quota.departmentId))
  const choices = Array.isArray(body.choices) ? body.choices.filter((id): id is string => typeof id === 'string') : []
  if (choices.length === 0 || choices.length > APPLICATION_CHOICES_MAX) errors.push({ field: 'choices', message: `Chọn từ 1 đến ${APPLICATION_CHOICES_MAX} nguyện vọng.` })
  else if (new Set(choices).size !== choices.length) errors.push({ field: 'choices', message: 'Mỗi ban chỉ chọn một lần.' })
  else if (choices.some((id) => !allowed.has(id))) errors.push({ field: 'choices', message: 'Chỉ chọn các ban có chỉ tiêu trong đợt này.' })

  const sent = Array.isArray(body.answers) ? body.answers : []
  const answers = recruitment.questions.map((question, index) => {
    const raw = sent.find((answer) => answer?.questionId === question.id)?.text
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (question.required && text.length === 0) errors.push({ field: `answers[${index}].text`, message: 'Câu này bắt buộc trả lời.' })
    else if (text.length > APPLICATION_ANSWER_MAX) errors.push({ field: `answers[${index}].text`, message: `Tối đa ${APPLICATION_ANSWER_MAX} ký tự.` })
    return { questionId: question.id, text }
  })

  const collects = clubOf(recruitment.clubId)?.collectsStudentId ?? false
  const studentId = collects && typeof body.studentId === 'string' ? body.studentId.trim() : ''
  if (collects && !STUDENT_ID_PATTERN.test(studentId)) errors.push({ field: 'studentId', message: STUDENT_ID_MESSAGE })
  return { value: { choices, answers, studentId: collects ? studentId : null }, errors }
}
