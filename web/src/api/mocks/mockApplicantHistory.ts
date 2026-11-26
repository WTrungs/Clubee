import type { ApplicantHistory, ApplicantPriorFlags, ApplicationOutcome, PriorApplication } from '@/features/recruitment/model/recruitmentTypes'
import { db, type DbApplication } from './db'

const departmentName = (id: string | null) => (id ? (db.departments.find((department) => department.id === id)?.name ?? 'Ban') : null)

function outcomeOf(application: DbApplication): ApplicationOutcome | null {
  if (!application.outcome) return null
  return { ...application.outcome, departmentName: departmentName(application.outcome.departmentId) }
}

const otherApplications = (application: DbApplication) =>
  db.applications
    .filter((candidate) => candidate.userId === application.userId && candidate.clubId === application.clubId && candidate.id !== application.id)
    .toSorted((a, b) => b.submittedAt.localeCompare(a.submittedAt))

const pastMemberships = (application: DbApplication) =>
  db.memberships
    .filter((membership) => membership.userId === application.userId && membership.clubId === application.clubId && membership.status === 'LEFT' && membership.exitKind !== null)
    .toSorted((a, b) => (b.leftOn ?? '').localeCompare(a.leftOn ?? ''))

function toPriorApplication(application: DbApplication): PriorApplication {
  const recruitment = db.recruitments.find((candidate) => candidate.id === application.recruitmentId)
  const roundName = (roundId: string) => recruitment?.rounds.find((round) => round.id === roundId)?.name ?? 'Vòng'
  const results = application.roundResults.map((result) => ({ roundName: roundName(result.roundId), result: result.result, score: result.score, note: result.note }))
  return {
    id: application.id,
    recruitment: { id: application.recruitmentId, name: recruitment?.name ?? 'Đợt tuyển' },
    submittedAt: application.submittedAt,
    status: application.status,
    roundResults: results,
    totalScore: results.reduce((sum, result) => sum + (result.result === 'PASS' ? (result.score ?? 0) : 0), 0),
    eliminationNote: results.find((result) => result.result === 'FAIL')?.note ?? null,
    outcome: outcomeOf(application),
  }
}

/** FR-REC-04: đơn khác của cùng người ở CLB này và các lần từng là thành viên đã kết thúc (bản ghi tư cách lưu lý do rời). */
export function applicantHistoryOf(application: DbApplication): ApplicantHistory {
  return {
    applications: otherApplications(application).map(toPriorApplication),
    memberships: pastMemberships(application).map((membership) => ({
      joinedOn: membership.joinedOn,
      leftOn: membership.leftOn,
      exitKind: membership.exitKind ?? 'RESIGNED',
      reason: membership.leaveReason,
    })),
  }
}

/** Tóm tắt cho nhãn "Ứng viên cũ"; null khi ứng viên chưa từng nộp đơn hay là thành viên CLB. */
export function priorFlagsOf(application: DbApplication): ApplicantPriorFlags | null {
  const applications = otherApplications(application)
  const memberships = pastMemberships(application)
  if (applications.length === 0 && memberships.length === 0) return null
  const failedApplication = applications.some((candidate) => candidate.status === 'ELIMINATED' || candidate.status === 'NOT_ADMITTED')
  const removed = memberships.some((membership) => membership.exitKind === 'REMOVED' || membership.exitKind === 'REJECTED')
  return {
    applications: applications.length,
    eliminated: failedApplication || removed,
    formerMember: memberships.some((membership) => membership.joinedOn !== null),
  }
}
