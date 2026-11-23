import { http, HttpResponse } from 'msw'
import type { AuditLogEntry, AuditObjectType } from '@/features/report/model/auditLogTypes'
import { toVnDateKey } from '@/shared/format/formatDate'
import { db, type DbAuditLog } from '../db'
import { canAccessClub } from '../mockMembers'
import { API, currentUser, matchesKeyword, networkDelay, paginate, problem } from '../mockHttp'
import { isBoardMember } from '../mockPermissions'
import { isRealDate } from '../mockTime'

// FR-RPT-06: chỉ ban chủ nhiệm xem nhật ký của CLB; không có route sửa hay xóa (NFR-SEC-05).

const OBJECT_TYPES: AuditObjectType[] = ['ACCOUNT', 'CLUB', 'POSITION', 'PERMISSION', 'TRANSFER_REQUEST', 'MEMBERSHIP', 'TRANSACTION', 'ATTENDANCE', 'TERM', 'HANDOVER_ITEM']
const PAGE_SIZE = 50

function gate(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canAccessClub(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  if (!isBoardMember(userId, clubId)) return problem(403, 'Nhật ký thao tác chỉ ban chủ nhiệm xem được.', 'FORBIDDEN')
  return null
}

/** Nhật ký của CLB, mới nhất trước; thao tác của Admin chỉ có khi gắn với CLB này. */
const logsOf = (clubId: string) =>
  db.auditLogs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log.clubId === clubId)
    .toSorted((a, b) => b.log.at.localeCompare(a.log.at) || b.index - a.index)
    .map(({ log }) => log)

const toEntry = (log: DbAuditLog): AuditLogEntry => ({
  id: log.id,
  at: log.at,
  actor: { id: log.actorId, fullName: log.actorName },
  action: log.action,
  objectType: log.objectType,
  objectId: log.objectId,
  objectLabel: log.objectLabel,
  before: log.before,
  after: log.after,
  reason: log.reason,
  names: log.names,
})

export const auditHandlers = [
  http.get(`${API}/clubs/:clubId/audit-logs`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = gate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const actorId = url.searchParams.get('actorId')
    const objectType = url.searchParams.get('objectType')
    const objectId = url.searchParams.get('objectId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const errors = [
      ...(objectType && !OBJECT_TYPES.includes(objectType as AuditObjectType) ? [{ field: 'objectType', message: 'Loại đối tượng không có trong danh mục.' }] : []),
      ...(from && !isRealDate(from) ? [{ field: 'from', message: 'Ngày bắt đầu không hợp lệ.' }] : []),
      ...(to && !isRealDate(to) ? [{ field: 'to', message: 'Ngày kết thúc không hợp lệ.' }] : []),
      ...(from && to && isRealDate(from) && isRealDate(to) && from > to ? [{ field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Bộ lọc nhật ký chưa hợp lệ.', 'VALIDATION', errors)
    const rows = logsOf(clubId).filter((log) => {
      const day = toVnDateKey(log.at)
      return (
        (!actorId || log.actorId === actorId) &&
        (!objectType || log.objectType === objectType) &&
        (!objectId || log.objectId === objectId) &&
        (!from || day >= from) &&
        (!to || day <= to)
      )
    })
    return HttpResponse.json(paginate(rows.map(toEntry), url, PAGE_SIZE))
  }),

  http.get(`${API}/clubs/:clubId/audit-log-actors`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = gate(user.value.id, clubId)
    if (denied) return denied
    const q = new URL(request.url).searchParams.get('q') ?? ''
    // Kể cả người đã rời CLB; tên lấy theo lần ghi gần nhất.
    const actors = new Map<string, string>()
    for (const log of logsOf(clubId)) if (!actors.has(log.actorId)) actors.set(log.actorId, log.actorName)
    const rows = [...actors.entries()]
      .map(([id, fullName]) => ({ id, fullName }))
      .filter((actor) => matchesKeyword(actor.fullName, q))
      .toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
    return HttpResponse.json(rows)
  }),
]
