import type { EventStatus } from '@/features/event/model/eventTypes'
import { positionAuditLabel } from './auditLabels'
import { db, type DbPosition, type PositionRole } from './db'
import { audit } from './mockAudit'
import { newId } from './mockHttp'
import { membershipOf } from './mockMembers'
import { nowIso, shiftDate, vnToday } from './mockTime'
import { positionTitles } from './seed/orgSeed'

export { positionTitles }

/** Tính quyền giống máy chủ (SRS 3): chức vụ còn hiệu lực, phạm vi và trạng thái thành viên tại thời điểm truy cập. */
export const BOARD_ROLES: PositionRole[] = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER']
export const DEPARTMENT_ROLES: PositionRole[] = ['DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD']
/** Chức vụ thường trực theo nhiệm kỳ (BR-ORG-01, BR-MEM-05). */
export const STANDING_ROLES: PositionRole[] = [...BOARD_ROLES, ...DEPARTMENT_ROLES]
/** Chức vụ trong sự kiện có hiệu lực từ Đã duyệt đến trước Đã đóng, Đã hủy (SRS 4.2, BR-ORG-03). */
export const EVENT_STAFF_ACTIVE: EventStatus[] = ['APPROVED', 'REGISTRATION_OPEN', 'ONGOING', 'ENDED']

/** Ngày hiệu lực cuối thật sự, null là chưa có hạn: chức vụ hết hạn cùng nhiệm kỳ chưa đóng thì giữ tới khi bàn giao xong (BR-TERM-02). */
export function effectiveEndOf(position: DbPosition, day: string = vnToday()): string | null {
  if (position.endOn === null || position.revokedAt !== null || !STANDING_ROLES.includes(position.role)) return position.endOn
  const term = currentTermOf(position.clubId)
  return term && position.endOn === term.endOn && day > term.endOn ? null : position.endOn
}

/** Trong thời hạn: từ ngày bắt đầu đến hết ngày hiệu lực cuối. */
export function isPositionActive(position: DbPosition, day: string = vnToday()): boolean {
  const end = effectiveEndOf(position, day)
  return position.startOn <= day && (end === null || day <= end)
}

/** Người giữ phải còn đủ tư cách; trưởng tiểu ban được là nhân sự CLB đồng tổ chức (BR-ORG-01, BR-MEM-04, BR-MEM-05). */
function holderEligible(position: DbPosition): boolean {
  const status = membershipOf(position.userId, position.clubId)?.status
  if (STANDING_ROLES.includes(position.role)) return status === 'ACTIVE'
  if (status === 'ACTIVE' || status === 'PROBATION') return true
  return (
    position.role === 'SUBCOMMITTEE_LEAD' &&
    db.eventStaff.some((staff) => staff.subcommitteeId === position.scopeId && staff.userId === position.userId && staff.kind === 'CO_HOST' && staff.leftAt === null)
  )
}

/** Chức vụ hiện ở màn Cơ cấu: đang hoặc sắp có hiệu lực, người giữ còn đủ tư cách; chỉ chức vụ đang hiệu lực mới cho quyền. */
export function isPositionListed(position: DbPosition): boolean {
  return isPositionOpen(position) && holderEligible(position)
}

/** Chức vụ đang cho quyền: trong thời hạn và người giữ còn đủ tư cách (SRS 3). */
export function isPositionEffective(position: DbPosition): boolean {
  return isPositionActive(position) && holderEligible(position)
}

export function positionsIn(userId: string, clubId: string): DbPosition[] {
  return db.positions.filter((position) => position.userId === userId && position.clubId === clubId && isPositionEffective(position))
}

export function isBoardMember(userId: string, clubId: string): boolean {
  return positionsIn(userId, clubId).some((position) => BOARD_ROLES.includes(position.role))
}

export const PRESIDENCY_ROLES: PositionRole[] = ['PRESIDENT', 'VICE_PRESIDENT']

/** Mốc xa nhất để so ngày dạng yyyy-mm-dd; chức vụ chưa có hạn coi như kéo tới đây. */
export const NO_END = '9999-12-31'

/** Làm rõ SRS 3.2 cho giữa nhiệm kỳ: chỉ Chủ nhiệm, Phó chủ nhiệm đang giữ chức gán được hai chức này (nhóm chốt ngày 05/11). */
export function isPresidency(userId: string, clubId: string): boolean {
  return positionsIn(userId, clubId).some((position) => PRESIDENCY_ROLES.includes(position.role))
}

export function hasPosition(userId: string, role: PositionRole, scopeId: string): boolean {
  return db.positions.some((position) => position.userId === userId && position.role === role && position.scopeId === scopeId && isPositionEffective(position))
}

/** Người đang giữ một chức vụ ở một phạm vi; `includeEnded` trả cả người giữ gần nhất để hiện lịch sử. */
export function positionHolderOf(role: PositionRole, scopeId: string, { includeEnded = false } = {}): string | null {
  // Bỏ chức vụ đã hủy trước khi có hiệu lực (ngày cuối trước ngày bắt đầu) vì người đó chưa từng giữ chức.
  const held = db.positions.filter((position) => position.role === role && position.scopeId === scopeId && (position.endOn === null || position.endOn >= position.startOn))
  const active = held.find((position) => isPositionEffective(position))
  if (active) return active.userId
  if (!includeEnded) return null
  return held.toSorted((a, b) => b.startOn.localeCompare(a.startOn))[0]?.userId ?? null
}

/** Tên chức vụ hiển thị, kèm tên ban với chức vụ cấp ban. */
export function positionTitleOf(position: DbPosition): string {
  const department = db.departments.find((candidate) => candidate.id === position.scopeId)
  return department ? `${positionTitles[position.role]} ${department.name}` : positionTitles[position.role]
}

export function positionTitlesOf(userId: string, clubId: string): string[] {
  return positionsIn(userId, clubId)
    .filter((position) => STANDING_ROLES.includes(position.role))
    .map(positionTitleOf)
}

/** BR-ORG-02: Chủ nhiệm còn lại (bỏ `exclude`, thêm phần còn giữ `extra`) phải phủ kín mọi ngày từ hôm nay đến hết nhiệm kỳ. */
export function presidentsCoverTerm(clubId: string, exclude: (position: DbPosition) => boolean, extra: Array<{ startOn: string; endOn: string }> = []): boolean {
  const term = currentTermOf(clubId)
  if (!term) return true
  // Nhiệm kỳ quá hạn thì chạy tới khi bàn giao xong, không biết ngày nào; chỉ chức vụ chưa có hạn mới phủ được.
  const today = vnToday()
  const horizon = today > term.endOn ? NO_END : term.endOn
  const intervals = [
    ...db.positions
      .filter((position) => position.clubId === clubId && position.role === 'PRESIDENT' && isPositionListed(position) && !exclude(position))
      .map((position) => ({ startOn: position.startOn, endOn: effectiveEndOf(position) ?? NO_END })),
    ...extra.filter((interval) => interval.startOn <= interval.endOn),
  ].toSorted((a, b) => a.startOn.localeCompare(b.startOn))
  let cursor = today
  for (const interval of intervals) {
    if (interval.endOn < cursor) continue
    if (interval.startOn > cursor) return false
    if (interval.endOn >= horizon) return true
    cursor = shiftDate(interval.endOn, 1)
  }
  return false
}

/** Nhiệm kỳ đang phụ trách CLB: Đang chạy hoặc Đang bàn giao; mỗi CLB có đúng một (BR-TERM-01, BR-TERM-02). */
export function currentTermOf(clubId: string) {
  return db.terms.find((term) => term.clubId === clubId && (term.status === 'RUNNING' || term.status === 'HANDING_OVER'))
}

export interface GrantPositionInput {
  userId: string
  clubId: string
  role: PositionRole
  scopeId: string
  assignedBy: string
  startOn?: string
  endOn?: string | null
}

export function grantPosition(input: GrantPositionInput): DbPosition {
  // Chức vụ thường trực mặc định hết cùng nhiệm kỳ, chức vụ sự kiện hết khi sự kiện đóng (BR-ORG-03).
  const defaultEnd = STANDING_ROLES.includes(input.role) ? (currentTermOf(input.clubId)?.endOn ?? null) : null
  const position: DbPosition = {
    id: newId('p'),
    userId: input.userId,
    clubId: input.clubId,
    role: input.role,
    scopeId: input.scopeId,
    startOn: input.startOn ?? vnToday(),
    endOn: input.endOn === undefined ? defaultEnd : input.endOn,
    assignedBy: input.assignedBy,
    revokedAt: null,
    revokeReason: null,
    version: 1,
  }
  db.positions.push(position)
  audit({
    actorId: input.assignedBy,
    clubId: input.clubId,
    action: 'GRANT_POSITION',
    objectType: 'POSITION',
    objectId: position.id,
    objectLabel: positionAuditLabel(db, position),
    before: null,
    after: { startOn: position.startOn, endOn: position.endOn },
    reason: null,
  })
  return position
}

/** Chưa kết thúc: đang trong thời hạn hoặc đã gán nhưng chưa tới ngày bắt đầu; ngày cuối trước ngày bắt đầu là đã hủy trước khi có hiệu lực. */
export function isPositionOpen(position: DbPosition, day: string = vnToday()): boolean {
  const end = effectiveEndOf(position, day)
  return end === null || (end >= day && end >= position.startOn)
}

/** Kết thúc các chức vụ chưa hết hạn khớp điều kiện từ ngày chuyển giao; bản ghi giữ lại kèm lý do (BR-DATA-01, BR-DATA-03). */
export function endPositions(
  matches: (position: DbPosition) => boolean,
  { reason, actorId, handoverOn = vnToday() }: { reason: string; actorId: string; handoverOn?: string },
): DbPosition[] {
  const ended = db.positions.filter((position) => matches(position) && isPositionOpen(position))
  for (const position of ended) {
    // Ngày hiệu lực cuối là trước ngày chuyển giao, không kéo dài quá hạn cũ; chuyển giao không muộn hơn ngày bắt đầu thì chức vụ bị hủy hẳn.
    const lastDay = shiftDate(handoverOn, -1)
    const end = effectiveEndOf(position)
    const before = { endOn: position.endOn }
    position.endOn = end !== null && end < lastDay ? end : lastDay
    position.revokedAt = nowIso()
    position.revokeReason = reason
    position.version += 1
    audit({
      actorId,
      clubId: position.clubId,
      action: 'END_POSITION',
      objectType: 'POSITION',
      objectId: position.id,
      objectLabel: positionAuditLabel(db, position),
      before,
      after: { endOn: position.endOn },
      reason,
    })
  }
  return ended
}
