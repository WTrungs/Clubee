import type { FieldError } from '@/api/apiError'
import type { DepartmentResult, FinalDecision, FinalizeRequest, ProposalRow, ResultProposal } from '@/features/recruitment/model/recruitmentTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { RESPONSE_DAYS_DEFAULT, RESPONSE_DAYS_MAX, RESPONSE_DAYS_MIN } from '@/shared/lib/recruitmentRules'
import { db, type DbApplication, type DbMembership, type DbRecruitment } from './db'
import { newId } from './mockHttp'
import { openDepartmentStint, personRef, recordMembershipChange } from './mockMembers'
import { currentRoundOf, passedAllRounds, toApplicationSummary, totalScoreOf } from './mockApplications'
import { applicationTarget, notify, recruitmentTarget } from './mockNotifications'
import { boardMembersOf } from './mockPermissions'
import { registerJob, SYSTEM_ACTOR } from './mockSchedule'
import { addDays, nowIso, vnToday } from './mockTime'
import { blankMemberInfo } from './seed/memberSeed'

const departmentName = (id: string) => db.departments.find((department) => department.id === id)?.name ?? 'Ban'
const applicationsOf = (recruitment: DbRecruitment) => db.applications.filter((application) => application.recruitmentId === recruitment.id && application.status !== 'WITHDRAWN')

/** Đơn còn chờ xét ở một vòng nào đó thì chưa chốt được (422 `ROUNDS_INCOMPLETE`). */
export function finalizationBlockers(recruitment: DbRecruitment): string[] {
  const pending = applicationsOf(recruitment).filter((application) => currentRoundOf(application, recruitment) !== null)
  return pending.length > 0 ? [`Còn ${pending.length} đơn chưa xét xong các vòng.`] : []
}

/** Tổng điểm cao trước; bằng điểm thì đơn nộp trước đứng trước. */
const byRank = (a: DbApplication, b: DbApplication) => totalScoreOf(b) - totalScoreOf(a) || a.submittedAt.localeCompare(b.submittedAt)

/**
 * FR-REC-07 (quyết định 20/11): xếp đơn qua mọi vòng theo điểm; mỗi đơn vào nguyện vọng đầu tiên còn chỉ tiêu (Trúng tuyển);
 * hết chỉ tiêu ở mọi nguyện vọng thì Dự bị của nguyện vọng 1, tối đa bằng chỉ tiêu ban đó; còn lại và đơn bị loại là Trượt.
 */
export function proposeResults(recruitment: DbRecruitment): ProposalRow[] {
  const remaining = new Map(recruitment.quotas.map((quota) => [quota.departmentId, quota.quota]))
  const reserves = new Map<string, number>()
  const ranked = applicationsOf(recruitment).filter((application) => passedAllRounds(application, recruitment)).toSorted(byRank)
  const rows: ProposalRow[] = ranked.map((application, index) => {
    const admitted = application.choices.find((choice) => (remaining.get(choice) ?? 0) > 0)
    const base = { application: toApplicationSummary(application), rank: index + 1 }
    if (admitted) {
      remaining.set(admitted, (remaining.get(admitted) ?? 0) - 1)
      return { ...base, decision: 'ADMITTED', departmentId: admitted, reserveOrder: null }
    }
    const first = application.choices[0] ?? ''
    const quota = recruitment.quotas.find((candidate) => candidate.departmentId === first)?.quota ?? 0
    const order = (reserves.get(first) ?? 0) + 1
    if (order <= quota) {
      reserves.set(first, order)
      return { ...base, decision: 'RESERVE', departmentId: first, reserveOrder: order }
    }
    return { ...base, decision: 'NOT_ADMITTED', departmentId: null, reserveOrder: null }
  })
  const others = applicationsOf(recruitment)
    .filter((application) => !passedAllRounds(application, recruitment))
    .toSorted(byRank)
    .map((application): ProposalRow => ({ application: toApplicationSummary(application), rank: null, decision: 'NOT_ADMITTED', departmentId: null, reserveOrder: null }))
  return [...rows, ...others]
}

export function resultProposal(recruitment: DbRecruitment): ResultProposal {
  return {
    blockers: finalizationBlockers(recruitment),
    quotas: recruitment.quotas.map((quota) => ({ ...quota, departmentName: departmentName(quota.departmentId) })),
    rows: proposeResults(recruitment),
    defaultResponseDays: RESPONSE_DAYS_DEFAULT,
    version: recruitment.version,
  }
}

const DECISIONS: FinalDecision[] = ['ADMITTED', 'RESERVE', 'NOT_ADMITTED']

/** Kiểm quyết định của ban chủ nhiệm: 422 `QUOTA_EXCEEDED` tách riêng khỏi lỗi 400 theo dòng. */
export function checkDecisions(recruitment: DbRecruitment, body: Partial<FinalizeRequest>): { errors: FieldError[]; overQuota: string[] } {
  const errors: FieldError[] = []
  const rows = Array.isArray(body.decisions) ? body.decisions : []
  const own = new Map(applicationsOf(recruitment).map((application) => [application.id, application]))
  const seen = new Set<string>()
  const admittedCount = new Map<string, number>()
  const reserveOrders = new Map<string, Set<number>>()
  rows.forEach((row, index) => {
    const at = (field: string) => `decisions[${index}].${field}`
    const application = typeof row?.applicationId === 'string' ? own.get(row.applicationId) : undefined
    if (!application || seen.has(application.id)) {
      errors.push({ field: at('applicationId'), message: 'Đơn không thuộc đợt này hoặc bị lặp.' })
      return
    }
    seen.add(application.id)
    if (!DECISIONS.includes(row.decision)) {
      errors.push({ field: at('decision'), message: 'Chọn Trúng tuyển, Dự bị hoặc Trượt.' })
      return
    }
    if (row.decision === 'NOT_ADMITTED') return
    if (!passedAllRounds(application, recruitment)) {
      errors.push({ field: at('decision'), message: 'Đơn chưa đạt mọi vòng nên chỉ có thể Trượt.' })
      return
    }
    const departmentId = typeof row.departmentId === 'string' ? row.departmentId : ''
    if (!application.choices.includes(departmentId)) {
      errors.push({ field: at('departmentId'), message: 'Ban phải nằm trong nguyện vọng của ứng viên.' })
      return
    }
    if (row.decision === 'ADMITTED') admittedCount.set(departmentId, (admittedCount.get(departmentId) ?? 0) + 1)
    else {
      const order = row.reserveOrder
      const used = reserveOrders.get(departmentId) ?? new Set<number>()
      if (typeof order !== 'number' || !Number.isInteger(order) || order < 1) errors.push({ field: at('reserveOrder'), message: 'Thứ tự dự bị là số nguyên từ 1.' })
      else if (used.has(order)) errors.push({ field: at('reserveOrder'), message: 'Thứ tự dự bị bị trùng trong ban.' })
      else {
        used.add(order)
        reserveOrders.set(departmentId, used)
      }
    }
  })
  for (const application of own.values()) {
    if (!seen.has(application.id)) errors.push({ field: 'decisions', message: 'Cần quyết định cho mọi đơn chưa rút.' })
  }
  const days = body.responseDays
  if (typeof days !== 'number' || !Number.isInteger(days) || days < RESPONSE_DAYS_MIN || days > RESPONSE_DAYS_MAX) {
    errors.push({ field: 'responseDays', message: `Số ngày nhận kết quả từ ${RESPONSE_DAYS_MIN} đến ${RESPONSE_DAYS_MAX}.` })
  }
  const overQuota = recruitment.quotas.filter((quota) => (admittedCount.get(quota.departmentId) ?? 0) > quota.quota).map((quota) => departmentName(quota.departmentId))
  return { errors: [...new Map(errors.map((error) => [`${error.field}|${error.message}`, error])).values()], overQuota }
}

const RESULT_TEXT: Record<FinalDecision, string> = { ADMITTED: 'Trúng tuyển', RESERVE: 'Dự bị', NOT_ADMITTED: 'Chưa trúng tuyển' }

/** Ghi kết quả, hạn nhận cho người Trúng tuyển, báo từng ứng viên và ban chủ nhiệm (FR-REC-07). */
export function finalizeRecruitment(recruitment: DbRecruitment, body: FinalizeRequest, actorId: string): void {
  const respondBy = addDays(nowIso(), body.responseDays)
  for (const row of body.decisions) {
    const application = db.applications.find((candidate) => candidate.id === row.applicationId) as DbApplication
    application.status = row.decision
    application.outcome = {
      departmentId: row.decision === 'NOT_ADMITTED' ? null : row.departmentId,
      reserveOrder: row.decision === 'RESERVE' ? row.reserveOrder : null,
      respondBy: row.decision === 'ADMITTED' ? respondBy : null,
    }
    application.version += 1
    const department = application.outcome.departmentId ? departmentName(application.outcome.departmentId) : null
    const detail =
      row.decision === 'ADMITTED'
        ? `Bạn trúng tuyển vào ban ${department}. Nhận kết quả trước ${formatDateTime(respondBy)}.`
        : row.decision === 'RESERVE'
          ? `Bạn ở danh sách dự bị của ban ${department}, thứ tự ${row.reserveOrder}. CLB sẽ báo nếu có chỗ.`
          : 'Cảm ơn bạn đã ứng tuyển. Lần này bạn chưa trúng tuyển.'
    notify([application.userId], {
      clubId: recruitment.clubId,
      category: 'RECRUITMENT',
      title: `${recruitment.name}: ${RESULT_TEXT[row.decision]}`,
      body: detail,
      target: applicationTarget(recruitment.id),
      actorId,
    })
  }
  recruitment.finalizedAt = nowIso()
  recruitment.responseDays = body.responseDays
  recruitment.version += 1
  const admitted = body.decisions.filter((row) => row.decision === 'ADMITTED').length
  notify(boardMembersOf(recruitment.clubId), {
    clubId: recruitment.clubId,
    category: 'RECRUITMENT',
    title: `Đã chốt kết quả ${recruitment.name}`,
    body: `${admitted} người trúng tuyển, hạn nhận kết quả ${formatDateTime(respondBy)}.`,
    target: recruitmentTarget(recruitment.clubId, recruitment.id),
    actorId,
  })
}

const isPendingAdmission = (application: DbApplication) => application.status === 'ADMITTED'

/** FR-REC-08: tình hình nhận kết quả theo ban; chỗ trống = chỉ tiêu − (đang chờ trả lời + đã nhận). */
export function departmentResultsOf(recruitment: DbRecruitment): DepartmentResult[] {
  const inRecruitment = db.applications.filter((application) => application.recruitmentId === recruitment.id)
  return recruitment.quotas.map((quota) => {
    const of = (status: DbApplication['status']) => inRecruitment.filter((application) => application.status === status && application.outcome?.departmentId === quota.departmentId).length
    const pending = of('ADMITTED')
    const accepted = of('ACCEPTED')
    return {
      departmentId: quota.departmentId,
      departmentName: departmentName(quota.departmentId),
      quota: quota.quota,
      pending,
      accepted,
      declined: of('DECLINED'),
      reserves: of('RESERVE'),
      freeSlots: Math.max(0, quota.quota - pending - accepted),
    }
  })
}

/** Còn hạn nhận kết quả. */
export const canRespond = (application: DbApplication) =>
  isPendingAdmission(application) && application.outcome?.respondBy !== null && Date.parse(application.outcome?.respondBy ?? '') >= Date.now()

/** Lý do không nhận được dù còn hạn: đang có tư cách khác ở CLB, hoặc ban trúng tuyển đã đóng. */
export function admissionBlocker(application: DbApplication): { code: string; message: string } | null {
  const current = db.memberships.find(
    (membership) => membership.userId === application.userId && membership.clubId === application.clubId && ['PROBATION', 'ACTIVE', 'ON_LEAVE'].includes(membership.status),
  )
  if (current) return { code: 'ALREADY_MEMBER', message: 'Bạn đang là thành viên CLB này nên không nhận kết quả được nữa.' }
  const department = db.departments.find((candidate) => candidate.id === application.outcome?.departmentId)
  if (!department || department.status !== 'ACTIVE') return { code: 'DEPARTMENT_CLOSED', message: 'Ban trúng tuyển đã đóng; liên hệ ban chủ nhiệm CLB.' }
  return null
}

/** Nhận: tạo tư cách (Thử việc hoặc Chính thức theo `probationStep`) với ban trúng tuyển, MSSV từ đơn; yêu cầu gia nhập Chờ duyệt thì duyệt luôn. */
export function respondToAdmission(application: DbApplication, decision: 'ACCEPT' | 'DECLINE', actorId: string): DbMembership | null {
  const recruitment = db.recruitments.find((candidate) => candidate.id === application.recruitmentId) as DbRecruitment
  application.status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'
  application.version += 1
  const board = boardMembersOf(application.clubId)
  const name = personRef(application.userId).fullName
  const target = recruitmentTarget(application.clubId, recruitment.id)
  if (decision === 'DECLINE') {
    notify(board, { clubId: application.clubId, category: 'RECRUITMENT', title: `${name} từ chối nhận kết quả ${recruitment.name}`, body: 'Có thể gọi người dự bị kế tiếp của ban.', target, actorId })
    return null
  }
  const club = db.clubs.find((candidate) => candidate.id === application.clubId)
  const toStatus = club?.probationStep === false ? 'ACTIVE' : 'PROBATION'
  const departmentId = application.outcome?.departmentId ?? ''
  const pending = db.memberships.find((membership) => membership.userId === application.userId && membership.clubId === application.clubId && membership.status === 'PENDING')
  const membership: DbMembership = pending ?? {
    id: newId('m'),
    userId: application.userId,
    clubId: application.clubId,
    status: 'PENDING',
    departmentId: null,
    departmentHistory: [],
    requestedAt: nowIso(),
    joinedOn: null,
    leftOn: null,
    exitKind: null,
    leaveReason: null,
    introduction: null,
    studentId: null,
    ...blankMemberInfo(),
    history: [],
    version: 1,
  }
  if (!pending) db.memberships.push(membership)
  membership.status = toStatus
  membership.joinedOn = vnToday()
  if (application.studentId) membership.studentId = application.studentId
  openDepartmentStint(membership, departmentId, vnToday(), actorId)
  recordMembershipChange(membership, { actorId, fromStatus: pending ? 'PENDING' : null, toStatus, reason: `Trúng tuyển ${recruitment.name}.` })
  if (pending) membership.version += 1
  notify(board, { clubId: application.clubId, category: 'RECRUITMENT', title: `${name} đã nhận kết quả ${recruitment.name}`, body: `Vào ban ${departmentName(departmentId)}.`, target, actorId })
  return membership
}

/** Việc theo giờ: Trúng tuyển quá hạn nhận thành Từ chối nhận, báo ứng viên và ban chủ nhiệm (FR-REC-08). */
export function expireAdmissions(): void {
  const now = Date.now()
  for (const application of db.applications) {
    if (!isPendingAdmission(application) || !application.outcome?.respondBy || Date.parse(application.outcome.respondBy) >= now) continue
    const recruitment = db.recruitments.find((candidate) => candidate.id === application.recruitmentId)
    if (!recruitment) continue
    application.status = 'DECLINED'
    application.version += 1
    const name = personRef(application.userId).fullName
    notify([application.userId], {
      clubId: application.clubId,
      category: 'RECRUITMENT',
      title: `Đã quá hạn nhận kết quả ${recruitment.name}`,
      body: 'Ban chủ nhiệm có thể gọi người dự bị vào suất này.',
      target: applicationTarget(recruitment.id),
      actorId: SYSTEM_ACTOR,
    })
    notify(boardMembersOf(application.clubId), {
      clubId: application.clubId,
      category: 'RECRUITMENT',
      title: `${name} quá hạn nhận kết quả ${recruitment.name}`,
      body: 'Có thể gọi người dự bị kế tiếp của ban.',
      target: recruitmentTarget(application.clubId, recruitment.id),
      actorId: SYSTEM_ACTOR,
    })
  }
}
registerJob('recruitmentAdmissionExpiry', expireAdmissions)

/** Gọi người Dự bị có thứ tự nhỏ nhất của ban vào chỗ trống, với hạn nhận mới. */
export function callNextReserve(recruitment: DbRecruitment, departmentId: string, actorId: string): DbApplication {
  const next = db.applications
    .filter((application) => application.recruitmentId === recruitment.id && application.status === 'RESERVE' && application.outcome?.departmentId === departmentId)
    .toSorted((a, b) => (a.outcome?.reserveOrder ?? 0) - (b.outcome?.reserveOrder ?? 0))[0] as DbApplication
  const respondBy = addDays(nowIso(), recruitment.responseDays ?? RESPONSE_DAYS_DEFAULT)
  next.status = 'ADMITTED'
  next.outcome = { departmentId, reserveOrder: null, respondBy }
  next.version += 1
  recruitment.version += 1
  notify([next.userId], {
    clubId: recruitment.clubId,
    category: 'RECRUITMENT',
    title: `${recruitment.name}: Trúng tuyển từ danh sách dự bị`,
    body: `Bạn trúng tuyển vào ban ${departmentName(departmentId)}. Nhận kết quả trước ${formatDateTime(respondBy)}.`,
    target: applicationTarget(recruitment.id),
    actorId,
  })
  return next
}
