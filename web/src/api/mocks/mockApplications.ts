import type { FieldError } from '@/api/apiError'
import type {
  ApplicationAnswer,
  ApplicationDetail,
  ApplicationSummary,
  DepartmentChoice,
  MyApplication,
  OpenRecruitment,
  PublicRecruitment,
  RoundResult,
  RoundStat,
  RoundState,
  SubmitApplicationRequest,
} from '@/features/recruitment/model/recruitmentTypes'
import { STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'
import { APPLICATION_ANSWER_MAX, APPLICATION_CHOICES_MAX } from '@/shared/lib/recruitmentRules'
import { db, type DbApplication, type DbRecruitment } from './db'
import type { DbRoundResult } from './seed/recruitmentSeed'
import { personRef } from './mockMembers'
import { recruitmentStatusOf } from './mockRecruitments'
import { nowIso } from './mockTime'

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

const recruitmentOf = (application: DbApplication) => db.recruitments.find((candidate) => candidate.id === application.recruitmentId) as DbRecruitment
const resultAt = (application: DbApplication, roundId: string) => application.roundResults.find((result) => result.roundId === roundId)

/** FR-REC-03: vòng đầu tiên chưa có kết quả khi các vòng trước đều Đạt; null khi đã rút, bị loại hoặc đã qua hết các vòng. */
export function currentRoundOf(application: DbApplication, recruitment: DbRecruitment = recruitmentOf(application)): string | null {
  if (application.status !== 'SUBMITTED') return null
  for (const round of recruitment.rounds) {
    const result = resultAt(application, round.id)
    if (!result) return round.id
    if (result.result === 'FAIL') return null
  }
  return null
}

/** Đã Đạt mọi vòng (đủ điều kiện xếp hạng khi chốt kết quả). */
export const passedAllRounds = (application: DbApplication, recruitment: DbRecruitment = recruitmentOf(application)) =>
  recruitment.rounds.every((round) => resultAt(application, round.id)?.result === 'PASS')

export const totalScoreOf = (application: DbApplication) => application.roundResults.reduce((total, result) => total + (result.result === 'PASS' ? (result.score ?? 0) : 0), 0)

/** Kết quả một vòng sửa được khi đợt chưa chốt, đơn chưa rút và vòng sau chưa có kết quả. */
export function roundEditable(application: DbApplication, recruitment: DbRecruitment, roundIndex: number): boolean {
  if (recruitment.finalizedAt || recruitment.closedAt || application.status === 'WITHDRAWN') return false
  const next = recruitment.rounds[roundIndex + 1]
  return next === undefined || resultAt(application, next.id) === undefined
}

function roundResultsOf(application: DbApplication, recruitment: DbRecruitment): RoundResult[] {
  return recruitment.rounds.flatMap((round, index) => {
    const result = resultAt(application, round.id)
    return result ? [{ roundId: round.id, roundName: round.name, result: result.result, score: result.score, note: result.note, by: personRef(result.by), at: result.at, editable: roundEditable(application, recruitment, index) }] : []
  })
}

export function toApplicationSummary(application: DbApplication): ApplicationSummary {
  const recruitment = recruitmentOf(application)
  return {
    id: application.id,
    applicant: personRef(application.userId),
    status: application.status,
    choices: choicesOf(application),
    submittedAt: application.submittedAt,
    currentRoundId: currentRoundOf(application, recruitment),
    roundResults: roundResultsOf(application, recruitment),
    totalScore: totalScoreOf(application),
    version: application.version,
  }
}

/** Đơn khớp bộ lọc vòng: đang chờ xét ở vòng, đã Đạt hoặc bị Loại ở vòng. */
export function matchesRound(application: DbApplication, roundId: string, state: RoundState | null): boolean {
  const result = resultAt(application, roundId)
  if (state === 'PENDING') return currentRoundOf(application) === roundId
  if (state === 'PASSED') return result?.result === 'PASS'
  if (state === 'FAILED') return result?.result === 'FAIL'
  return currentRoundOf(application) === roundId || result !== undefined
}

export function roundStatsOf(recruitment: DbRecruitment): RoundStat[] {
  const applications = db.applications.filter((application) => application.recruitmentId === recruitment.id)
  return recruitment.rounds.map((round) => ({
    roundId: round.id,
    pending: applications.filter((application) => currentRoundOf(application, recruitment) === round.id).length,
    passed: applications.filter((application) => resultAt(application, round.id)?.result === 'PASS').length,
    failed: applications.filter((application) => resultAt(application, round.id)?.result === 'FAIL').length,
  }))
}

/** Ghi hoặc sửa kết quả vòng; Loại thì đơn thành Bị loại, Đạt (kể cả sửa từ Loại) thì đơn về Đã nộp. */
export function setRoundResult(application: DbApplication, roundId: string, input: Omit<DbRoundResult, 'roundId' | 'at'>): void {
  const entry: DbRoundResult = { roundId, at: nowIso(), ...input }
  const recruitment = recruitmentOf(application)
  const kept = application.roundResults.filter((result) => result.roundId !== roundId)
  application.roundResults = [...kept, entry].toSorted((a, b) => recruitment.rounds.findIndex((round) => round.id === a.roundId) - recruitment.rounds.findIndex((round) => round.id === b.roundId))
  application.status = input.result === 'FAIL' ? 'ELIMINATED' : 'SUBMITTED'
  application.version += 1
}

export function toApplicationDetail(application: DbApplication): ApplicationDetail {
  return { ...toApplicationSummary(application), answers: answersOf(application, recruitmentOf(application)), studentId: application.studentId, withdrawnAt: application.withdrawnAt }
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
