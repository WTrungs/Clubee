import type { AttendanceAbsenceNote } from '@/features/attendance/model/attendanceTypes'
import type { AbsenceDecision, AbsenceRequestRow, MyAbsenceRequest } from '@/features/attendance/model/sessionTypes'
import { db, type DbAbsenceRequest, type DbSession } from './db'
import { personRef } from './mockMembers'

/** Đơn còn hiệu lực: Chờ duyệt hoặc Đã duyệt; mỗi người mỗi buổi tối đa một đơn như vậy (FR-ATT-04). */
const isActive = (request: DbAbsenceRequest): request is DbAbsenceRequest & { status: AttendanceAbsenceNote['status'] } =>
  request.status === 'PENDING' || request.status === 'APPROVED'

export const activeAbsenceRequest = (userId: string, sessionId: string) =>
  db.absenceRequests.find((request) => request.userId === userId && request.sessionId === sessionId && isActive(request))

/** Đơn mới nhất của người gọi; đơn đó đã rút thì coi như không có, còn bị từ chối thì vẫn hiện kèm lý do. */
export function latestAbsenceRequest(userId: string, sessionId: string): DbAbsenceRequest | undefined {
  const latest = db.absenceRequests
    .filter((request) => request.userId === userId && request.sessionId === sessionId)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || db.absenceRequests.indexOf(b) - db.absenceRequests.indexOf(a))[0]
  return latest?.status === 'WITHDRAWN' ? undefined : latest
}

export const approvedAbsentees = (sessionId: string) =>
  db.absenceRequests.filter((request) => request.sessionId === sessionId && request.status === 'APPROVED').map((request) => request.userId)

export const pendingAbsenceCount = (sessionId: string) => db.absenceRequests.filter((request) => request.sessionId === sessionId && request.status === 'PENDING').length

export function absenceNoteOf(userId: string, sessionId: string): AttendanceAbsenceNote | null {
  const request = db.absenceRequests.find((candidate) => candidate.userId === userId && candidate.sessionId === sessionId && isActive(candidate))
  return request && isActive(request) ? { status: request.status, reason: request.reason } : null
}

const decisionOf = (request: DbAbsenceRequest): AbsenceDecision | null =>
  request.decidedBy && request.decidedAt ? { by: personRef(request.decidedBy), at: request.decidedAt, note: request.decisionNote } : null

/** Rút được trước giờ bắt đầu khi đơn còn hiệu lực. */
export const canWithdrawAbsence = (request: DbAbsenceRequest, session: DbSession) =>
  isActive(request) && session.cancelledAt === null && Date.parse(session.startAt) > Date.now()

export function toMyAbsenceRequest(request: DbAbsenceRequest, session: DbSession): MyAbsenceRequest {
  return {
    id: request.id,
    status: request.status,
    reason: request.reason,
    createdAt: request.createdAt,
    decision: decisionOf(request),
    allowedActions: canWithdrawAbsence(request, session) ? ['WITHDRAW'] : [],
    version: request.version,
  }
}

/** `decidable`: buổi chưa hủy và chưa chốt điểm danh; sau khi chốt thì sửa qua điểm danh (FR-ATT-08). */
export function toAbsenceRequestRow(request: DbAbsenceRequest, decidable: boolean): AbsenceRequestRow {
  return {
    id: request.id,
    requester: personRef(request.userId),
    status: request.status,
    reason: request.reason,
    createdAt: request.createdAt,
    decision: decisionOf(request),
    allowedActions: decidable && request.status === 'PENDING' ? ['DECIDE'] : [],
    version: request.version,
  }
}
