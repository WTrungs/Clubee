import type { PermissionKey } from '@/features/org/model/permissionTypes'
import { db, type DbPosition, type PositionRole } from './db'
import { problem } from './mockHttp'
import { BOARD_ROLES, DEPARTMENT_ROLES, EVENT_STAFF_ACTIVE, isPositionEffective, positionsIn, positionTitles } from './mockPermissions'

/** Phạm vi của tài nguyên đang thao tác (SRS 3.1); mặc định là cả CLB. */
export type AccessScope =
  | { type: 'CLUB' }
  | { type: 'DEPARTMENT'; id: string }
  | { type: 'EVENT'; id: string }
  | { type: 'SUBCOMMITTEE'; id: string }

const CLUB_SCOPE: AccessScope = { type: 'CLUB' }

/** Ô của ma trận: bật hoặc tắt mặc định, và có khóa cứng không (BR-ACL-04, 05). Thiếu ô là quyền vô nghĩa với phạm vi của chức vụ (BR-ACL-02). */
export interface PermissionCell {
  enabled: boolean
  locked: boolean
}

export const MATRIX_ROLES: PositionRole[] = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD', 'EVENT_LEAD', 'SUBCOMMITTEE_LEAD']

const on: PermissionCell = { enabled: true, locked: false }
const off: PermissionCell = { enabled: false, locked: false }
const lockedOn: PermissionCell = { enabled: true, locked: true }
const lockedOff: PermissionCell = { enabled: false, locked: true }

const board = { PRESIDENT: on, VICE_PRESIDENT: on, TREASURER: on }
const departmentLeads = { DEPARTMENT_HEAD: on, DEPARTMENT_VICE_HEAD: on }

/** Quyền mặc định theo SRS 3.2; ma trận của từng CLB chỉ lưu các ô khác mặc định. */
export const DEFAULT_MATRIX: Record<PermissionKey, Partial<Record<PositionRole, PermissionCell>>> = {
  CONFIGURE_CLUB: board,
  MANAGE_TERMS: board,
  MANAGE_DEPARTMENTS: board,
  ASSIGN_POSITIONS: { ...board, PRESIDENT: lockedOn },
  EDIT_PERMISSIONS: { PRESIDENT: lockedOn, VICE_PRESIDENT: on },
  MANAGE_MEMBERS: board,
  CREATE_EVENT: board,
  APPROVE_EVENT: board,
  RUN_EVENT: { ...board, EVENT_LEAD: on },
  MANAGE_EVENT_STAFF: { ...board, EVENT_LEAD: on, SUBCOMMITTEE_LEAD: on },
  ASSIGN_TASK: { ...board, ...departmentLeads, EVENT_LEAD: on, SUBCOMMITTEE_LEAD: on },
  MANAGE_SESSIONS: { ...board, ...departmentLeads },
  SEND_ANNOUNCEMENT: { ...board, ...departmentLeads, EVENT_LEAD: on },
  PROPOSE_EXPENSE: { ...board, ...departmentLeads, EVENT_LEAD: on },
  APPROVE_EXPENSE: { ...board, EVENT_LEAD: lockedOff },
  RECORD_LEDGER: { PRESIDENT: off, VICE_PRESIDENT: off, TREASURER: on },
}

export function defaultCell(role: PositionRole, permission: PermissionKey): PermissionCell | undefined {
  return DEFAULT_MATRIX[permission][role]
}

/** Chức vụ có quyền này ở CLB hay không: ô khóa luôn theo mặc định, ô khác theo ma trận của CLB nếu đã sửa. */
export function roleAllows(clubId: string, role: PositionRole, permission: PermissionKey): boolean {
  const cell = defaultCell(role, permission)
  if (!cell) return false
  if (cell.locked) return cell.enabled
  const override = db.permissionOverrides.find((candidate) => candidate.clubId === clubId && candidate.role === role && candidate.permission === permission)
  return override ? override.enabled : cell.enabled
}

const eventOf = (eventId: string | undefined) => db.events.find((event) => event.id === eventId)
const eventOfSubcommittee = (subcommitteeId: string) => db.subcommittees.find((subcommittee) => subcommittee.id === subcommitteeId)?.eventId
const eventActive = (eventId: string | undefined) => {
  const event = eventOf(eventId)
  return event !== undefined && EVENT_STAFF_ACTIVE.includes(event.status)
}

/** Phạm vi phải thuộc đúng CLB đang xét, để ban chủ nhiệm CLB A không chạm được ban, sự kiện của CLB B (BR-SEC-01). */
function scopeInClub(clubId: string, scope: AccessScope): boolean {
  if (scope.type === 'CLUB') return true
  if (scope.type === 'DEPARTMENT') return db.departments.some((department) => department.id === scope.id && department.clubId === clubId)
  const eventId = scope.type === 'EVENT' ? scope.id : eventOfSubcommittee(scope.id)
  return eventOf(eventId)?.clubId === clubId
}

/** Quyền ở phạm vi cha có hiệu lực xuống phạm vi con, không ngược lại hay ngang hàng (SRS 3.1, BR-ACL-02). */
function covers(position: DbPosition, scope: AccessScope): boolean {
  if (BOARD_ROLES.includes(position.role)) return true
  if (DEPARTMENT_ROLES.includes(position.role)) return scope.type === 'DEPARTMENT' && scope.id === position.scopeId
  // Chức vụ sự kiện chỉ có hiệu lực khi sự kiện từ Đã duyệt đến trước Đã đóng, Đã hủy (SRS 4.2).
  if (position.role === 'EVENT_LEAD') {
    if (!eventActive(position.scopeId)) return false
    return (scope.type === 'EVENT' && scope.id === position.scopeId) || (scope.type === 'SUBCOMMITTEE' && eventOfSubcommittee(scope.id) === position.scopeId)
  }
  return scope.type === 'SUBCOMMITTEE' && scope.id === position.scopeId && eventActive(eventOfSubcommittee(position.scopeId))
}

/** Chức vụ sự kiện chỉ còn tác dụng khi sự kiện của nó còn hoạt động. */
function live(position: DbPosition): boolean {
  if (position.role === 'EVENT_LEAD') return eventActive(position.scopeId)
  if (position.role === 'SUBCOMMITTEE_LEAD') return eventActive(eventOfSubcommittee(position.scopeId))
  return true
}

/** Một chức vụ còn hiệu lực của người này có quyền và phạm vi chứa tài nguyên (SRS 3.1: hợp quyền của các chức vụ). */
export function can(userId: string, clubId: string, permission: PermissionKey, scope: AccessScope = CLUB_SCOPE): boolean {
  if (!scopeInClub(clubId, scope)) return false
  return positionsIn(userId, clubId).some((position) => roleAllows(clubId, position.role, permission) && covers(position, scope))
}

/** Có quyền ở bất kỳ phạm vi nào của CLB, có thể giới hạn theo chức vụ (ví dụ Trưởng ban, Phó ban đề xuất chi từ Quỹ chung). */
export function canAnywhere(userId: string, clubId: string, permission: PermissionKey, roles: PositionRole[] = MATRIX_ROLES): boolean {
  return positionsIn(userId, clubId).some((position) => roles.includes(position.role) && roleAllows(clubId, position.role, permission) && live(position))
}

/** Những người đang có quyền ở phạm vi, để gửi thông báo cần duyệt, chờ ghi sổ. */
export function holdersOf(clubId: string, permission: PermissionKey, scope: AccessScope = CLUB_SCOPE): string[] {
  if (!scopeInClub(clubId, scope)) return []
  const userIds = db.positions
    .filter((position) => position.clubId === clubId && isPositionEffective(position) && roleAllows(clubId, position.role, permission) && covers(position, scope))
    .map((position) => position.userId)
  return [...new Set(userIds)]
}

/** Chức vụ nào có phạm vi chứa được một loại phạm vi, để câu báo không nêu chức vụ không bao giờ với tới. */
const ROLES_REACHING: Record<AccessScope['type'], PositionRole[]> = {
  CLUB: BOARD_ROLES,
  DEPARTMENT: [...BOARD_ROLES, ...DEPARTMENT_ROLES],
  EVENT: [...BOARD_ROLES, 'EVENT_LEAD'],
  SUBCOMMITTEE: [...BOARD_ROLES, 'EVENT_LEAD', 'SUBCOMMITTEE_LEAD'],
}

/** Tên nhóm chức vụ đang có quyền, ví dụ "ban chủ nhiệm" hoặc "Chủ nhiệm, Phó chủ nhiệm hoặc Trưởng ban". */
export function rolesPhrase(roles: PositionRole[]): string {
  const wholeBoard = BOARD_ROLES.every((role) => roles.includes(role))
  const parts = [...(wholeBoard ? ['ban chủ nhiệm'] : []), ...roles.filter((role) => !wholeBoard || !BOARD_ROLES.includes(role)).map((role) => positionTitles[role])]
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} hoặc ${parts.at(-1) ?? ''}`
}

/** Câu 403 nêu đúng các chức vụ đang có quyền ở CLB theo ma trận hiện tại, trong số chức vụ với tới được loại phạm vi (IF-01). */
export function forbidden(clubId: string, permission: PermissionKey, what: string, scope: AccessScope = CLUB_SCOPE): Response {
  const roles = ROLES_REACHING[scope.type].filter((role) => roleAllows(clubId, role, permission))
  const detail = roles.length === 0 ? `Hiện không chức vụ nào ở CLB được ${what}.` : `Chỉ ${rolesPhrase(roles)} được ${what}.`
  return problem(403, detail, 'FORBIDDEN')
}
